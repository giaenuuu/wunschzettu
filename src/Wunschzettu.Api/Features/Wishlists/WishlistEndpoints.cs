using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Wishlists;

public static class WishlistEndpoints
{
    static readonly TimeSpan RestoreWindow = TimeSpan.FromDays(30);

    public static void MapWishlistEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/wishlists", GetDashboard).WithTags("Wishlists").RequireAuthorization();

        // Managers and recipients are always confirmed: an unconfirmed session may belong to whoever typed the email.
        var group = app.MapGroup("/api/wishlists").WithTags("Wishlists").RequireAuthorization(Policies.ConfirmedUser);
        group.MapPost("/", Create);
        group.MapGet("/{id:guid}", Get);
        group.MapPut("/{id:guid}", Update);
        group.MapDelete("/{id:guid}", Delete);
        group.MapPost("/{id:guid}/restore", Restore);
        group.MapPost("/{id:guid}/share-token", RegenerateShareToken);
        group.MapGet("/{id:guid}/gifts", GetGifts);
        group.MapGet("/{id:guid}/thanks", GetThanks);
    }

    static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(clock.GetLocalNow().DateTime);

    static async Task<DashboardDto> GetDashboard(ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var rows = await db.ListMembers
            .Where(m => m.UserId == userId && m.Wishlist.DeletedAt == null)
            .OrderByDescending(m => m.Wishlist.UpdatedAt)
            .Select(m => new
            {
                m.IsManager,
                m.IsRecipient,
                m.Wishlist,
                WishCount = m.Wishlist.Wishes.Count(w => w.State == WishState.Active),
            })
            .ToListAsync(ct);

        var summaries = rows.Select(r => new WishlistSummaryDto(
            r.Wishlist.Id, r.Wishlist.Title, r.Wishlist.RecipientName, r.Wishlist.EventDate,
            ThemeDto.From(r.Wishlist.Theme), r.Wishlist.ShareToken, r.WishCount, r.IsManager, r.IsRecipient)).ToList();

        // Unconfirmed sessions only see what this device did (§5.4): someone typing your email elsewhere learns nothing.
        var confirmed = user.IsConfirmed();
        var device = user.DeviceId();
        var gifts = await db.GiftParticipants
            .Where(p => p.UserId == userId && p.Gift.ArchivedAt == null && p.Gift.Wish.Wishlist.DeletedAt == null
                && (confirmed || p.DeviceId == device))
            .OrderBy(p => p.Gift.Wish.Wishlist.EventDate == null).ThenBy(p => p.Gift.Wish.Wishlist.EventDate).ThenBy(p => p.JoinedAt)
            .Select(p => new
            {
                p.GiftId, p.Gift.WishId, WishName = p.Gift.Wish.Name, p.Gift.Wish.State, p.Gift.Wish.Wishlist,
                p.Gift.IsGroup, p.Gift.Units, p.Gift.Status, p.IsOrganizer, Unconfirmed = p.ExpiresAt != null,
                Count = p.Gift.Participants.Count,
            })
            .ToListAsync(ct);

        return new DashboardDto(
            summaries.Where(s => s.IsManager || s.IsRecipient).ToList(),
            summaries.Where(s => !s.IsManager && !s.IsRecipient).ToList(),
            gifts.Select(g => new MyGiftSummaryDto(g.GiftId, g.WishId, g.WishName, g.State, g.Wishlist.Title, g.Wishlist.ShareToken,
                ThemeDto.From(g.Wishlist.Theme), g.Wishlist.EventDate, g.IsGroup, g.Units, g.Status, g.IsOrganizer, g.Unconfirmed, g.Count)).ToList());
    }

    static async Task<Results<Created<WishlistDetailDto>, ProblemHttpResult>> Create(CreateWishlistRequest req, ClaimsPrincipal user,
        AppDbContext db, TimeProvider clock, IOptions<AppOptions> options, CancellationToken ct)
    {
        if (req.EventDate < Today(clock)) return PastDate();
        var userId = user.RequiredUserId();
        var maxLists = options.Value.MaxListsPerUser;
        var owned = await db.ListMembers.CountAsync(m => m.UserId == userId && m.IsManager && m.Wishlist.DeletedAt == null, ct);
        if (owned >= maxLists)
            return TypedResults.Problem($"You can manage at most {maxLists} lists.", statusCode: StatusCodes.Status409Conflict, type: "too-many-lists");

        var now = clock.GetUtcNow().UtcDateTime;
        var list = new Wishlist
        {
            Title = req.Title.Trim(),
            Description = req.Description,
            RecipientName = req.RecipientName,
            EventDate = req.EventDate,
            Currency = req.Currency ?? "CHF",
            Theme = req.Theme?.ToEntity() ?? new Theme(),
            ShareToken = Secrets.Token(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        list.Members.Add(new ListMember { UserId = userId, IsManager = true, IsRecipient = req.ForMe, JoinedAt = now });
        db.Wishlists.Add(list);
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/api/wishlists/{list.Id}", ToDetail(list, list.Members[0], []));
    }

    static async Task<Results<Ok<WishlistDetailDto>, NotFound>> Get(Guid id, ClaimsPrincipal user, AppDbContext db, TimeProvider clock,
        CancellationToken ct)
    {
        var member = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();

        var wishes = await db.Wishes
            .Where(w => w.WishlistId == id && w.State != WishState.Removed)
            .WithDetails()
            .OrderBy(w => w.SortOrder)
            .ToListAsync(ct);

        return TypedResults.Ok(ToDetail(member.Wishlist, member, wishes));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, ProblemHttpResult>> Update(Guid id, UpdateWishlistRequest req,
        ClaimsPrincipal user, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var member = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();
        if (!member.IsManager) return TypedResults.Forbid();

        var list = member.Wishlist;
        // A new date in the past would end the occasion at once: gifts archived, reservations gone (§6).
        // Keeping an old date unchanged is fine, e.g. when editing the title after the event.
        if (req.EventDate != list.EventDate && req.EventDate < Today(clock)) return PastDate();
        list.Title = req.Title.Trim();
        list.Description = req.Description;
        list.RecipientName = req.RecipientName;
        list.EventDate = req.EventDate;
        list.Currency = req.Currency;
        list.Access = req.Access;
        list.ShowGiverNames = req.ShowGiverNames;
        list.Theme = req.Theme.ToEntity();
        list.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> Delete(Guid id, ClaimsPrincipal user, AppDbContext db,
        TimeProvider clock, CancellationToken ct)
    {
        var member = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();
        if (!member.IsManager) return TypedResults.Forbid();

        member.Wishlist.DeletedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound>> Restore(Guid id, ClaimsPrincipal user, AppDbContext db, TimeProvider clock,
        CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var member = await db.ListMembers.Include(m => m.Wishlist)
            .SingleOrDefaultAsync(m => m.WishlistId == id && m.UserId == userId && m.IsManager, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (member?.Wishlist.DeletedAt is not { } deletedAt || now - deletedAt > RestoreWindow) return TypedResults.NotFound();

        member.Wishlist.DeletedAt = null;
        member.Wishlist.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<Ok<ShareTokenDto>, NotFound, ForbidHttpResult>> RegenerateShareToken(Guid id, ClaimsPrincipal user,
        AppDbContext db, CancellationToken ct)
    {
        var member = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();
        if (!member.IsManager) return TypedResults.Forbid();

        member.Wishlist.ShareToken = Secrets.Token();
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new ShareTokenDto(member.Wishlist.ShareToken));
    }

    /// Who gives what, for managers who aren't the recipient. Recipients get 403 whatever the state (§6).
    static async Task<Results<Ok<List<WishGiftsDto>>, NotFound, ForbidHttpResult>> GetGifts(Guid id, ClaimsPrincipal user,
        AppDbContext db, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var member = await db.FindMembershipAsync(id, userId, ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();
        if (member.IsRecipient) return TypedResults.Forbid();

        var wishes = await db.Wishes
            .Where(w => w.WishlistId == id && (w.State != WishState.Removed || w.Gifts.Any(g => g.ArchivedAt == null)))
            .Include(w => w.Gifts.Where(g => g.ArchivedAt == null)).ThenInclude(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .OrderBy(w => w.SortOrder)
            .ToListAsync(ct);
        return TypedResults.Ok(wishes.Select(w => GiftViews.ForManager(w, userId)).ToList());
    }

    static ProblemHttpResult PastDate() =>
        TypedResults.Problem("The event date can't be in the past.", statusCode: StatusCodes.Status400BadRequest, type: "date-in-past");

    /// The Dankesliste: an explicit opt-in once an occasion is over and its gifts are archived (§6).
    /// Only archived gifts are shown, so moving the date can never reveal gifts that are still being planned.
    static async Task<Results<Ok<List<ThanksEntryDto>>, NotFound, ProblemHttpResult>> GetThanks(Guid id, ClaimsPrincipal user,
        AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var member = await db.FindMembershipAsync(id, userId, ct);
        if (member is null || member.IsGuest) return TypedResults.NotFound();
        if (!CanShowThanks(member.Wishlist))
            return TypedResults.Problem("The Dankesliste opens on the event date.", statusCode: 409, type: "too-early");

        var wishes = await db.Wishes
            .Where(w => w.WishlistId == id && w.Gifts.Any(g => g.ArchivedAt != null))
            .Include(w => w.Gifts.Where(g => g.ArchivedAt != null)).ThenInclude(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .OrderBy(w => w.SortOrder)
            .ToListAsync(ct);
        return TypedResults.Ok(wishes.Select(w => new ThanksEntryDto(
            w.Id, w.Name, w.Gifts.Any(g => g.IsGroup),
            w.Gifts.SelectMany(g => g.Participants).OrderBy(p => p.JoinedAt).Select(p => GiftViews.Participant(p, userId) with { Amount = null }).ToList())).ToList());
    }

    static bool CanShowThanks(Wishlist l) => l.EventProcessedFor is not null;

    static WishlistDetailDto ToDetail(Wishlist l, ListMember m, List<Wish> wishes) => new(
        l.Id, l.Title, l.Description, l.RecipientName, l.EventDate, l.Currency, l.Access, l.ShowGiverNames,
        ThemeDto.From(l.Theme), l.ShareToken, m.IsManager, m.IsRecipient, m.IsManager && !m.IsRecipient, CanShowThanks(l),
        wishes.Select(WishDto.From).ToList());
}
