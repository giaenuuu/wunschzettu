using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace Wunschzettu.Api.Features.Scraping;

public enum FetchError { None, InvalidUrl, Failed, TooLarge }

public record ScrapeOutcome(PageInfo? Page, Uri? FinalUrl, FetchError Error);

public record ImageOutcome(byte[]? Bytes, FetchError Error);

/// Fetches shop pages and images for "Wunsch aus Link" and link previews (§4 WishLink, §9 SSRF).
/// The HttpClient comes from SafeHttp.CreateHandler (tests swap in a fake handler).
public partial class PageScraper(HttpClient http, IMemoryCache cache, ILogger<PageScraper> log)
{
    const int MaxHtmlBytes = 2 * 1024 * 1024;
    public const int MaxImageBytes = 10 * 1024 * 1024;
    static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(15);

    public static void Configure(HttpClient client)
    {
        client.Timeout = SafeHttp.Timeout;
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Wunschzettu/1.0; +https://github.com/)");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("de-CH,de;q=0.9,en;q=0.8");
    }

    /// Successful results are cached, so prefilling a wish and then saving its link fetches the page once.
    public async Task<ScrapeOutcome> ScrapeAsync(string url, CancellationToken ct)
    {
        if (!SafeHttp.IsAllowedUrl(url, out var uri)) return new(null, null, FetchError.InvalidUrl);
        var key = "scrape:" + uri.AbsoluteUri;
        if (cache.TryGetValue(key, out ScrapeOutcome? cached)) return cached!;

        var outcome = await FetchPageAsync(uri, ct);
        if (outcome.Error == FetchError.None) cache.Set(key, outcome, CacheFor);
        return outcome;
    }

    async Task<ScrapeOutcome> FetchPageAsync(Uri uri, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.Accept.ParseAdd("text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            var type = response.Content.Headers.ContentType?.MediaType;
            if (!response.IsSuccessStatusCode || type is not null && !type.Contains("html", StringComparison.OrdinalIgnoreCase))
                return new(null, null, FetchError.Failed);

            var (bytes, _) = await ReadCappedAsync(response, MaxHtmlBytes, truncate: true, ct);
            var html = Decode(bytes, response.Content.Headers.ContentType);
            var finalUrl = response.RequestMessage?.RequestUri ?? uri;
            return new(PageParser.Parse(html, finalUrl), finalUrl, FetchError.None);
        }
        catch (Exception e) when (IsFetchFailure(e, ct))
        {
            log.LogInformation("Fetching {Url} failed: {Error}", uri, e.Message);
            return new(null, null, Blocked(e) ? FetchError.InvalidUrl : FetchError.Failed);
        }
    }

    public async Task<ImageOutcome> FetchImageAsync(string url, CancellationToken ct)
    {
        if (!SafeHttp.IsAllowedUrl(url, out var uri)) return new(null, FetchError.InvalidUrl);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            // Only formats SkiaSharp decodes. CDNs (AliExpress, Shopify, Cloudinary) answer AVIF to anyone who lists it.
            request.Headers.Accept.ParseAdd("image/webp,image/png,image/jpeg,image/gif;q=0.9,image/*;q=0.5");
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) return new(null, FetchError.Failed);
            if (response.Content.Headers.ContentLength > MaxImageBytes) return new(null, FetchError.TooLarge);

            var (bytes, complete) = await ReadCappedAsync(response, MaxImageBytes, truncate: false, ct);
            return complete ? new(bytes, FetchError.None) : new(null, FetchError.TooLarge);
        }
        catch (Exception e) when (IsFetchFailure(e, ct))
        {
            log.LogInformation("Fetching image {Url} failed: {Error}", uri, e.Message);
            return new(null, Blocked(e) ? FetchError.InvalidUrl : FetchError.Failed);
        }
    }

    static async Task<(byte[] Bytes, bool Complete)> ReadCappedAsync(HttpResponseMessage response, int max, bool truncate, CancellationToken ct)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > max)
            {
                if (!truncate) return ([], false);
                buffer.Write(chunk, 0, (int)(max - buffer.Length));
                return (buffer.ToArray(), false);
            }
            buffer.Write(chunk, 0, read);
        }
        return (buffer.ToArray(), true);
    }

    /// Charset from the Content-Type header, else from a meta tag near the top, else UTF-8.
    static string Decode(byte[] bytes, MediaTypeHeaderValue? contentType)
    {
        var charset = contentType?.CharSet;
        if (string.IsNullOrEmpty(charset))
        {
            var head = Encoding.ASCII.GetString(bytes, 0, Math.Min(bytes.Length, 4096));
            charset = MetaCharset().Match(head) is { Success: true } m ? m.Groups[1].Value : null;
        }
        var encoding = charset?.Trim('"', '\'').ToLowerInvariant() switch
        {
            "iso-8859-1" or "latin1" or "windows-1252" or "cp1252" or "us-ascii" => Encoding.Latin1,
            _ => Encoding.UTF8,
        };
        return encoding.GetString(bytes);
    }

    static bool IsFetchFailure(Exception e, CancellationToken ct) =>
        e is HttpRequestException or TaskCanceledException or IOException or BlockedAddressException or InvalidOperationException
        && !ct.IsCancellationRequested;

    static bool Blocked(Exception e) => e is BlockedAddressException || e.InnerException is BlockedAddressException;

    [GeneratedRegex(@"<meta[^>]+charset\s*=\s*[""']?([\w-]+)", RegexOptions.IgnoreCase)]
    private static partial Regex MetaCharset();
}
