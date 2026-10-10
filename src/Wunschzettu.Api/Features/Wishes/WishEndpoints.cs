using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Features.Wishlists;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Wishes;

/// Managers and recipients edit wishes. Nothing here is blocked by gift state; givers get a mail instead (§6 no-leak).
public static class WishEndpoints
{
    public static void MapWishEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Wishes").RequireAuthorization(Policies.ConfirmedUser);

        group.MapPost("/wishlists/{listId:guid}/wishes", Create);
        group.MapPut("/wishlists/{listId:guid}/wishes/order", Reorder);
        group.MapPut("/wishes/{id:guid}", Update);
        group.MapDelete("/wishes/{id:guid}", Delete);
        group.MapPost("/wishes/{id:guid}/fulfil", (Guid id, ClaimsPrincipal user, AppDbContext db, GiftService gifts, TimeProvider clock,
            CancellationToken ct) => SetState(id, WishState.Fulfilled, user, db, gifts, clock, ct));
        group.MapDelete("/wishes/{id:guid}/fulfil", (Guid id, ClaimsPrincipal user, AppDbContext db, GiftService gifts, TimeProvider clock,
            CancellationToken ct) => SetState(id, WishState.Active, user, db, gifts, clock, ct));
    }

    static bool CanEdit(ListMember? m) => m is { IsManager: true } or { IsRecipient: true };

    static async Task<Results<Created<WishDto>, NotFound, ValidationProblem>> Create(Guid listId, WishRequest req, ClaimsPrincipal user,
        AppDbContext db, LinkPreviews previews, TimeProvider clock, CancellationToken ct)
    {
        if (ValidateLinks(req.Links) is { } errors) return TypedResults.ValidationProblem(errors);
        var member = await db.FindMembershipAsync(listId, user.RequiredUserId(), ct);
        if (!CanEdit(member)) return TypedResults.NotFound();

        var maxSort = await db.Wishes.Where(w => w.WishlistId == listId).MaxAsync(w => (int?)w.SortOrder, ct) ?? -1;
        var now = clock.GetUtcNow().UtcDateTime;
        var wish = new Wish { Name = "", WishlistId = listId, SortOrder = maxSort + 1, CreatedAt = now };
        Apply(wish, req);
        await previews.ReplaceLinksAsync(wish, req.Links ?? [], ct);
        db.Wishes.Add(wish);
        member!.Wishlist.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/wishes/{wish.Id}", WishDto.From(wish));
    }

    static async Task<Results<Ok<WishDto>, NotFound, ValidationProblem>> Update(Guid id, WishRequest req, ClaimsPrincipal user,
        AppDbContext db, GiftService gifts, LinkPreviews previews, TimeProvider clock, CancellationToken ct)
    {
        if (ValidateLinks(req.Links) is { } errors) return TypedResults.ValidationProblem(errors);
        var wish = await LoadEditableAsync(id, user, db, ct, details: true);
        if (wish is null) return TypedResults.NotFound();

        var giversCare = wish.Name != req.Name.Trim() || wish.Price != req.Price || wish.Quantity != req.Quantity;
        if (giversCare) await gifts.NotifyGiversAsync(wish, WishChange.Changed, ct);
        Apply(wish, req);
        var unused = await previews.ReplaceLinksAsync(wish, req.Links ?? [], ct);
        wish.Wishlist.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesEditWinsAsync(ct);
        previews.DeleteImages(unused);
        return TypedResults.Ok(WishDto.From(wish));
    }

    /// A wish with gifts becomes Removed: givers still see it as "nicht mehr nötig", for everyone else it is gone (§6).
    /// Its pictures go either way: whether the recipient's old image URLs still answered would tell them it was taken.
    static async Task<Results<NoContent, NotFound>> Delete(Guid id, ClaimsPrincipal user, AppDbContext db, GiftService gifts,
        ImageStore images, TimeProvider clock, CancellationToken ct)
    {
        var wish = await LoadEditableAsync(id, user, db, ct, details: true);
        if (wish is null) return TypedResults.NotFound();

        var files = wish.Images.Select(i => i.FileKey).Concat(wish.Links.Select(l => l.PreviewImageKey).OfType<string>()).ToList();
        wish.Wishlist.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        if (await db.Gifts.AnyAsync(g => g.WishId == wish.Id, ct))
        {
            if (await db.Gifts.AnyAsync(g => g.WishId == wish.Id && g.ArchivedAt == null, ct))
                await gifts.NotifyGiversAsync(wish, WishChange.Removed, ct);
            wish.State = WishState.Removed;
            db.WishImages.RemoveRange(wish.Images);
            foreach (var link in wish.Links) link.PreviewImageKey = null;
            await db.SaveChangesEditWinsAsync(ct);
        }
        else
        {
            db.Wishes.Remove(wish);
            await db.SaveChangesAsync(ct);
        }
        foreach (var key in files) images.Delete(key);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound>> SetState(Guid id, WishState state, ClaimsPrincipal user, AppDbContext db,
        GiftService gifts, TimeProvider clock, CancellationToken ct)
    {
        var wish = await LoadEditableAsync(id, user, db, ct);
        if (wish is null) return TypedResults.NotFound();

        if (state == WishState.Fulfilled && wish.State != WishState.Fulfilled)
            await gifts.NotifyGiversAsync(wish, WishChange.Fulfilled, ct);
        wish.State = state;
        wish.Wishlist.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesEditWinsAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Reorder(Guid listId, List<Guid> ids, ClaimsPrincipal user,
        AppDbContext db, CancellationToken ct)
    {
        var member = await db.FindMembershipAsync(listId, user.RequiredUserId(), ct);
        if (!CanEdit(member)) return TypedResults.NotFound();

        var wishes = await db.Wishes.Where(w => w.WishlistId == listId && w.State != WishState.Removed).ToListAsync(ct);
        if (ids.Count != wishes.Count || !wishes.Select(w => w.Id).ToHashSet().SetEquals(ids))
            return TypedResults.Problem("The order must contain every wish of the list exactly once.", statusCode: StatusCodes.Status400BadRequest);

        // Written directly, without the Version check: a reservation on some wish meanwhile must not make
        // the recipient's reordering fail (§6 no-leak), and quick successive moves must not conflict.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        for (var i = 0; i < ids.Count; i++)
        {
            var (wishId, order) = (ids[i], i);
            await db.Wishes.Where(w => w.Id == wishId).ExecuteUpdateAsync(s => s.SetProperty(w => w.SortOrder, order), ct);
        }
        await tx.CommitAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Wish?> LoadEditableAsync(Guid id, ClaimsPrincipal user, AppDbContext db, CancellationToken ct, bool details = false)
    {
        var userId = user.RequiredUserId();
        var query = db.Wishes.Include(w => w.Wishlist).AsQueryable();
        if (details) query = query.WithDetails();
        return await query.SingleOrDefaultAsync(w => w.Id == id && w.State != WishState.Removed && w.Wishlist.DeletedAt == null
            && w.Wishlist.Members.Any(m => m.UserId == userId && (m.IsManager || m.IsRecipient)), ct);
    }

    static void Apply(Wish wish, WishRequest req)
    {
        wish.Name = req.Name.Trim();
        wish.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        wish.Price = req.Price;
        wish.Gtin = string.IsNullOrWhiteSpace(req.Gtin) ? null : req.Gtin;
        wish.IsFavorite = req.IsFavorite;
        wish.Quantity = req.Quantity;
        wish.GroupGiftAllowed = req.GroupGiftAllowed;
    }

    /// Online links need a web address, stores a name (§4 WishLink).
    static Dictionary<string, string[]>? ValidateLinks(List<WishLinkRequest>? links)
    {
        var errors = new Dictionary<string, string[]>();
        for (var i = 0; i < (links?.Count ?? 0); i++)
        {
            var link = links![i];
            if (link.Kind == LinkKind.Online && !IsWebUrl(link.Url))
                errors[$"links[{i}].url"] = ["An online source needs an http(s) address."];
            if (link.Kind == LinkKind.Store && string.IsNullOrWhiteSpace(link.Label))
                errors[$"links[{i}].label"] = ["A store needs a name."];
        }
        return errors.Count > 0 ? errors : null;
    }

    static bool IsWebUrl(string? url) =>
        Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
