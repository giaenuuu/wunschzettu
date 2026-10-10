using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.RateLimiting;
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
    const int RequestsPerMinute = 30;

    public static void AddScrapeRateLimit(this RateLimiterOptions o) =>
        o.AddPolicy(RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
            ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = RequestsPerMinute, Window = TimeSpan.FromMinutes(1) }));

    public static void MapScrapeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/scrape", Scrape)
            .WithTags("Scraping")
            .RequireAuthorization(Policies.ConfirmedUser)
            .RequireRateLimiting(RateLimitPolicy);
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
