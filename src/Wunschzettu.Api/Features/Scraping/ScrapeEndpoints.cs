using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Scraping;

public record ScrapeRequest([property: Required, StringLength(2000)] string Url);

public record ScrapeResultDto(string Url, string? Title, string? Description, decimal? Price, string? Currency, string? SiteName, List<string> Images,
    string? Brand, string? Gtin, Availability? Availability);

public record ImportImageRequest([property: Required, StringLength(2000)] string Url);

/// "Wunsch aus Link": reads a shop page so the wish dialog can be prefilled (§4 WishLink, §9 SSRF).
public static class ScrapeEndpoints
{
    public const string RateLimitPolicy = "scrape";
    public const string PreviewRateLimitPolicy = "scrape-preview";
    const int RequestsPerMinute = 30;
    /// One scraped page offers up to a dozen pictures, and the dialog loads them all as thumbnails.
    const int PreviewsPerMinute = 240;

    public static void AddScrapeRateLimit(this RateLimiterOptions o)
    {
        o.AddPolicy(RateLimitPolicy, ctx => PerUser(ctx, RequestsPerMinute));
        o.AddPolicy(PreviewRateLimitPolicy, ctx => PerUser(ctx, PreviewsPerMinute));
    }

    static RateLimitPartition<string> PerUser(HttpContext ctx, int limit) => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1) });

    public static void MapScrapeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/scrape", Scrape)
            .WithTags("Scraping")
            .RequireAuthorization(Policies.ConfirmedUser)
            .RequireRateLimiting(RateLimitPolicy);

        // Shop pictures for the wish dialog, fetched and shrunk by the server: the browser never contacts the shop
        // (no hotlink blocks, no IP leaked), and what the preview shows is what the import will store.
        app.MapGet("/api/scrape/image", PreviewImage)
            .WithTags("Scraping")
            .RequireAuthorization(Policies.ConfirmedUser)
            .RequireRateLimiting(PreviewRateLimitPolicy);
    }

    static async Task<Results<FileContentHttpResult, ProblemHttpResult>> PreviewImage(string url, PageScraper scraper, ImageStore store,
        IMemoryCache cache, HttpContext http, CancellationToken ct)
    {
        var key = "preview:" + url;
        if (!cache.TryGetValue(key, out byte[]? bytes))
        {
            var fetched = await scraper.FetchImageAsync(url, ct);
            if (fetched.Bytes is null) return Problem(fetched.Error);
            using var stream = new MemoryStream(fetched.Bytes);
            bytes = store.RenderPreview(stream);
            if (bytes is null) return TypedResults.Problem("This file isn't a supported image.", statusCode: 400, type: "not-an-image");
            cache.Set(key, bytes, TimeSpan.FromMinutes(10));
        }
        http.Response.Headers.CacheControl = "private, max-age=600";
        return TypedResults.File(bytes!, "image/webp");
    }

    static async Task<Results<Ok<ScrapeResultDto>, ProblemHttpResult>> Scrape(ScrapeRequest req, PageScraper scraper, CancellationToken ct)
    {
        var outcome = await scraper.ScrapeAsync(req.Url, ct);
        if (outcome.Page is not { } p) return Problem(outcome.Error);
        return TypedResults.Ok(new ScrapeResultDto(outcome.FinalUrl!.AbsoluteUri, p.Title, p.Description, p.Price, p.Currency, p.SiteName, p.Images,
            p.Brand, p.Gtin, p.Availability));
    }

    public static ProblemHttpResult Problem(FetchError error) => error switch
    {
        FetchError.InvalidUrl => TypedResults.Problem("Only public http(s) addresses can be read.", statusCode: 400, type: "invalid-url"),
        FetchError.TooLarge => TypedResults.Problem("The image is larger than 10 MB.", statusCode: 413, type: "too-large"),
        _ => TypedResults.Problem("The page could not be read.", statusCode: 422, type: "scrape-failed"),
    };
}
