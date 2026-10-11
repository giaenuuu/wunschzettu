using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;

namespace Wunschzettu.Api.Features.Auth;

/// The data subject rights (§5.10): everything about me as a file, and deleting my account.
public class AccountService(AppDbContext db, UserManager<AppUser> users, GiftService gifts, Jobs.Jobs jobs)
{
    public async Task<object> ExportAsync(AppUser user, CancellationToken ct)
    {
        var memberships = await db.ListMembers.Where(m => m.UserId == user.Id && m.Wishlist.DeletedAt == null)
            .Include(m => m.Wishlist).ThenInclude(l => l.Wishes).ThenInclude(w => w.Links)
            .Include(m => m.Wishlist).ThenInclude(l => l.Wishes).ThenInclude(w => w.Images)
            .AsSplitQuery().ToListAsync(ct);
        var participations = await db.GiftParticipants.Where(p => p.UserId == user.Id)
            .Include(p => p.Gift).ThenInclude(g => g.Wish).ThenInclude(w => w.Wishlist)
            .ToListAsync(ct);

        return new
        {
            ExportedAt = DateTime.UtcNow,
            Account = new { user.Email, user.DisplayName, user.Language, user.EmailConfirmed, HasPassword = user.PasswordHash is not null, user.CreatedAt },
            Lists = memberships.Select(m => new
            {
                m.Wishlist.Title,
                Role = m.IsManager ? (m.IsRecipient ? "Manager, Recipient" : "Manager") : m.IsRecipient ? "Recipient" : "Guest",
                m.JoinedAt,
                // Wishes only where I manage or receive; a guest's export holds their own gifts, below.
                Wishes = m.IsGuest ? null : m.Wishlist.Wishes.Where(w => w.State != WishState.Removed).OrderBy(w => w.SortOrder).Select(w => new
                {
                    w.Name, w.Description, w.Price, m.Wishlist.Currency, w.Gtin, w.Quantity, w.State, w.CreatedAt,
                    Links = w.Links.OrderBy(l => l.SortOrder).Select(l => new { l.Kind, l.Url, l.Label, l.Note }),
                    Images = w.Images.OrderBy(i => i.SortOrder).Select(i => $"/img/{i.FileKey}.webp"),
                }),
            }),
            Gifts = participations.Select(p => new
            {
                Wish = p.Gift.Wish.Name,
                List = p.Gift.Wish.Wishlist.Title,
                p.Gift.Units, p.Gift.IsGroup, p.Gift.Status, p.IsOrganizer, p.Amount, p.Message, p.JoinedAt,
                Confirmed = p.ExpiresAt is null,
                Archived = p.Gift.ArchivedAt is not null,
            }),
        };
    }

    /// Lists only I manage go for good; on shared lists I just leave. My gifts end as if I had withdrawn,
    /// so group partners get told and wishes become free again (the recipient notices nothing, §6 no-leak).
    public async Task DeleteAsync(AppUser user, CancellationToken ct)
    {
        var soleManaged = await db.Wishlists
            .Where(l => l.Members.Any(m => m.UserId == user.Id && m.IsManager) && !l.Members.Any(m => m.UserId != user.Id && m.IsManager))
            .Include(l => l.Members)
            .ToListAsync(ct);
        foreach (var list in soleManaged)
        {
            // A list made for someone with an account stays theirs: they take over managing it (still as recipient,
            // so they still see no gifts) and the givers' plans survive.
            var recipients = list.Members.Where(m => m.UserId != user.Id && m.IsRecipient).ToList();
            if (recipients.Count > 0)
                foreach (var r in recipients) r.IsManager = true;
            else
                await jobs.PurgeAsync(list, ct);
        }

        var myGifts = await db.Gifts
            .Include(g => g.Wish).ThenInclude(w => w.Wishlist)
            .Include(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .Where(g => g.Participants.Any(p => p.UserId == user.Id))
            .ToListAsync(ct);
        foreach (var gift in myGifts)
        {
            var me = gift.Participants.Single(p => p.UserId == user.Id);
            if (gift.ArchivedAt is null)
                gifts.RemoveParticipant(gift, me);
            else
            {
                // Past events: the recipient's thank-you list keeps the gift only while someone is left to thank.
                gift.Participants.Remove(me);
                db.GiftParticipants.Remove(me);
                if (gift.Participants.Count == 0) db.Gifts.Remove(gift);
            }
        }
        await db.SaveChangesEditWinsAsync(ct);

        await db.Outbox.Where(m => m.ToUserId == user.Id).ExecuteDeleteAsync(ct);
        var result = await users.DeleteAsync(user); // memberships and codes cascade
        if (!result.Succeeded)
            throw new InvalidOperationException("Deleting user failed: " + string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}
