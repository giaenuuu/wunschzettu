using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Notifications;

namespace Wunschzettu.Api.Features.Gifts;

/// Who is acting: the user from the database (for the confirmed flag) and the device of this session.
public record Actor(AppUser User, string? DeviceId)
{
    public bool Confirmed => User.EmailConfirmed;
    public bool CanModify(GiftParticipant p) => Confirmed || (p.DeviceId is not null && p.DeviceId == DeviceId);
}

/// A rule violation, mapped to a problem response. Type is what the frontend switches on.
public record GiftError(string Type, int Status, string Detail)
{
    public static readonly GiftError NotFound = new("not-found", 404, "Not found.");
    public static readonly GiftError NotAllowed = new("not-allowed", 403, "Managers and recipients can't give on their own list.");
    public static readonly GiftError NotAvailable = new("not-available", 409, "Not enough units left.");
    public static readonly GiftError JoinExisting = new("join-existing", 409, "A group gift is already running. Join it instead.");
    public static readonly GiftError GroupNotAllowed = new("group-not-allowed", 400, "This wish can't be a group gift.");
    public static readonly GiftError NotGroup = new("not-group", 400, "This gift isn't a group gift.");
    public static readonly GiftError AlreadyParticipating = new("already-participating", 409, "You already give this wish.");
    public static readonly GiftError Bought = new("gift-bought", 409, "The gift is marked as bought. The organizer has to unlock it first.");
    public static readonly GiftError WrongDevice = new("wrong-device", 403, "Confirm your email to change this from another device.");
    public static readonly GiftError TooManyUnconfirmed = new("too-many-unconfirmed", 429, "Too many unconfirmed reservations. Please confirm your email first.");
    public static readonly GiftError NotOrganizer = new("not-organizer", 403, "Only the organizer can do this.");
}

/// The gift rules of ARCHITECTURE §6. Every change touches the wish, so its Version
/// makes concurrent changes fail instead of overbooking (§6.8).
public class GiftService(AppDbContext db, Mailer mailer, AuthService auth, TimeProvider clock)
{
    const int MaxUnconfirmedPerDay = 10;
    static readonly TimeSpan ConfirmWindow = TimeSpan.FromDays(7);

    DateTime Now => clock.GetUtcNow().UtcDateTime;

    public static int TakenUnits(Wish w) => w.Gifts.Where(g => g.ArchivedAt == null).Sum(g => g.Units);

    public static int? Available(Wish w) => w.Quantity is { } q ? Math.Max(0, q - TakenUnits(w)) : null;

    /// When an unconfirmed participation is released: 7 days, but at the latest one day before the event (§5.3).
    public static DateTime ExpiryFor(DateTime now, DateOnly? eventDate)
    {
        var expires = now + ConfirmWindow;
        if (eventDate is { } d)
        {
            var dayBefore = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(-1);
            if (dayBefore < expires) expires = dayBefore > now.AddHours(12) ? dayBefore : now.AddHours(12);
        }
        return expires;
    }

