using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Wishlists;

public static class ListMembership
{
    /// The caller's membership of a non-deleted list, with the list loaded. Null means "behave as if the list doesn't exist".
    public static Task<ListMember?> FindMembershipAsync(this AppDbContext db, Guid listId, string userId, CancellationToken ct) =>
        db.ListMembers
            .Include(m => m.Wishlist)
            .SingleOrDefaultAsync(m => m.WishlistId == listId && m.UserId == userId && m.Wishlist.DeletedAt == null, ct);

    /// A list reached through its share link, plus the caller's membership if any.
    /// Null if the token is unknown, or the list is invite-only and the caller isn't a member.
    public static async Task<(Wishlist List, ListMember? Member)?> FindSharedAsync(this AppDbContext db, string token, string? userId,
        CancellationToken ct)
    {
        var list = await db.Wishlists.SingleOrDefaultAsync(l => l.ShareToken == token && l.DeletedAt == null, ct);
        if (list is null) return null;
        var member = userId is null ? null
            : await db.ListMembers.SingleOrDefaultAsync(m => m.WishlistId == list.Id && m.UserId == userId, ct);
        if (list.Access == ListAccess.Invited && member is null) return null;
        return (list, member);
    }
}
