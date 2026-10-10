using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Gifts;

/// Everything reached through the share link /l/{token}.
public static class SharedEndpoints
{
    public static void MapSharedEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/shared/{token}").WithTags("Shared");

        group.MapGet("/", GetList).AllowAnonymous();
        group.MapGet("/availability", GetAvailability).AllowAnonymous();
        group.MapPost("/wishes/{wishId:guid}/gifts", CreateGift).RequireAuthorization();
        group.MapPost("/gifts/{giftId:guid}/participants", Join).RequireAuthorization();
    }

    public static async Task<Actor?> ActorAsync(ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = await users.GetUserAsync(principal);
        return user is null ? null : new Actor(user, principal.DeviceId());
    }

    public static ViewerRole RoleOf(ListMember? member) => member switch
    {
        { IsRecipient: true } => ViewerRole.Recipient, // recipient always wins (§3)
        { IsManager: true } => ViewerRole.Manager,
        _ => ViewerRole.Guest,
    };

    /// Wish data only, identical for every viewer. Gift state comes from /availability.
    static async Task<Results<Ok<SharedListDto>, NotFound>> GetList(string token, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        if (await db.FindSharedAsync(token, user.UserId(), ct) is not var (list, member)) return TypedResults.NotFound();

        var wishes = await db.Wishes
            .Where(w => w.WishlistId == list.Id && w.State == WishState.Active)
            .WithDetails()
            .OrderBy(w => w.SortOrder)
            .ToListAsync(ct);

        return TypedResults.Ok(new SharedListDto(
            list.Id, list.Title, list.Description, list.RecipientName, list.EventDate, list.Currency,
            ThemeDto.From(list.Theme), RoleOf(member), list.ShowGiverNames, wishes.Select(WishDto.From).ToList()));
    }

    /// Who gives what. Forbidden for recipients, so nothing about gifts can ever reach them (§6).
    static async Task<Results<Ok<AvailabilityDto>, NotFound, ForbidHttpResult>> GetAvailability(string token, ClaimsPrincipal user,
        AppDbContext db, UserManager<AppUser> users, CancellationToken ct)
    {
        if (await db.FindSharedAsync(token, user.UserId(), ct) is not var (list, member)) return TypedResults.NotFound();
        if (member is { IsRecipient: true }) return TypedResults.Forbid();

        var viewer = await ActorAsync(user, users);
        var userId = viewer?.User.Id;
        var wishes = await db.Wishes
            .Where(w => w.WishlistId == list.Id && (w.State == WishState.Active
                || (w.State == WishState.Removed && w.Gifts.Any(g => g.ArchivedAt == null && g.Participants.Any(p => p.UserId == userId)))))
            .Include(w => w.Gifts.Where(g => g.ArchivedAt == null)).ThenInclude(g => g.Participants).ThenInclude(p => p.User)
            .WithDetails()
            .OrderBy(w => w.SortOrder)
            .ToListAsync(ct);

        return TypedResults.Ok(new AvailabilityDto(
            wishes.Where(w => w.State == WishState.Active).Select(w => GiftViews.Availability(w, list, viewer)).ToList(),
            wishes.Where(w => w.State == WishState.Removed).Select(w => new RemovedWishDto(WishDto.From(w), GiftViews.Mine(w, viewer))).ToList()));
    }

    static async Task<Results<Ok<GiftRefDto>, NotFound, ProblemHttpResult>> CreateGift(string token, Guid wishId, CreateGiftRequest req,
        ClaimsPrincipal user, AppDbContext db, UserManager<AppUser> users, GiftService gifts, CancellationToken ct)
    {
        if (await db.FindSharedAsync(token, user.UserId(), ct) is not var (list, member)) return TypedResults.NotFound();
        var actor = await ActorAsync(user, users);
        if (actor is null) return TypedResults.NotFound();

        var (giftId, error) = await gifts.CreateAsync(list, member, wishId, actor, req, ct);
        if (error is not null) return Problem(error);
        return TypedResults.Ok(new GiftRefDto(giftId));
    }

    static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Join(string token, Guid giftId, ParticipateRequest req,
        ClaimsPrincipal user, AppDbContext db, UserManager<AppUser> users, GiftService gifts, CancellationToken ct)
    {
        if (await db.FindSharedAsync(token, user.UserId(), ct) is not var (list, member)) return TypedResults.NotFound();
        var actor = await ActorAsync(user, users);
        if (actor is null) return TypedResults.NotFound();

        var error = await gifts.JoinAsync(list, member, giftId, actor, req, ct);
        return error is null ? TypedResults.NoContent() : Problem(error);
    }

    public static ProblemHttpResult Problem(GiftError e) => TypedResults.Problem(e.Detail, statusCode: e.Status, type: e.Type);
}
