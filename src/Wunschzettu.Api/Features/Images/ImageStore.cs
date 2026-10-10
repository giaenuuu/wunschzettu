using Microsoft.Extensions.Options;
using SkiaSharp;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Images;

/// Uploads become WebP files on disk (§4 WishImage). Re-encoding drops all metadata, including phone GPS.
public class ImageStore(IOptions<AppOptions> options)
{
    const int MaxEdge = 1600;
    const int ThumbEdge = 480;
    const long MaxPixels = 50_000_000;

    string Dir => options.Value.ImagesDir;

    /// Returns the file key and stored size, or null if the data isn't a supported image.
    public (string Key, long Bytes)? Save(Stream input)
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
        using var upright = Decode(input);
        if (upright is null) return null;

        var key = Secrets.Token();
        Directory.CreateDirectory(Dir);
        Write(upright, ThumbEdge, 75, Path.Combine(Dir, $"{key}_thumb.webp"));
        return key;
    }

    static SKBitmap? Decode(Stream input)
    {
        using var codec = SKCodec.Create(input);
        if (codec is null || (long)codec.Info.Width * codec.Info.Height > MaxPixels) return null;

        using var decoded = SKBitmap.Decode(codec);
        return decoded is null ? null : ApplyOrientation(decoded, codec.EncodedOrigin);
    }

    public void Delete(string key)
    {
        File.Delete(Path.Combine(Dir, $"{key}.webp"));
        File.Delete(Path.Combine(Dir, $"{key}_thumb.webp"));
    }

    static long Write(SKBitmap source, int maxEdge, int quality, string path)
    {
        var scale = Math.Min(1.0, (double)maxEdge / Math.Max(source.Width, source.Height));
        var info = new SKImageInfo(Math.Max(1, (int)Math.Round(source.Width * scale)), Math.Max(1, (int)Math.Round(source.Height * scale)));
        using var resized = scale < 1 ? source.Resize(info, new SKSamplingOptions(SKCubicResampler.Mitchell)) : null;
        using var image = SKImage.FromBitmap(resized ?? source);
        using var data = image.Encode(SKEncodedImageFormat.Webp, quality);
        using var file = File.Create(path);
        data.SaveTo(file);
        return data.Size;
    }

    /// Phones store photos sideways plus an EXIF hint; bake the rotation into the pixels.
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
        if (m is null) return src.Copy();

        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var canvas = new SKCanvas(result);
        canvas.SetMatrix(m.Value);
        using var image = SKImage.FromBitmap(src);
        canvas.DrawImage(image, 0, 0, SKSamplingOptions.Default);
        return result;
    }
}
