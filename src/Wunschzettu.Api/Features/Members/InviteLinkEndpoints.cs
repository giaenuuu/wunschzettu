using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Features.Wishlists;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Members;

public record CreateInviteLinkRequest(InviteLinkRole Role);

public record InviteLinkDto(Guid Id, InviteLinkRole Role, DateTime CreatedAt, DateTime ExpiresAt);

/// The link itself is only ever returned here: afterwards just its hash exists.
public record CreatedInviteLinkDto(Guid Id, InviteLinkRole Role, DateTime ExpiresAt, string Url);

public record InvitePeekDto(string ListTitle, string? InviterName, InviteLinkRole Role);

public record AcceptInviteResponse(Guid ListId);

/// Invite co-managers (or the person the list is for) with a link to send through any channel (§3).
/// The link carries real power: a co-manager sees who gives what, so it works once and expires after 7 days.
public static class InviteLinkEndpoints
{
    public static readonly TimeSpan Validity = TimeSpan.FromDays(7);
    const int MaxOpenPerList = 10;

    public static void MapInviteLinkEndpoints(this IEndpointRouteBuilder app)
    {
        var manage = app.MapGroup("/api/wishlists/{id:guid}/invite-links").WithTags("Members").RequireAuthorization(Policies.ConfirmedUser);
        manage.MapGet("/", List);
        manage.MapPost("/", Create);
        manage.MapDelete("/{inviteId:guid}", Revoke);

        // Opened by whoever received the link, so guessing is rate limited per IP like the sign-in endpoints.
        var open = app.MapGroup("/api/invite-links").WithTags("Members").RequireRateLimiting(AuthEndpoints.RateLimitPolicy);
        open.MapGet("/{token}", Peek);
        open.MapPost("/{token}/accept", Accept).RequireAuthorization(Policies.ConfirmedUser);
    }

    static async Task<Results<Ok<List<InviteLinkDto>>, NotFound>> List(Guid id, ClaimsPrincipal user, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (await db.FindMembershipAsync(id, user.RequiredUserId(), ct) is not { IsManager: true }) return TypedResults.NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        var invites = await db.ListInvites.Where(i => i.WishlistId == id && i.UsedAt == null && i.ExpiresAt > now)
            .OrderByDescending(i => i.CreatedAt).ToListAsync(ct);
        return TypedResults.Ok(invites.Select(i => new InviteLinkDto(i.Id, i.Role, i.CreatedAt, i.ExpiresAt)).ToList());
    }

    static async Task<Results<Ok<CreatedInviteLinkDto>, NotFound, ProblemHttpResult>> Create(Guid id, CreateInviteLinkRequest req,
        ClaimsPrincipal user, AppDbContext db, Mailer mailer, TimeProvider clock, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        if (await db.FindMembershipAsync(id, userId, ct) is not { IsManager: true }) return TypedResults.NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        if (await db.ListInvites.CountAsync(i => i.WishlistId == id && i.UsedAt == null && i.ExpiresAt > now, ct) >= MaxOpenPerList)
            return TypedResults.Problem("Too many open invitation links. Revoke one first.", statusCode: 409, type: "too-many-invites");

        var token = Secrets.Token();
        var invite = new ListInvite
        {
            WishlistId = id, Role = req.Role, TokenHash = Secrets.Hash(token), CreatedByUserId = userId,
            CreatedAt = now, ExpiresAt = now + Validity,
        };
        db.ListInvites.Add(invite);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new CreatedInviteLinkDto(invite.Id, invite.Role, invite.ExpiresAt, mailer.Url($"/invite/{token}")));
    }

    static async Task<Results<NoContent, NotFound>> Revoke(Guid id, Guid inviteId, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        if (await db.FindMembershipAsync(id, user.RequiredUserId(), ct) is not { IsManager: true }) return TypedResults.NotFound();
        var deleted = await db.ListInvites.Where(i => i.Id == inviteId && i.WishlistId == id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
    }

    /// What the link is for, so the page can explain it before anyone signs in.
    static async Task<Results<Ok<InvitePeekDto>, NotFound>> Peek(string token, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var hash = Secrets.Hash(token);
        var invite = await db.ListInvites.Include(i => i.Wishlist)
            .SingleOrDefaultAsync(i => i.TokenHash == hash && i.UsedAt == null && i.ExpiresAt > now && i.Wishlist.DeletedAt == null, ct);
        if (invite is null) return TypedResults.NotFound();
        var inviter = await db.Users.Where(u => u.Id == invite.CreatedByUserId).Select(u => u.DisplayName).SingleOrDefaultAsync(ct);
        return TypedResults.Ok(new InvitePeekDto(invite.Wishlist.Title, string.IsNullOrWhiteSpace(inviter) ? null : inviter, invite.Role));
    }

    static async Task<Results<Ok<AcceptInviteResponse>, NotFound>> Accept(string token, ClaimsPrincipal user, AppDbContext db, GiftService gifts,
        TimeProvider clock, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var hash = Secrets.Hash(token);
        // Check and use in one write transaction, so two people opening the link at once can't both get in.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var invite = await db.ListInvites.Include(i => i.Wishlist)
            .SingleOrDefaultAsync(i => i.TokenHash == hash && i.UsedAt == null && i.ExpiresAt > now && i.Wishlist.DeletedAt == null, ct);
        if (invite is null) return TypedResults.NotFound();

        var member = await db.ListMembers.SingleOrDefaultAsync(m => m.WishlistId == invite.WishlistId && m.UserId == userId, ct);
        var already = invite.Role == InviteLinkRole.Manager ? member is { IsManager: true } : member is { IsRecipient: true };
        if (already) return TypedResults.Ok(new AcceptInviteResponse(invite.WishlistId)); // doesn't use the link up

        if (member is null)
        {
            member = new ListMember { WishlistId = invite.WishlistId, UserId = userId, JoinedAt = now };
            db.ListMembers.Add(member);
        }
        else if (!member.Invited)
            member.JoinedAt = now; // sorted by the time they gave otherwise, which hints at it (§6)
        member.IsManager |= invite.Role == InviteLinkRole.Manager;
        member.IsRecipient |= invite.Role == InviteLinkRole.Recipient;
        member.Invited = true;
        await gifts.ReleaseForRoleChangeAsync(invite.WishlistId, userId, ct);
        invite.UsedAt = now;
        invite.UsedByUserId = userId;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return TypedResults.Ok(new AcceptInviteResponse(invite.WishlistId));
    }
}
