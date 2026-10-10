using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Gifts;

/// Builds the gift DTOs from wishes loaded with active gifts, participants and users.
public static class GiftViews
{
    static string Name(GiftParticipant p) => string.IsNullOrWhiteSpace(p.User.DisplayName) ? "?" : p.User.DisplayName;

    static IEnumerable<Gift> Active(Wish w) => w.Gifts.Where(g => g.ArchivedAt == null);

    public static ParticipantDto Participant(GiftParticipant p, string? viewerId) =>
        new(Name(p), p.Amount, p.Message, p.IsOrganizer, p.ExpiresAt != null, p.UserId == viewerId);

    static List<ParticipantDto> Participants(Gift g, string? viewerId) =>
        g.Participants.OrderByDescending(p => p.IsOrganizer).ThenBy(p => p.JoinedAt).Select(p => Participant(p, viewerId)).ToList();

    static decimal Pledged(Gift g) => g.Participants.Sum(p => p.Amount ?? 0);

    public static List<MyGiftDto> Mine(Wish w, Actor? viewer) => viewer is null ? [] :
        Active(w)
            .Select(g => (Gift: g, Me: g.Participants.SingleOrDefault(p => p.UserId == viewer.User.Id)))
            // Unconfirmed: only what this device did. Someone typing your email elsewhere learns nothing (§5.4).
            .Where(x => x.Me is not null && viewer.CanModify(x.Me))
            .Select(x => new MyGiftDto(
                x.Gift.Id, x.Gift.IsGroup, x.Gift.Units, x.Gift.Status, x.Me!.IsOrganizer, x.Me.Amount, x.Me.Message,
                x.Me.ExpiresAt, viewer.CanModify(x.Me), Pledged(x.Gift), Participants(x.Gift, viewer.User.Id)))
            .ToList();

    public static WishAvailabilityDto Availability(Wish w, Wishlist list, Actor? viewer)
    {
        var gifts = Active(w).ToList();
        var openGroup = gifts.FirstOrDefault(g => g.IsGroup && g.Status == GiftStatus.Planned);
        var givers = list.ShowGiverNames
            ? gifts.SelectMany(g => g.Participants).OrderBy(p => p.JoinedAt).Select(Name).Distinct().ToList()
            : [];
        return new WishAvailabilityDto(
            w.Id,
            GiftService.Available(w),
            GiftService.TakenUnits(w),
            gifts.Any(g => g.Participants.Any(p => p.IsOrganizer && p.ExpiresAt != null)),
            givers,
            openGroup is null ? null : new OpenGroupDto(openGroup.Id, openGroup.Participants.Count),
            Mine(w, viewer));
    }

    public static WishGiftsDto ForManager(Wish w, string viewerId) => new(
        w.Id, w.Name, w.State, w.Quantity, GiftService.TakenUnits(w),
        Active(w).OrderBy(g => g.CreatedAt)
            .Select(g => new GiftDto(g.Id, g.IsGroup, g.Units, g.Status, Pledged(g), Participants(g, viewerId)))
            .ToList());
}
