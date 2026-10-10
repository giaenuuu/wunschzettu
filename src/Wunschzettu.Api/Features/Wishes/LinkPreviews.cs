using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Scraping;

namespace Wunschzettu.Api.Features.Wishes;

/// Link previews (§4 WishLink): title, shop name and a thumbnail, fetched while saving a wish,
/// only for online links whose URL is new or changed. A failure just means no preview.
public class LinkPreviews(PageScraper scraper, ImageStore images, TimeProvider clock, ILogger<LinkPreviews> log)
{
    static readonly TimeSpan Budget = TimeSpan.FromSeconds(6);
    const int ImagesToTry = 2;

    /// Replaces the wish's links (they are replaced wholesale). Returns preview image keys nobody uses anymore:
    /// delete their files once the change is saved.
    public async Task<List<string>> ReplaceLinksAsync(Wish wish, IReadOnlyList<WishLinkRequest> requested, CancellationToken ct)
    {
        var old = wish.Links.ToList();
        var links = requested.Select((l, i) => new WishLink
        {
            Kind = l.Kind,
            Label = Trimmed(l.Label),
            Url = l.Kind == LinkKind.Online ? Trimmed(l.Url) : null,
            Note = Trimmed(l.Note),
            SortOrder = i,
        }).ToList();

        var kept = new HashSet<WishLink>();
        var toFetch = new List<WishLink>();
        foreach (var link in links.Where(l => l.Kind == LinkKind.Online))
        {
            var same = old.FirstOrDefault(o => o.Url == link.Url && o.PreviewFetchedAt is not null && !kept.Contains(o));
            if (same is null)
            {
                toFetch.Add(link);
                continue;
            }
            kept.Add(same);
            link.PreviewTitle = same.PreviewTitle;
            link.PreviewSiteName = same.PreviewSiteName;
            link.PreviewImageKey = same.PreviewImageKey;
            link.PreviewFetchedAt = same.PreviewFetchedAt;
        }

        if (toFetch.Count > 0)
        {
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
            budget.CancelAfter(Budget);
            await Task.WhenAll(toFetch.Select(l => FetchAsync(l, budget.Token, ct)));
        }

        wish.Links.Clear();
        wish.Links.AddRange(links);
        return old.Where(o => !kept.Contains(o) && o.PreviewImageKey is not null).Select(o => o.PreviewImageKey!).ToList();
    }

    public void DeleteImages(IEnumerable<string> keys)
    {
        foreach (var key in keys) images.Delete(key);
    }

    async Task FetchAsync(WishLink link, CancellationToken budget, CancellationToken request)
    {
        try
        {
            var page = (await scraper.ScrapeAsync(link.Url!, budget)).Page;
            if (page is not null)
            {
                link.PreviewTitle = page.Title;
                link.PreviewSiteName = page.SiteName;
                foreach (var url in page.Images.Take(ImagesToTry))
                {
                    var image = await scraper.FetchImageAsync(url, budget);
                    if (image.Bytes is null) continue;
                    using var stream = new MemoryStream(image.Bytes);
                    if (images.SaveThumbnail(stream) is not { } key) continue;
                    link.PreviewImageKey = key;
                    break;
                }
            }
            link.PreviewFetchedAt = clock.GetUtcNow().UtcDateTime;
        }
        catch (OperationCanceledException) when (!request.IsCancellationRequested)
        {
            // Out of time: no preview now, the next save tries again (PreviewFetchedAt stays null).
            log.LogInformation("Link preview for {Url} took too long", link.Url);
        }
    }

    static string? Trimmed(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
