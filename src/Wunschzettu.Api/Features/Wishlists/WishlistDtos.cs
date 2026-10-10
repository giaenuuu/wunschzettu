using System.ComponentModel.DataAnnotations;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Wishes;

namespace Wunschzettu.Api.Features.Wishlists;

public enum ViewerRole { Guest, Manager, Recipient }

public record ThemeDto(Palette Palette, [property: StringLength(16)] string? Emoji, ListLayout Layout)
{
    public static ThemeDto From(Theme t) => new(t.Palette, t.Emoji, t.Layout);
    public Theme ToEntity() => new() { Palette = Palette, Emoji = string.IsNullOrWhiteSpace(Emoji) ? null : Emoji.Trim(), Layout = Layout };
}

public record WishlistSummaryDto(
    Guid Id, string Title, string? RecipientName, DateOnly? EventDate, ThemeDto Theme, string ShareToken,
    int WishCount, bool IsManager, bool IsRecipient);

public record ShareTokenDto(string ShareToken);

public record DashboardDto(List<WishlistSummaryDto> Mine, List<WishlistSummaryDto> SharedWithMe, List<MyGiftSummaryDto> MyGifts);

/// Manager and recipient view: wish data only. Gift state is a separate, manager-only endpoint (§6 no-leak).
public record WishlistDetailDto(
    Guid Id, string Title, string? Description, string? RecipientName, DateOnly? EventDate, string Currency,
    ListAccess Access, bool ShowGiverNames, ThemeDto Theme, string ShareToken,
    bool IsManager, bool IsRecipient, bool CanSeeGifts, bool CanShowThanks, List<WishDto> Wishes);

/// What everyone sees through the share link. Gift state comes from /availability.
public record SharedListDto(
    Guid Id, string Title, string? Description, string? RecipientName, DateOnly? EventDate, string Currency,
    ThemeDto Theme, ViewerRole ViewerRole, bool ShowGiverNames, List<WishDto> Wishes);

public record CreateWishlistRequest(
    [property: Required, StringLength(200, MinimumLength = 1)] string Title,
    [property: StringLength(4000)] string? Description,
    [property: StringLength(100)] string? RecipientName,
    DateOnly? EventDate,
    [property: RegularExpression("^[A-Z]{3}$")] string? Currency,
    ThemeDto? Theme,
    /// "Die Liste ist für mich": the creator becomes recipient as well as manager.
    bool ForMe = true);

public record UpdateWishlistRequest(
    [property: Required, StringLength(200, MinimumLength = 1)] string Title,
    [property: StringLength(4000)] string? Description,
    [property: StringLength(100)] string? RecipientName,
    DateOnly? EventDate,
    [property: Required, RegularExpression("^[A-Z]{3}$")] string Currency,
    ListAccess Access,
    bool ShowGiverNames,
    [property: Required] ThemeDto Theme);
