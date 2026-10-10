using System.Net;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Wishlists;

/// Share links mostly travel through WhatsApp & co. Their link previews don't run JavaScript,
/// so /l/{token} gets the SPA's index.html with the list's title as Open Graph tags.
public static class SharePreview
{
    public static void MapSharePreview(this WebApplication app)
    {
        app.MapGet("/l/{token}", async (string token, AppDbContext db, IWebHostEnvironment env, CancellationToken ct) =>
        {
            var index = env.WebRootFileProvider.GetFileInfo("index.html");
            if (!index.Exists) return Results.NotFound();
            using var reader = new StreamReader(index.CreateReadStream());
            var html = await reader.ReadToEndAsync(ct);

            var list = await db.Wishlists.AsNoTracking()
                .Where(l => l.ShareToken == token && l.DeletedAt == null && l.Access == ListAccess.Link)
                .Select(l => new { l.Title, l.RecipientName, l.Theme })
                .SingleOrDefaultAsync(ct);
            if (list is not null)
            {
                var title = WebUtility.HtmlEncode($"{list.Theme.Emoji ?? "🎁"} {list.Title}");
                var description = WebUtility.HtmlEncode(list.RecipientName is { Length: > 0 } r
                    ? $"Wunschliste für {r} · Wish list for {r}"
                    : "Wunschliste · Wish list");
                html = html.Replace("<title>Wunschzettu</title>", $"""
                    <title>{title}</title>
                        <meta property="og:title" content="{title}" />
                        <meta property="og:description" content="{description}" />
                        <meta property="og:type" content="website" />
                    """);
            }
            return Results.Content(html, "text/html; charset=utf-8");
        }).ExcludeFromDescription();
    }
}
