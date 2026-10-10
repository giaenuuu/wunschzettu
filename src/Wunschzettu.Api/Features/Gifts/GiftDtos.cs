using System.ComponentModel.DataAnnotations;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Features.Gifts;

public record CreateGiftRequest(
    bool IsGroup,
    [property: Range(1, 999)] int? Units,
    [property: Range(0, 1_000_000)] decimal? Amount,
    [property: StringLength(500)] string? Message);

public record ParticipateRequest(
    [property: Range(0, 1_000_000)] decimal? Amount,
    [property: StringLength(500)] string? Message);

public record GiftRefDto(Guid GiftId);

public record ParticipantDto(string Name, decimal? Amount, string? Message, bool IsOrganizer, bool Unconfirmed, bool IsMe);

/// A gift the viewer takes part in. Participants of a group always see each other (§6).
public record MyGiftDto(
    Guid GiftId, bool IsGroup, int Units, GiftStatus Status, bool IsOrganizer, decimal? Amount, string? Message,
    DateTime? ExpiresAt, bool CanModify, decimal PledgedTotal, List<ParticipantDto> Participants);

public record OpenGroupDto(Guid GiftId, int ParticipantCount);

/// Gift state of one wish as a guest sees it. Never sent to recipients.
public record WishAvailabilityDto(
    Guid WishId,
    /// Units still free; null means unlimited.
    int? Available,
    int TakenUnits,
    bool HasUnconfirmed,
    /// Only filled when the list shows giver names.
    List<string> Givers,
    OpenGroupDto? OpenGroup,
    List<MyGiftDto> Mine);

public record AvailabilityDto(
    List<WishAvailabilityDto> Wishes,
    /// Wishes the viewer gives that were taken off the list ("nicht mehr nötig").
    List<RemovedWishDto> RemovedWishes);

public record RemovedWishDto(WishDto Wish, List<MyGiftDto> Mine);

/// Gift state of one wish for managers who aren't the recipient.
public record WishGiftsDto(Guid WishId, string WishName, WishState WishState, int? Quantity, int TakenUnits, List<GiftDto> Gifts);

public record GiftDto(Guid GiftId, bool IsGroup, int Units, GiftStatus Status, decimal PledgedTotal, List<ParticipantDto> Participants);

public record MyGiftSummaryDto(
    Guid GiftId, Guid WishId, string WishName, WishState WishState, string ListTitle, string ShareToken, ThemeDto Theme,
    DateOnly? EventDate, bool IsGroup, int Units, GiftStatus Status, bool IsOrganizer, bool Unconfirmed, int ParticipantCount);

public record ThanksEntryDto(Guid WishId, string WishName, bool IsGroup, List<ParticipantDto> Givers);
