using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Scraping;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Images;

public static class ImageEndpoints
{
    const int MaxImagesPerWish = 5;
    const long MaxUploadBytes = 10 * 1024 * 1024;

    public static void MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/wishes/{wishId:guid}/images").WithTags("Images").RequireAuthorization(Policies.ConfirmedUser);

        group.MapPost("/", Upload)
            .DisableAntiforgery() // CSRF is covered by the custom header (Csrf.cs)
            .WithMetadata(new RequestSizeLimitAttribute(MaxUploadBytes + 64 * 1024))
            .RequireRateLimiting(ScrapeEndpoints.RateLimitPolicy); // decoding is the most expensive thing the server does
        group.MapPost("/import", Import).RequireRateLimiting(ScrapeEndpoints.RateLimitPolicy);
        group.MapDelete("/{imageId:guid}", Delete);
    }

    /// Serves /img/{key}.webp. File names are random and never change, so caching is forever.
    public static void UseImageFiles(this WebApplication app)
    {
        var dir = app.Services.GetRequiredService<IOptions<AppOptions>>().Value.ImagesDir;
        Directory.CreateDirectory(dir);
        app.UseStaticFiles(new StaticFileOptions
        {
            RequestPath = "/img",
            FileProvider = new PhysicalFileProvider(dir),
            OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable",
        });
    }

    static async Task<Wish?> LoadEditableAsync(Guid wishId, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        return await db.Wishes.Include(w => w.Images)
            .SingleOrDefaultAsync(w => w.Id == wishId && w.State != WishState.Removed && w.Wishlist.DeletedAt == null
                && w.Wishlist.Members.Any(m => m.UserId == userId && (m.IsManager || m.IsRecipient)), ct);
    }

    static async Task<Results<Ok<WishImageDto>, NotFound, ProblemHttpResult>> Upload(Guid wishId, IFormFile file, ClaimsPrincipal user,
        AppDbContext db, ImageStore store, TimeProvider clock, IOptions<AppOptions> options, CancellationToken ct)
    {
        var wish = await LoadEditableAsync(wishId, user, db, ct);
        if (wish is null) return TypedResults.NotFound();
        if ((CheckLimits(wish, file.Length) ?? await CheckQuotaAsync(user, db, options, ct)) is { } problem) return problem;

        await using var stream = file.OpenReadStream();
        return await StoreAsync(wish, stream, user, db, store, clock, ct);
    }

    /// "Wunsch aus Link": the server downloads a picture from the shop page (§9 SSRF rules apply).
    static async Task<Results<Ok<WishImageDto>, NotFound, ProblemHttpResult>> Import(Guid wishId, ImportImageRequest req, ClaimsPrincipal user,
        AppDbContext db, ImageStore store, PageScraper scraper, TimeProvider clock, IOptions<AppOptions> options, CancellationToken ct)
    {
        var wish = await LoadEditableAsync(wishId, user, db, ct);
        if (wish is null) return TypedResults.NotFound();
        if ((CheckLimits(wish, 0) ?? await CheckQuotaAsync(user, db, options, ct)) is { } problem) return problem;

        var fetched = await scraper.FetchImageAsync(req.Url, ct);
        if (fetched.Bytes is null) return ScrapeEndpoints.Problem(fetched.Error);
        using var stream = new MemoryStream(fetched.Bytes);
        return await StoreAsync(wish, stream, user, db, store, clock, ct);
    }

    static ProblemHttpResult? CheckLimits(Wish wish, long length)
    {
        if (wish.Images.Count >= MaxImagesPerWish)
            return TypedResults.Problem($"At most {MaxImagesPerWish} images per wish.", statusCode: 409, type: "too-many-images");
        if (length > MaxUploadBytes)
            return TypedResults.Problem("The image is larger than 10 MB.", statusCode: 413, type: "too-large");
        return null;
    }

    static async Task<ProblemHttpResult?> CheckQuotaAsync(ClaimsPrincipal user, AppDbContext db, IOptions<AppOptions> options, CancellationToken ct)
    {
        var userId = user.RequiredUserId();
        var used = await db.WishImages.Where(i => i.UploadedByUserId == userId).SumAsync(i => i.Bytes, ct);
        return used > options.Value.StorageQuotaMb * 1024L * 1024L
            ? TypedResults.Problem("Your storage quota is used up.", statusCode: 409, type: "quota-exceeded")
            : null;
    }

    static async Task<Results<Ok<WishImageDto>, NotFound, ProblemHttpResult>> StoreAsync(Wish wish, Stream stream, ClaimsPrincipal user,
        AppDbContext db, ImageStore store, TimeProvider clock, CancellationToken ct)
    {
        var saved = store.Save(stream);
        if (saved is not var (key, bytes))
            return TypedResults.Problem("This file isn't a supported image.", statusCode: 400, type: "not-an-image");

        var image = new WishImage
        {
            WishId = wish.Id,
            FileKey = key,
            Bytes = bytes,
            SortOrder = wish.Images.Count == 0 ? 0 : wish.Images.Max(i => i.SortOrder) + 1,
            UploadedByUserId = user.RequiredUserId(),
            CreatedAt = clock.GetUtcNow().UtcDateTime,
        };
        db.WishImages.Add(image);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new WishImageDto(image.Id, $"/img/{key}.webp", $"/img/{key}_thumb.webp"));
    }

    static async Task<Results<NoContent, NotFound>> Delete(Guid wishId, Guid imageId, ClaimsPrincipal user, AppDbContext db,
        ImageStore store, CancellationToken ct)
    {
        var wish = await LoadEditableAsync(wishId, user, db, ct);
        var image = wish?.Images.SingleOrDefault(i => i.Id == imageId);
        if (image is null) return TypedResults.NotFound();

        db.WishImages.Remove(image);
        await db.SaveChangesAsync(ct);
        store.Delete(image.FileKey);
        return TypedResults.NoContent();
    }
}
