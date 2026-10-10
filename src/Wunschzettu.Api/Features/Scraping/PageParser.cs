using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Wunschzettu.Api.Features.Scraping;

public enum Availability { InStock, OutOfStock, PreOrder }

/// What a shop page says about itself: Open Graph / Twitter meta tags (what messengers show in link previews)
/// and schema.org Product data, as JSON-LD or microdata.
public record PageInfo(
    string? Title, string? Description, decimal? Price, string? Currency, string? SiteName, List<string> Images,
    string? Brand = null, string? Gtin = null, Availability? Availability = null);

public static partial class PageParser
{
    const int MaxImages = 5;

    public static PageInfo Parse(string html, Uri pageUrl)
    {
        var meta = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (Match tag in MetaTag().Matches(html))
        {
            var attrs = Attributes(tag.Value);
            var key = attrs.GetValueOrDefault("property") ?? attrs.GetValueOrDefault("name") ?? attrs.GetValueOrDefault("itemprop");
            // Microdata also sits on <span itemprop="price" content="…"> and <link itemprop="availability" href="…">.
            if (key is null || (attrs.GetValueOrDefault("content") ?? attrs.GetValueOrDefault("href")) is not { } content) continue;
            content = Clean(content);
            if (content.Length == 0) continue;
            if (!meta.TryGetValue(key, out var values)) meta[key] = values = [];
            values.Add(content);
        }
        string? First(params string[] keys) => keys.Select(k => meta.GetValueOrDefault(k)?.FirstOrDefault()).FirstOrDefault(v => v is not null);

        var product = JsonLdProducts(html).FirstOrDefault();

        var title = product?.Name ?? First("og:title", "twitter:title")
            ?? (TitleTag().Match(html) is { Success: true } t ? Clean(t.Groups[1].Value) : null);
        // Shops often put their slogan into the meta description ("Smarter Shopping, Better Living! Aliexpress.com").
        var metaDescription = First("og:description", "twitter:description", "description");
        if (metaDescription?.Contains(ShopName(pageUrl), StringComparison.OrdinalIgnoreCase) == true) metaDescription = null;
        var description = product?.Description ?? metaDescription;

        var price = product?.Price ?? ParsePrice(First("product:price:amount", "og:price:amount", "price"));
        var currency = product?.Price is not null ? product.Currency : First("product:price:currency", "og:price:currency", "priceCurrency");

        var imageCandidates = new List<string>();
        foreach (var key in new[] { "og:image:secure_url", "og:image", "og:image:url" })
            imageCandidates.AddRange(meta.GetValueOrDefault(key) ?? []);
        imageCandidates.AddRange(product?.Images ?? []);
        foreach (var key in new[] { "twitter:image", "twitter:image:src", "image" })
            imageCandidates.AddRange(meta.GetValueOrDefault(key) ?? []);
        var images = imageCandidates
            .Select(i => Uri.TryCreate(pageUrl, i, out var abs) && abs.Scheme is "http" or "https" ? abs.AbsoluteUri : null)
            .OfType<string>().Distinct().Take(MaxImages).ToList();

        var siteName = (First("og:site_name", "application-name") ?? HostName(pageUrl)).TrimEnd('.', ' ', '-', '|');
        if (siteName.Length == 0) siteName = HostName(pageUrl);

        var brand = product?.Brand ?? First("product:brand", "og:brand", "brand");
        var gtin = new[] { product?.Gtin, First("product:ean", "product:gtin", "product:upc", "gtin13", "gtin", "gtin14", "gtin12", "gtin8", "ean") }
            .Select(NormalizeGtin).FirstOrDefault(g => g is not null);
        var availability = ParseAvailability(product?.Availability ?? First("product:availability", "og:availability", "availability"));

        return new PageInfo(Limit(StripSiteSuffix(title, pageUrl, siteName), 200), Limit(description, 4000),
            price is >= 0 and < 10_000_000 ? price : null,
            currency is { Length: 3 } c && c.All(char.IsLetter) ? c.ToUpperInvariant() : null, Limit(siteName, 100), images,
            Limit(brand, 100), gtin, availability);
    }

    /// "Lego Technic Porsche | Galaxus" → "Lego Technic Porsche": titles often end with the shop's name, sometimes plus junk.
    public static string? StripSiteSuffix(string? title, Uri pageUrl, string siteName)
    {
        if (title is null) return null;
        var names = new[] { siteName, ShopName(pageUrl) }.Where(n => n.Length >= 3).ToArray();
        var m = TitleSuffix().Match(title);
        return m.Success && m.Index > 0 && names.Any(n => m.Groups[1].Value.Contains(n, StringComparison.OrdinalIgnoreCase))
            ? title[..m.Index].TrimEnd()
            : title;
    }

