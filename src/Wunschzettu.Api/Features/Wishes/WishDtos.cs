using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Wishes;

/// Online: Url required, Label optional (shop name). Store: Label required (store name), no Url. Checked in WishEndpoints.
public record WishLinkRequest(
    LinkKind Kind,
    [property: StringLength(100)] string? Label,
    [property: StringLength(2000)] string? Url,
    [property: StringLength(500)] string? Note,
    /// Online links: show the shop's logo instead of the product picture.
    bool UseLogo = false);

public record LinkPreviewDto(string? Title, string? SiteName, string? ImageUrl, string? LogoUrl);

public record WishLinkDto(LinkKind Kind, string? Label, string? Url, string? Note, bool UseLogo, LinkPreviewDto? Preview)
{
    static string? Thumb(string? key) => key is null ? null : $"/img/{key}_thumb.webp";

    public static WishLinkDto From(WishLink l) => new(l.Kind, l.Label, l.Url, l.Note, l.UseLogo,
        l.PreviewTitle is null && l.PreviewImageKey is null && l.PreviewLogoKey is null ? null
            : new LinkPreviewDto(l.PreviewTitle, l.PreviewSiteName, Thumb(l.PreviewImageKey), Thumb(l.PreviewLogoKey)));
}

public record WishImageDto(Guid Id, string Url, string ThumbUrl);

/// Wish data only, never gift state: the same for every viewer (§6 no-leak).
public record WishDto(
    Guid Id, string Name, string? Description, decimal? Price, string? Gtin, bool IsFavorite,
    int? Quantity, bool GroupGiftAllowed, WishState State, List<WishLinkDto> Links, List<WishImageDto> Images)
{
    public static WishDto From(Wish w) => new(
        w.Id, w.Name, w.Description, w.Price, w.Gtin, w.IsFavorite, w.Quantity, w.GroupGiftAllowed, w.State,
        w.Links.OrderBy(l => l.SortOrder).Select(WishLinkDto.From).ToList(),
        w.Images.OrderBy(i => i.SortOrder).Select(i => new WishImageDto(i.Id, $"/img/{i.FileKey}.webp", $"/img/{i.FileKey}_thumb.webp")).ToList());
}

/// Quantity null means unlimited.
public record WishRequest(
    [property: Required, StringLength(200, MinimumLength = 1)] string Name,
    [property: StringLength(4000)] string? Description,
    [property: Range(0, 1_000_000)] decimal? Price,
    /// EAN/UPC: 8, 12, 13 or 14 digits.
    [property: RegularExpression(@"^(\d{8}|\d{12,14})$")] string? Gtin,
    bool IsFavorite,
    [property: Range(1, 999)] int? Quantity,
    bool GroupGiftAllowed,
    [property: MaxLength(10)] List<WishLinkRequest>? Links);

public static class WishQueries
{
    public static IQueryable<Wish> WithDetails(this IQueryable<Wish> wishes) =>
        wishes.Include(w => w.Links).Include(w => w.Images).AsSplitQuery();
}
