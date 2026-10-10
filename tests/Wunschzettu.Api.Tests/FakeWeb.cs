using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using SkiaSharp;

namespace Wunschzettu.Api.Tests;

/// Canned responses for the scraper, by absolute URL. Unknown URLs answer 404.
public class FakeWeb
{
    readonly ConcurrentDictionary<string, (byte[] Body, string ContentType)> _pages = new();
    readonly ConcurrentDictionary<string, int> _hits = new();
    readonly ConcurrentDictionary<string, byte[]> _negotiating = new();

    public void Page(string url, string html) => _pages[url] = (System.Text.Encoding.UTF8.GetBytes(html), "text/html; charset=utf-8");
    public void File(string url, byte[] body, string contentType) => _pages[url] = (body, contentType);
    public void Image(string url) => File(url, Png(), "image/png");
    /// Like image CDNs that negotiate the format: AVIF (which we can't decode) to clients that ask for it.
    public void NegotiatingImage(string url) => _negotiating[url] = Png();
    public int Hits(string url) => _hits.GetValueOrDefault(url);

    internal HttpResponseMessage Answer(HttpRequestMessage request)
    {
        var url = request.RequestUri!.AbsoluteUri;
        _hits.AddOrUpdate(url, 1, (_, n) => n + 1);
        if (_negotiating.TryGetValue(url, out var png))
            _pages[url] = request.Headers.Accept.Any(a => a.MediaType == "image/avif")
                ? ("not really avif, but just as undecodable"u8.ToArray(), "image/avif")
                : (png, "image/png");
        if (!_pages.TryGetValue(url, out var page)) return new HttpResponseMessage(HttpStatusCode.NotFound) { RequestMessage = request };
        var content = new ByteArrayContent(page.Body);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(page.ContentType);
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = content, RequestMessage = request };
    }

    public static byte[] Png(int width = 800, int height = 600)
    {
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        surface.Canvas.Clear(SKColors.Teal);
        using var data = surface.Snapshot().Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }
}

public class FakeWebHandler(FakeWeb web) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        Task.FromResult(web.Answer(request));
}
