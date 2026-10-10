using System.Net;
using System.Net.Http.Headers;
using SkiaSharp;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class ImageTests(AppFactory app) : IClassFixture<AppFactory>
{
    static byte[] Jpeg(int width, int height)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        surface.Canvas.Clear(SKColors.Orange);
        using var data = surface.Snapshot().Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    static Task<HttpResponseMessage> Upload(HttpClient c, Guid wishId, byte[] bytes, string name = "photo.jpg")
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, "file", name);
        return c.PostAsync($"/api/wishes/{wishId}/images", content);
    }

    [Fact]
    public async Task Uploads_become_resized_webp_files_served_with_long_caching()
    {
        var c = await app.UserAsync("img@example.com", "Img");
        var list = await c.Post("/api/wishlists", new { title = "Bilder" }).Read<WishlistDetailDto>();
        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Lampe" }).Read<WishDto>();

        var image = await Upload(c, wish.Id, Jpeg(3000, 2000)).Read<WishImageDto>();
        var res = await app.Anonymous().GetAsync(image.Url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("immutable", res.Headers.CacheControl!.ToString());
        using var decoded = SKBitmap.Decode(await res.Content.ReadAsByteArrayAsync());
        Assert.Equal((1600, 1067), (decoded.Width, decoded.Height));
        using var thumb = SKBitmap.Decode(await app.Anonymous().GetByteArrayAsync(image.ThumbUrl));
        Assert.Equal(480, thumb.Width);

        var shared = await app.Anonymous().GetAsync($"/api/shared/{list.ShareToken}").Read<SharedListDto>();
        Assert.Equal(image.Url, Assert.Single(shared.Wishes[0].Images).Url);

        for (var i = 0; i < 4; i++) await Upload(c, wish.Id, Jpeg(200, 200)).Ok();
        await Upload(c, wish.Id, Jpeg(200, 200)).Fails(409, "too-many-images");

        await c.DeleteAsync($"/api/wishes/{wish.Id}/images/{image.Id}").Ok();
        Assert.False(File.Exists(Path.Combine(app.ImagesDir, image.Url.Split('/').Last())));
    }

    [Fact]
    public async Task Non_images_and_strangers_are_rejected()
    {
        var c = await app.UserAsync("img2@example.com", "Img");
        var list = await c.Post("/api/wishlists", new { title = "Bilder" }).Read<WishlistDetailDto>();
        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Lampe" }).Read<WishDto>();

        await Upload(c, wish.Id, "not an image"u8.ToArray()).Fails(400, "not-an-image");
        await Upload(await app.UserAsync("stranger@example.com"), wish.Id, Jpeg(10, 10)).Fails(404);
        await Upload(await app.GuestAsync("guest-img@example.com", "G"), wish.Id, Jpeg(10, 10)).Fails(403);
    }
}