    /// "aliexpress" for de.aliexpress.com, "galaxus" for www.galaxus.ch.
    static string ShopName(Uri url)
    {
        var labels = url.Host.Split('.');
        return labels.Length >= 2 ? labels[^2] : url.Host;
    }

    /// GTIN-8/12/13/14 (EAN, UPC) with a valid check digit, else null.
    public static string? NormalizeGtin(string? text)
    {
        var digits = new string((text ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length is not (8 or 12 or 13 or 14) || digits.Length != (text ?? "").Count(ch => !char.IsWhiteSpace(ch) && ch != '-')) return null;
        var sum = 0;
        for (var i = 0; i < digits.Length - 1; i++)
            sum += (digits[digits.Length - 2 - i] - '0') * (i % 2 == 0 ? 3 : 1);
        return (10 - sum % 10) % 10 == digits[^1] - '0' ? digits : null;
    }

    /// schema.org URLs ("https://schema.org/InStock") and the Facebook catalogue words ("in stock", "oos", "preorder").
    public static Availability? ParseAvailability(string? text)
    {
        var key = new string((text ?? "").Split('/')[^1].Where(char.IsLetter).ToArray()).ToLowerInvariant();
        return key switch
        {
            "instock" or "limitedavailability" or "onlineonly" or "instoreonly" or "available" => Availability.InStock,
            "outofstock" or "oos" or "soldout" or "discontinued" or "unavailable" => Availability.OutOfStock,
            "preorder" or "presale" or "backorder" => Availability.PreOrder,
            _ => null,
        };
    }

    public static string HostName(Uri url) => url.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? url.Host[4..] : url.Host;

    /// "129.90", "1'299.–", "1.299,00", "1,299.00", "49,90", "CHF 1'299"
    public static decimal? ParsePrice(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var s = new string(text.Where(ch => char.IsDigit(ch) || ch is '.' or ',').ToArray()).Trim('.', ',');
        if (s.Length == 0) return null;

        // With both separators the last one is the decimal point. With one kind only, it is a thousands
        // separator if it repeats or is followed by exactly three digits ("1.299", "1,299,000").
        var last = s.LastIndexOfAny(['.', ',']);
        var decimalSep = last;
        if (last >= 0 && !(s.Contains('.') && s.Contains(',')) && (s.Count(ch => ch == s[last]) > 1 || s.Length - last - 1 == 3))
            decimalSep = -1;

        var integer = new string((decimalSep < 0 ? s : s[..decimalSep]).Where(char.IsDigit).ToArray());
        var fraction = decimalSep < 0 ? "" : s[(decimalSep + 1)..];
        return decimal.TryParse(fraction.Length > 0 ? $"{integer}.{fraction}" : integer, NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    record Product(string? Name, string? Description, decimal? Price, string? Currency, List<string> Images,
        string? Brand, string? Gtin, string? Availability);

    static IEnumerable<Product> JsonLdProducts(string html)
    {
        foreach (Match script in JsonLdScript().Matches(html))
        {
            JsonDocument doc;
            try { doc = JsonDocument.Parse(script.Groups[1].Value.Trim(), new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip }); }
            catch (JsonException) { continue; }
            using (doc)
            {
                foreach (var node in Walk(doc.RootElement))
                    if (IsType(node, "Product") && ToProduct(node) is { } p) yield return p;
            }
        }
    }

    static IEnumerable<JsonElement> Walk(JsonElement e, int depth = 0)
    {
        if (depth > 6) yield break;
        if (e.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in e.EnumerateArray())
                foreach (var x in Walk(item, depth + 1)) yield return x;
        }
        else if (e.ValueKind == JsonValueKind.Object)
        {
            yield return e;
            foreach (var key in new[] { "@graph", "mainEntity", "itemListElement", "item" })
                if (e.TryGetProperty(key, out var child))
                    foreach (var x in Walk(child, depth + 1)) yield return x;
        }
    }

    static bool IsType(JsonElement e, string type) =>
        e.TryGetProperty("@type", out var t) && (t.ValueKind == JsonValueKind.String
            ? string.Equals(t.GetString(), type, StringComparison.OrdinalIgnoreCase)
            : t.ValueKind == JsonValueKind.Array && t.EnumerateArray().Any(x => string.Equals(x.GetString(), type, StringComparison.OrdinalIgnoreCase)));

    static Product? ToProduct(JsonElement e)
    {
        var name = Text(e, "name");
        if (name is null) return null;

        decimal? price = null;
        string? currency = null;
        string? availability = null;
        if (e.TryGetProperty("offers", out var offers))
        {
            var offer = offers.ValueKind == JsonValueKind.Array ? offers.EnumerateArray().FirstOrDefault() : offers;
            if (offer.ValueKind == JsonValueKind.Object)
            {
                price = Number(offer, "price") ?? Number(offer, "lowPrice")
                    ?? (offer.TryGetProperty("priceSpecification", out var spec) && spec.ValueKind == JsonValueKind.Object ? Number(spec, "price") : null);
                availability = Text(offer, "availability");
                currency = Text(offer, "priceCurrency")
                    ?? (offer.TryGetProperty("priceSpecification", out var spec2) && spec2.ValueKind == JsonValueKind.Object ? Text(spec2, "priceCurrency") : null);
            }
        }

        var images = new List<string>();
        if (e.TryGetProperty("image", out var image)) CollectImages(image, images);
        var brand = e.TryGetProperty("brand", out var b)
            ? b.ValueKind == JsonValueKind.Object ? Text(b, "name") : b.ValueKind == JsonValueKind.String ? Text(e, "brand") : null
            : null;
        var gtin = new[] { "gtin13", "gtin", "gtin14", "gtin12", "gtin8", "ean" }.Select(k => Text(e, k) ?? (Number(e, k) is { } n ? n.ToString(CultureInfo.InvariantCulture) : null))
            .FirstOrDefault(g => g is not null);
        return new Product(name, Text(e, "description"), price, currency, images, brand, gtin, availability);
    }

    static void CollectImages(JsonElement e, List<string> into)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.String when e.GetString() is { Length: > 0 } s:
                into.Add(s.Trim());
                break;
            case JsonValueKind.Array:
                foreach (var item in e.EnumerateArray()) CollectImages(item, into);
                break;
            case JsonValueKind.Object when e.TryGetProperty("url", out var url) || e.TryGetProperty("contentUrl", out url):
                CollectImages(url, into);
                break;
        }
    }

    static string? Text(JsonElement e, string property) =>
        e.TryGetProperty(property, out var v) && v.ValueKind == JsonValueKind.String && Clean(v.GetString()!) is { Length: > 0 } s ? s : null;

    static decimal? Number(JsonElement e, string property) =>
        !e.TryGetProperty(property, out var v) ? null
        : v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d) ? d
        : v.ValueKind == JsonValueKind.String ? ParsePrice(v.GetString()) : null;

    static Dictionary<string, string> Attributes(string tag)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match a in Attribute().Matches(tag))
            result.TryAdd(a.Groups["name"].Value, a.Groups["dq"].Success ? a.Groups["dq"].Value : a.Groups["sq"].Success ? a.Groups["sq"].Value : a.Groups["bare"].Value);
        return result;
    }

    /// Entities decoded (twice: some shops double-encode), tags stripped, whitespace collapsed.
    static string Clean(string text) =>
        Whitespace().Replace(Tags().Replace(WebUtility.HtmlDecode(WebUtility.HtmlDecode(text)), " "), " ").Trim();

    static string? Limit(string? text, int max) => text is null ? null : text.Length <= max ? text : text[..(max - 1)].TrimEnd() + "…";

    /// <meta> tags, plus any element carrying microdata (itemprop) such as <span itemprop="price" content="…">.
    [GeneratedRegex(@"<meta\b[^>]*>|<[a-z]+\b[^>]*\bitemprop\s*=[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex MetaTag();

    [GeneratedRegex(@"\s[-|–—·:]\s([^-|–—·:]*)$")]
    private static partial Regex TitleSuffix();

    [GeneratedRegex(@"(?<name>[\w:.-]+)\s*=\s*(?:""(?<dq>[^""]*)""|'(?<sq>[^']*)'|(?<bare>[^\s""'>]+))")]
    private static partial Regex Attribute();

    [GeneratedRegex(@"<title\b[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex TitleTag();

    [GeneratedRegex(@"<script\b[^>]*type\s*=\s*[""']?application/ld\+json[""']?[^>]*>(.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex JsonLdScript();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