    Task<Wish?> LoadWishAsync(Guid listId, Guid wishId, CancellationToken ct) =>
        db.Wishes
            .Include(w => w.Wishlist)
            .Include(w => w.Gifts.Where(g => g.ArchivedAt == null)).ThenInclude(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .SingleOrDefaultAsync(w => w.Id == wishId && w.WishlistId == listId && w.Wishlist.DeletedAt == null, ct);

    Task<Gift?> LoadGiftAsync(Guid giftId, CancellationToken ct) =>
        db.Gifts
            .Include(g => g.Wish).ThenInclude(w => w.Wishlist)
            .Include(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .SingleOrDefaultAsync(g => g.Id == giftId && g.ArchivedAt == null && g.Wish.Wishlist.DeletedAt == null, ct);

    public Task<(Guid GiftId, GiftError? Error)> CreateAsync(Wishlist list, ListMember? member, Guid wishId, Actor actor,
        CreateGiftRequest req, CancellationToken ct) =>
        RetryOnConflictAsync(actor, () => CreateOnceAsync(list, member, wishId, actor, req, ct));

    async Task<(Guid GiftId, GiftError? Error)> CreateOnceAsync(Wishlist list, ListMember? member, Guid wishId, Actor actor,
        CreateGiftRequest req, CancellationToken ct)
    {
        if (member is { IsGuest: false }) return (default, GiftError.NotAllowed);
        var wish = await LoadWishAsync(list.Id, wishId, ct);
        if (wish is null || wish.State != WishState.Active) return (default, GiftError.NotFound);
        if (wish.Gifts.Any(g => g.Participants.Any(p => p.UserId == actor.User.Id))) return (default, GiftError.AlreadyParticipating);
        if (await UnconfirmedLimitReached(actor, ct)) return (default, GiftError.TooManyUnconfirmed);

        var units = req.IsGroup ? 1 : req.Units ?? 1;
        if (req.IsGroup)
        {
            if (!wish.GroupGiftAllowed) return (default, GiftError.GroupNotAllowed);
            if (wish.Gifts.Any(g => g.IsGroup && g.Status == GiftStatus.Planned)) return (default, GiftError.JoinExisting);
        }
        if (Available(wish) is { } available && available < units) return (default, GiftError.NotAvailable);

        var gift = new Gift { WishId = wish.Id, Units = units, IsGroup = req.IsGroup, CreatedAt = Now };
        gift.Participants.Add(NewParticipant(actor, list, isOrganizer: true, req.Amount, req.Message));
        db.Gifts.Add(gift);
        await EnsureGuestMemberAsync(list, member, actor.User, ct);
        db.Touch(wish);
        SendChosenMail(actor, gift.Participants[0], wish, list, req.IsGroup);
        await db.SaveChangesAsync(ct);
        return (gift.Id, null);
    }

    public Task<GiftError?> JoinAsync(Wishlist list, ListMember? member, Guid giftId, Actor actor, ParticipateRequest req,
        CancellationToken ct) =>
        RetryOnConflictAsync(actor, () => JoinOnceAsync(list, member, giftId, actor, req, ct));

    async Task<GiftError?> JoinOnceAsync(Wishlist list, ListMember? member, Guid giftId, Actor actor, ParticipateRequest req,
        CancellationToken ct)
    {
        if (member is { IsGuest: false }) return GiftError.NotAllowed;
        var gift = await LoadGiftAsync(giftId, ct);
        if (gift is null || gift.Wish.WishlistId != list.Id || gift.Wish.State != WishState.Active) return GiftError.NotFound;
        if (!gift.IsGroup) return GiftError.NotGroup;
        if (gift.Status == GiftStatus.Bought) return GiftError.Bought;
        if (gift.Participants.Any(p => p.UserId == actor.User.Id)) return GiftError.AlreadyParticipating;
        if (await UnconfirmedLimitReached(actor, ct)) return GiftError.TooManyUnconfirmed;

        var participant = NewParticipant(actor, list, isOrganizer: false, req.Amount, req.Message);
        var listUrl = ListUrl(list);
        foreach (var other in gift.Participants)
            mailer.Enqueue(other.User, Mails.GroupJoined(other.User, actor.User.DisplayName, gift.Wish.Name, listUrl));
        gift.Participants.Add(participant);
        await EnsureGuestMemberAsync(list, member, actor.User, ct);
        db.Touch(gift.Wish);
        SendChosenMail(actor, participant, gift.Wish, list, isGroup: true);
        await db.SaveChangesAsync(ct);
        return null;
    }

    public async Task<GiftError?> UpdateMineAsync(Guid giftId, Actor actor, ParticipateRequest req, CancellationToken ct)
    {
        var gift = await LoadGiftAsync(giftId, ct);
        var me = gift?.Participants.SingleOrDefault(p => p.UserId == actor.User.Id);
        if (gift is null || me is null) return GiftError.NotFound;
        if (!actor.CanModify(me)) return GiftError.WrongDevice;

        me.Amount = req.Amount;
        me.Message = string.IsNullOrWhiteSpace(req.Message) ? null : req.Message.Trim();
        db.Touch(gift.Wish);
        await db.SaveChangesAsync(ct);
        return null;
    }

    public async Task<GiftError?> LeaveAsync(Guid giftId, Actor actor, CancellationToken ct)
    {
        var gift = await LoadGiftAsync(giftId, ct);
        var me = gift?.Participants.SingleOrDefault(p => p.UserId == actor.User.Id);
        if (gift is null || me is null) return GiftError.NotFound;
        if (!actor.CanModify(me)) return GiftError.WrongDevice;
        if (gift.Status == GiftStatus.Bought) return GiftError.Bought;

        RemoveParticipant(gift, me);
        await db.SaveChangesAsync(ct);
        return null;
    }

    public async Task<GiftError?> SetBoughtAsync(Guid giftId, Actor actor, bool bought, CancellationToken ct)
    {
        var gift = await LoadGiftAsync(giftId, ct);
        var me = gift?.Participants.SingleOrDefault(p => p.UserId == actor.User.Id);
        if (gift is null || me is null) return GiftError.NotFound;
        if (!me.IsOrganizer) return GiftError.NotOrganizer;
        if (!actor.CanModify(me)) return GiftError.WrongDevice;

        gift.Status = bought ? GiftStatus.Bought : GiftStatus.Planned;
        db.Touch(gift.Wish);
        await db.SaveChangesAsync(ct);
        return null;
    }

    /// Leaving, withdrawing or expiry. Needs the gift with wish, list and participants (with users) loaded.
    /// Rule §6.5: the longest-standing participant takes over as organizer; an empty gift disappears.
    public void RemoveParticipant(Gift gift, GiftParticipant leaving)
    {
        // Captured first: removing the gift from wish.Gifts makes EF's fixup null gift.Wish later on.
        var wish = gift.Wish;
        var listUrl = ListUrl(wish.Wishlist);
        gift.Participants.Remove(leaving);
        db.GiftParticipants.Remove(leaving);

        if (gift.Participants.Count == 0)
        {
            db.Gifts.Remove(gift);
            wish.Gifts.Remove(gift);
        }
        else
        {
            // Participants whose own release is due in the same run get no mails about the others.
            var now = Now;
            bool Expiring(GiftParticipant p) => p.ExpiresAt <= now;
            if (leaving.IsOrganizer)
            {
                var next = gift.Participants.OrderBy(Expiring).ThenBy(p => p.JoinedAt).First();
                next.IsOrganizer = true;
                if (!Expiring(next)) mailer.Enqueue(next.User, Mails.NowOrganizer(next.User, wish.Name, listUrl));
            }
            foreach (var other in gift.Participants.Where(p => !Expiring(p)))
                mailer.Enqueue(other.User, Mails.GroupLeft(other.User, leaving.User.DisplayName, wish.Name, listUrl));
        }
        db.Touch(wish);
    }

    /// Someone who gave and then becomes manager or recipient must not keep following those gifts (§6 no-leak):
    /// their participations end as if they had left. Call before saving the role change.
    public async Task ReleaseForRoleChangeAsync(Guid listId, string userId, CancellationToken ct)
    {
        var gifts = await db.Gifts
            .Include(g => g.Wish).ThenInclude(w => w.Wishlist)
            .Include(g => g.Participants).ThenInclude(p => p.User)
            .AsSplitQuery()
            .Where(g => g.Wish.WishlistId == listId && g.ArchivedAt == null && g.Participants.Any(p => p.UserId == userId))
            .ToListAsync(ct);
        foreach (var gift in gifts)
            RemoveParticipant(gift, gift.Participants.Single(p => p.UserId == userId));
    }

    /// Recipients and managers may change anything; the givers get told instead (§6 no-leak).
    /// Call before saving the change. Needs nothing loaded; the query is a no-op for wishes without gifts.
    public async Task NotifyGiversAsync(Wish wish, WishChange change, CancellationToken ct)
    {
        var givers = await db.GiftParticipants
            .Where(p => p.Gift.WishId == wish.Id && p.Gift.ArchivedAt == null)
            .Select(p => p.User)
            .Distinct()
            .ToListAsync(ct);
        if (givers.Count == 0) return;
        var list = await db.Wishlists.SingleAsync(l => l.Id == wish.WishlistId, ct);
        foreach (var user in givers)
            mailer.Enqueue(user, Mails.WishChanged(user, wish.Name, change, ListUrl(list)));
    }

    public string ListUrl(Wishlist list) => mailer.Url($"/l/{list.ShareToken}");

    GiftParticipant NewParticipant(Actor actor, Wishlist list, bool isOrganizer, decimal? amount, string? message) => new()
    {
        UserId = actor.User.Id,
        User = actor.User,
        IsOrganizer = isOrganizer,
        Amount = amount,
        Message = string.IsNullOrWhiteSpace(message) ? null : message.Trim(),
        JoinedAt = Now,
        ExpiresAt = actor.Confirmed ? null : ExpiryFor(Now, list.EventDate),
        DeviceId = actor.DeviceId,
    };

    /// The first action adds a guest membership: it puts the list under "shared with me".
    /// Checked again in the database: on a retry, a parallel request may have added it meanwhile.
    async Task EnsureGuestMemberAsync(Wishlist list, ListMember? member, AppUser user, CancellationToken ct)
    {
        if (member is null && !await db.ListMembers.AnyAsync(m => m.WishlistId == list.Id && m.UserId == user.Id, ct))
            db.ListMembers.Add(new ListMember { WishlistId = list.Id, UserId = user.Id, JoinedAt = Now });
    }

    /// Every gift change bumps the wish's Version (§6.8), so two guests acting on the same wish at once conflict
    /// even when there is enough left. The loser starts over on fresh data; only a real shortage reaches the guest.
    async Task<T> RetryOnConflictAsync<T>(Actor actor, Func<Task<T>> attempt)
    {
        for (var tries = 1; ; tries++)
        {
            try { return await attempt(); }
            catch (DbUpdateException e) when (tries < 4 && AppDbContext.IsWriteConflict(e))
            {
                db.ChangeTracker.Clear();
                db.Attach(actor.User);
            }
        }
    }

    void SendChosenMail(Actor actor, GiftParticipant participant, Wish wish, Wishlist list, bool isGroup)
    {
        var listUrl = ListUrl(list);
        Mails.Confirmation? confirmation = null;
        if (participant.ExpiresAt is { } expires)
        {
            var (code, token) = auth.IssueCode(actor.User, LoginCodePurpose.Confirm, expires);
            confirmation = new(code, auth.ConfirmLink(token, $"/l/{list.ShareToken}"), expires);
        }
        mailer.Enqueue(actor.User, Mails.GiftChosen(actor.User, wish.Name, list.Title, isGroup, listUrl, confirmation));
    }

    async Task<bool> UnconfirmedLimitReached(Actor actor, CancellationToken ct)
    {
        if (actor.Confirmed) return false;
        var since = Now.AddDays(-1);
        return await db.GiftParticipants.CountAsync(p => p.UserId == actor.User.Id && p.JoinedAt > since, ct) >= MaxUnconfirmedPerDay;
    }
}
