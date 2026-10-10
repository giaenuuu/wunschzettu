using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Notifications;

namespace Wunschzettu.Api.Features.Jobs;

/// Time-based rules. Every step is idempotent, so running too often is harmless and a missed run catches up.
public class Jobs(AppDbContext db, GiftService gifts, AuthService auth, Mailer mailer, ImageStore images, TimeProvider clock,
    ILogger<Jobs> logger)
{
    static readonly TimeSpan DeletedListRetention = TimeSpan.FromDays(30);

    DateTime Now => clock.GetUtcNow().UtcDateTime;
    DateOnly Today => DateOnly.FromDateTime(clock.GetLocalNow().DateTime);

    public async Task RunAsync(CancellationToken ct)
    {
        await RemindUnconfirmedAsync(ct);
        await ReleaseExpiredAsync(ct);
        await RemindUpcomingEventsAsync(ct);
        await ProcessPastEventsAsync(ct);
        await CleanUpAsync(ct);
    }

    /// Two reminders, at 2/7 and 5/7 of the confirmation window: day 2 and 5 normally, earlier if the event is close (§5.3).
    public async Task RemindUnconfirmedAsync(CancellationToken ct)
    {
        var now = Now;
        var pending = await db.GiftParticipants
            .Where(p => p.ExpiresAt != null && p.ExpiresAt > now && p.RemindersSent < 2 && p.Gift.ArchivedAt == null
                && p.Gift.Wish.Wishlist.DeletedAt == null)
            .Include(p => p.User)
            .Include(p => p.Gift).ThenInclude(g => g.Wish).ThenInclude(w => w.Wishlist)
            .ToListAsync(ct);

        var due = pending.Where(p =>
        {
            var window = p.ExpiresAt!.Value - p.JoinedAt;
            var next = p.JoinedAt + window * (p.RemindersSent == 0 ? 2.0 / 7 : 5.0 / 7);
            return now >= next;
        });

        foreach (var byUser in due.GroupBy(p => p.UserId))
        {
            var user = byUser.First().User;
            var expires = byUser.Max(p => p.ExpiresAt!.Value);
            var (code, token) = auth.IssueCode(user, LoginCodePurpose.Confirm, expires);
            var first = byUser.First().Gift.Wish.Wishlist;
            mailer.Enqueue(user, Mails.ConfirmReminder(user, byUser.Select(p => p.Gift.Wish.Name).Distinct().ToList(),
                new Mails.Confirmation(code, auth.ConfirmLink(token, $"/l/{first.ShareToken}"), expires)));
            // Both reminders are counted when one is overdue too, so nobody gets two mails at once.
            foreach (var p in byUser)
            {
                var window = p.ExpiresAt!.Value - p.JoinedAt;
                p.RemindersSent = now >= p.JoinedAt + window * (5.0 / 7) ? 2 : 1;
            }
        }
        await db.SaveChangesAsync(ct);
    }

    /// Unconfirmed participations past their deadline are released, so a typo can't block a wish forever (§5.3).
    public async Task ReleaseExpiredAsync(CancellationToken ct)
    {
        var now = Now;
        var expired = await db.GiftParticipants
            .Where(p => p.ExpiresAt != null && p.ExpiresAt <= now && p.Gift.ArchivedAt == null
                && p.Gift.Wish.Wishlist.DeletedAt == null) // deleted lists are purged later; no mails about them
            .Select(p => new { p.GiftId, p.UserId })
            .ToListAsync(ct);

        foreach (var e in expired)
        {
            // One gift at a time: each removal is its own small transaction with the wish's concurrency check.
            var gift = await db.Gifts
                .Include(g => g.Wish).ThenInclude(w => w.Wishlist)
                .Include(g => g.Wish).ThenInclude(w => w.Gifts)
                .Include(g => g.Participants).ThenInclude(p => p.User)
                .AsSplitQuery()
                .SingleOrDefaultAsync(g => g.Id == e.GiftId, ct);
            var participant = gift?.Participants.SingleOrDefault(p => p.UserId == e.UserId && p.ExpiresAt <= now);
            if (gift is null || participant is null) continue;

            var wish = gift.Wish;
            gifts.RemoveParticipant(gift, participant);
            mailer.Enqueue(participant.User, Mails.Released(participant.User, wish.Name, gifts.ListUrl(wish.Wishlist)));
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                logger.LogInformation("Releasing {GiftId} collided with another change; retrying next run", e.GiftId);
                db.ChangeTracker.Clear();
            }
        }
    }

    /// One week before the event, givers who haven't marked their gift as bought get a nudge.
    public async Task RemindUpcomingEventsAsync(CancellationToken ct)
    {
        var today = Today;
        var inAWeek = today.AddDays(7);
        var lists = await db.Wishlists
            .Where(l => l.DeletedAt == null && l.EventDate != null && l.EventDate > today && l.EventDate <= inAWeek
                && l.EventReminderSentFor != l.EventDate)
            .ToListAsync(ct);

        foreach (var list in lists)
        {
            var open = await db.GiftParticipants
                .Where(p => p.Gift.Wish.WishlistId == list.Id && p.Gift.ArchivedAt == null && p.Gift.Status == GiftStatus.Planned
                    && p.Gift.Wish.State == WishState.Active)
                .Include(p => p.User)
                .Include(p => p.Gift).ThenInclude(g => g.Wish)
                .ToListAsync(ct);
            foreach (var byUser in open.GroupBy(p => p.UserId))
                mailer.Enqueue(byUser.First().User, Mails.EventReminder(byUser.First().User, list.Title, list.EventDate!.Value,
                    byUser.Select(p => p.Gift.Wish.Name).ToList(), gifts.ListUrl(list)));
            list.EventReminderSentFor = list.EventDate;
        }
        await db.SaveChangesAsync(ct);
    }

    /// After the event: fully given wishes become Fulfilled, gifts are archived for the Dankesliste,
    /// and everything still open stays on the list for the next occasion (§6).
    public async Task ProcessPastEventsAsync(CancellationToken ct)
    {
        var today = Today;
        var now = Now;
        var lists = await db.Wishlists
            .Where(l => l.DeletedAt == null && l.EventDate != null && l.EventDate < today && l.EventProcessedFor != l.EventDate)
            .ToListAsync(ct);

        foreach (var list in lists)
        {
            var wishes = await db.Wishes
                .Where(w => w.WishlistId == list.Id)
                .Include(w => w.Gifts.Where(g => g.ArchivedAt == null))
                .ToListAsync(ct);
            foreach (var wish in wishes)
            {
                if (wish.State == WishState.Active && wish.Quantity is { } q && wish.Gifts.Sum(g => g.Units) >= q)
                    wish.State = WishState.Fulfilled;
                foreach (var gift in wish.Gifts) gift.ArchivedAt = now;
            }
            list.EventProcessedFor = list.EventDate;
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task CleanUpAsync(CancellationToken ct)
    {
        var now = Now;

        // Lists deleted more than 30 days ago are gone for good, images included.
        var cutoff = now - DeletedListRetention;
        var purged = await db.Wishlists.Where(l => l.DeletedAt != null && l.DeletedAt < cutoff).ToListAsync(ct);
        foreach (var list in purged)
        {
            var keys = await db.WishImages.Where(i => db.Wishes.Any(w => w.Id == i.WishId && w.WishlistId == list.Id))
                .Select(i => i.FileKey).ToListAsync(ct);
            keys.AddRange(await db.Wishes.Where(w => w.WishlistId == list.Id).SelectMany(w => w.Links)
                .Where(l => l.PreviewImageKey != null).Select(l => l.PreviewImageKey!).ToListAsync(ct));
            db.Wishlists.Remove(list);
            await db.SaveChangesAsync(ct);
            foreach (var key in keys) images.Delete(key);
        }

        // A removed wish nobody gives any more has no reason to exist.
        var orphans = await db.Wishes.Where(w => w.State == WishState.Removed && !w.Gifts.Any()).Include(w => w.Images).Include(w => w.Links).AsSplitQuery().ToListAsync(ct);
        db.Wishes.RemoveRange(orphans);
        await db.SaveChangesAsync(ct);
        foreach (var key in orphans.SelectMany(w => w.Images).Select(i => i.FileKey)) images.Delete(key);
        foreach (var key in orphans.SelectMany(w => w.Links).Select(l => l.PreviewImageKey).OfType<string>()) images.Delete(key);

        await db.LoginCodes.Where(c => c.ExpiresAt < now.AddDays(-1)).ExecuteDeleteAsync(ct);
        await db.Outbox.Where(m => m.SentAt != null && m.SentAt < now.AddDays(-30)).ExecuteDeleteAsync(ct);
    }
}

public class JobRunner(IServiceScopeFactory scopes, ILogger<JobRunner> logger) : BackgroundService
{
    static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<Jobs>().RunAsync(ct);
                scope.ServiceProvider.GetRequiredService<OutboxSignal>().Notify();
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogError(e, "Scheduled jobs failed");
            }
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
