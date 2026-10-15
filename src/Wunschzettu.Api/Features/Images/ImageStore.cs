using Microsoft.Extensions.Options;
using SkiaSharp;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Images;

/// Uploads become WebP files on disk (§4 WishImage). Re-encoding drops all metadata, including phone GPS.
public class ImageStore(IOptions<AppOptions> options)
{
    const int MaxEdge = 1600;
    const int ThumbEdge = 480;
    const int PreviewEdge = 320;
    /// A 24 MP photo decodes to ~100 MB; bigger is refused, and the gate keeps parallel decodes from adding up.
    const long MaxPixels = 24_000_000;
    static readonly SemaphoreSlim Gate = new(2);

    string Dir => options.Value.ImagesDir;

    /// Returns the file key and stored size, or null if the data isn't a supported image.
    public (string Key, long Bytes)? Save(Stream input)
    {
        Gate.Wait();
        try { return SaveCore(input); }
        finally { Gate.Release(); }
    }

    (string Key, long Bytes)? SaveCore(Stream input)
    {
        using var upright = Decode(input);
        if (upright is null) return null;

        var key = Secrets.Token();
        Directory.CreateDirectory(Dir);
        var bytes = Write(upright, MaxEdge, 82, Path.Combine(Dir, $"{key}.webp"))
            + Write(upright, ThumbEdge, 75, Path.Combine(Dir, $"{key}_thumb.webp"));
        return (key, bytes);
    }

    /// Link previews only need the small version: {key}_thumb.webp.
    public string? SaveThumbnail(Stream input)
    {
        Gate.Wait();
        try { return SaveThumbnailCore(input); }
        finally { Gate.Release(); }
    }

    string? SaveThumbnailCore(Stream input)
    {
        using var upright = Decode(input);
        if (upright is null) return null;

        var key = Secrets.Token();
        Directory.CreateDirectory(Dir);
        Write(upright, ThumbEdge, 75, Path.Combine(Dir, $"{key}_thumb.webp"));
        return key;
    }

    /// A small WebP of a shop picture for the wish dialog's preview. Nothing is stored: the browser never talks to the shop.
    public byte[]? RenderPreview(Stream input)
    {
        Gate.Wait();
        try
        {
            using var upright = Decode(input);
            if (upright is null) return null;
            using var data = Render(upright, PreviewEdge, 70);
            return data.ToArray();
        }
        finally { Gate.Release(); }
    }

    static SKBitmap? Decode(Stream input)
    {
        using var codec = SKCodec.Create(input);
        if (codec is null || (long)codec.Info.Width * codec.Info.Height > MaxPixels) return null;

        var decoded = DecodeScaled(codec) ?? SKBitmap.Decode(codec);
        if (decoded is null) return null;
        var upright = ApplyOrientation(decoded, codec.EncodedOrigin);
        if (upright != decoded) decoded.Dispose();
        return upright;
    }

    /// JPEG and WebP can decode straight at a smaller size, which saves most of the memory for big photos.
    static SKBitmap? DecodeScaled(SKCodec codec)
    {
        var scale = (float)MaxEdge / Math.Max(codec.Info.Width, codec.Info.Height);
        if (scale >= 1) return null;
        var size = codec.GetScaledDimensions(scale);
        if (Math.Max(size.Width, size.Height) < MaxEdge || size == codec.Info.Size) return null;
        return SKBitmap.Decode(codec, codec.Info.WithSize(size));
    }

    public void Delete(string key)
    {
        File.Delete(Path.Combine(Dir, $"{key}.webp"));
        File.Delete(Path.Combine(Dir, $"{key}_thumb.webp"));
    }

    static long Write(SKBitmap source, int maxEdge, int quality, string path)
    {
        using var data = Render(source, maxEdge, quality);
        using var file = File.Create(path);
        data.SaveTo(file);
        return data.Size;
    }

    static SKData Render(SKBitmap source, int maxEdge, int quality)
    {
        var scale = Math.Min(1.0, (double)maxEdge / Math.Max(source.Width, source.Height));
        var info = new SKImageInfo(Math.Max(1, (int)Math.Round(source.Width * scale)), Math.Max(1, (int)Math.Round(source.Height * scale)));
        using var resized = scale < 1 ? source.Resize(info, new SKSamplingOptions(SKCubicResampler.Mitchell)) : null;
        using var image = SKImage.FromBitmap(resized ?? source);
        return image.Encode(SKEncodedImageFormat.Webp, quality);
    }

    /// Phones store photos sideways plus an EXIF hint; bake the rotation into the pixels. Returns src itself if upright.
    static SKBitmap ApplyOrientation(SKBitmap src, SKEncodedOrigin origin)
    {
        float w = src.Width, h = src.Height;
        // x' = a*x + b*y + c, y' = d*x + e*y + f
        SKMatrix? m = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => null,
        };
        if (m is null) return src;

        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var canvas = new SKCanvas(result);
        canvas.SetMatrix(m.Value);
        using var image = SKImage.FromBitmap(src);
        canvas.DrawImage(image, 0, 0, SKSamplingOptions.Default);
        return result;
    }
}
