using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Features.Wishlists;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Members;

public enum MemberRole { Manager, Recipient, Guest }

public record MemberDto(string UserId, string DisplayName, string Email, bool IsManager, bool IsRecipient, bool Confirmed, bool IsMe);

public record InviteRequest([property: Required, EmailAddress, StringLength(254)] string Email, MemberRole Role);

public record UpdateMemberRequest(bool IsManager, bool IsRecipient);

/// Managers invite co-managers, recipients and (for invite-only lists) guests (§3).
public static class MemberEndpoints
{
    public static void MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/wishlists/{id:guid}/members").WithTags("Members").RequireAuthorization(Policies.ConfirmedUser);

        group.MapGet("/", List);
        group.MapPost("/", Invite);
        group.MapPut("/{userId}", Update);
        group.MapDelete("/{userId}", Remove);
    }

    /// Guests who joined by giving are not listed: a recipient-manager would learn who gives (§6 no-leak).
    static async Task<Results<Ok<List<MemberDto>>, NotFound>> List(Guid id, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var me = await db.FindMembershipAsync(id, userId, ct);
        if (me is not { IsManager: true }) return TypedResults.NotFound();

        var members = await db.ListMembers.Where(m => m.WishlistId == id && (m.IsManager || m.IsRecipient || m.Invited))
            .Include(m => m.User)
            .OrderByDescending(m => m.IsManager).ThenByDescending(m => m.IsRecipient).ThenBy(m => m.JoinedAt).ThenBy(m => m.User.Email)
            .ToListAsync(ct);
        return TypedResults.Ok(members.Select(m => new MemberDto(m.UserId, m.User.DisplayName, m.User.Email!, m.IsManager,
            m.IsRecipient, m.User.EmailConfirmed, m.UserId == userId)).ToList());
    }

    static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Invite(Guid id, InviteRequest req, ClaimsPrincipal user,
        AppDbContext db, AuthService auth, Mailer mailer, TimeProvider clock, CancellationToken ct)
    {
        var me = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (me is not { IsManager: true }) return TypedResults.NotFound();
        var list = me.Wishlist;
        var inviter = await db.Users.SingleAsync(u => u.Id == me.UserId, ct);

        var invitee = await auth.FindOrCreateAsync(req.Email, null, inviter.Language);
        if (invitee.Id == inviter.Id)
            return TypedResults.Problem("You are already a member.", statusCode: 409, type: "already-member");
        if (!await auth.MayIssueCodeAsync(invitee))
            return TypedResults.Problem("Too many mails to this address. Try again later.", statusCode: 429, type: "rate-limited");

        var now = clock.GetUtcNow().UtcDateTime;
        var member = await db.ListMembers.SingleOrDefaultAsync(m => m.WishlistId == id && m.UserId == invitee.Id, ct);
        if (member is null)
        {
            member = new ListMember { WishlistId = id, UserId = invitee.Id, JoinedAt = now };
            db.ListMembers.Add(member);
        }
        member.IsManager |= req.Role == MemberRole.Manager;
        member.IsRecipient |= req.Role == MemberRole.Recipient;
        member.Invited = true;

        var (_, token) = auth.IssueCode(invitee, LoginCodePurpose.Invite, now + AuthService.InviteValidity);
        var target = req.Role == MemberRole.Guest ? $"/l/{list.ShareToken}" : $"/lists/{list.Id}/edit";
        var role = req.Role switch
        {
            MemberRole.Manager => Mails.InviteRole.Manager,
            MemberRole.Recipient => Mails.InviteRole.Recipient,
            _ => Mails.InviteRole.Guest,
        };
        var inviterName = string.IsNullOrWhiteSpace(inviter.DisplayName) ? inviter.Email! : inviter.DisplayName;
        mailer.Enqueue(invitee, Mails.Invitation(invitee, inviterName, list.Title, role, auth.ConfirmLink(token, target)));
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Update(Guid id, string userId, UpdateMemberRequest req,
        ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var me = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (me is not { IsManager: true }) return TypedResults.NotFound();
        var member = await db.ListMembers.SingleOrDefaultAsync(m => m.WishlistId == id && m.UserId == userId, ct);
        if (member is null || (member.IsGuest && !member.Invited)) return TypedResults.NotFound();

        if (member.IsManager && !req.IsManager && !await HasOtherManager(db, id, userId, ct))
            return TypedResults.Problem("A list needs at least one manager.", statusCode: 409, type: "last-manager");
        member.IsManager = req.IsManager;
        member.IsRecipient = req.IsRecipient;
        member.Invited = true;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Remove(Guid id, string userId, ClaimsPrincipal user,
        AppDbContext db, CancellationToken ct)
    {
        var me = await db.FindMembershipAsync(id, user.RequiredUserId(), ct);
        if (me is not { IsManager: true }) return TypedResults.NotFound();
        var member = await db.ListMembers.SingleOrDefaultAsync(m => m.WishlistId == id && m.UserId == userId, ct);
        if (member is null || (member.IsGuest && !member.Invited)) return TypedResults.NotFound();
        if (member.IsManager && !await HasOtherManager(db, id, userId, ct))
            return TypedResults.Problem("A list needs at least one manager.", statusCode: 409, type: "last-manager");

        db.ListMembers.Remove(member);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static Task<bool> HasOtherManager(AppDbContext db, Guid listId, string userId, CancellationToken ct) =>
        db.ListMembers.AnyAsync(m => m.WishlistId == listId && m.UserId != userId && m.IsManager, ct);
}
