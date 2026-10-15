using System.Net;
using System.Net.Http.Json;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Scraping;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class ScrapeTests(AppFactory app) : IClassFixture<AppFactory>
{
    const string ShopPage = """
        <html><head>
          <meta charset="utf-8">
          <title>Laufrad Woom 1 | Velo Shop</title>
          <meta property="og:title" content="Woom 1 Laufrad &amp; mehr | Velo Shop" />
          <meta property="og:site_name" content="Velo Shop">
          <meta name="description" content="Das leichteste Laufrad.">
          <meta property="og:image" content="/img/woom.png">
          <script type="application/ld+json">
            {"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
              {"@type":"Product","name":"Woom 1","description":"Laufrad ab 18 Monaten",
               "image":["https://shop.example/img/woom.png","https://shop.example/img/woom-2.png"],
               "offers":[{"@type":"Offer","price":"299.00","priceCurrency":"CHF"}]}]}
          </script>
        </head><body></body></html>
        """;

    [Fact]
    public void Parser_prefers_product_data_and_resolves_images()
    {
        var info = PageParser.Parse(ShopPage, new Uri("https://www.shop.example/p/1"));
        Assert.Equal("Woom 1", info.Title);
        Assert.Equal("Laufrad ab 18 Monaten", info.Description);
        Assert.Equal(299m, info.Price);
        Assert.Equal("CHF", info.Currency);
        Assert.Equal("Velo Shop", info.SiteName);
        Assert.Equal(["https://www.shop.example/img/woom.png", "https://shop.example/img/woom.png", "https://shop.example/img/woom-2.png"], info.Images);
    }

    [Fact]
    public void Parser_falls_back_to_meta_tags_and_title()
    {
        const string html = """
            <head><title> Lego &amp;amp; Duplo </title>
            <meta content='49,90' property='product:price:amount'><meta property="product:price:currency" content="eur">
            <meta name="twitter:image" content="https://cdn.example/a.jpg"></head>
            """;
        var info = PageParser.Parse(html, new Uri("https://www.galaxus.ch/de/s1/product/1"));
        Assert.Equal("Lego & Duplo", info.Title);
        Assert.Equal(49.90m, info.Price);
        Assert.Equal("EUR", info.Currency);
        Assert.Equal("galaxus.ch", info.SiteName);
        Assert.Equal(["https://cdn.example/a.jpg"], info.Images);
    }

    [Fact]
    public void Parser_reads_brand_barcode_and_availability_from_json_ld()
    {
        const string html = """
            <script type="application/ld+json">
              {"@type":"Product","name":"Technic Porsche 911","brand":{"@type":"Brand","name":"LEGO"},"gtin13":"5702016912494",
               "offers":{"price":189.9,"priceCurrency":"CHF","availability":"https://schema.org/OutOfStock"}}
            </script>
            """;
        var info = PageParser.Parse(html, new Uri("https://shop.example/p/1"));
        Assert.Equal("LEGO", info.Brand);
        Assert.Equal("5702016912494", info.Gtin);
        Assert.Equal(Availability.OutOfStock, info.Availability);
    }

    [Fact]
    public void Parser_reads_microdata_and_cleans_up_what_shops_send_to_messengers()
    {
        // Like AliExpress: no JSON-LD, the shop name glued to the title, a stray dot in og:site_name.
        const string html = """
            <meta property="og:title" content="Motorrad helm kinder off-road - AliExpress 201355758" />
            <meta property="og:site_name" content="aliexpress." />
            <meta property="og:description" content="Smarter Shopping, Better Living! Aliexpress.com" />
            <div itemscope itemtype="https://schema.org/Product">
              <span itemprop="brand" content="Fox"></span>
              <span itemprop="price" content="18.79"></span><meta itemprop="priceCurrency" content="CHF">
              <link itemprop="availability" href="https://schema.org/InStock">
              <span itemprop="gtin13" content="4006381333931"></span>
            </div>
            """;
        var info = PageParser.Parse(html, new Uri("https://de.aliexpress.com/item/1.html"));
        Assert.Equal("Motorrad helm kinder off-road", info.Title);
        Assert.Null(info.Description); // the shop's slogan, not about the product
        Assert.Equal("aliexpress", info.SiteName);
        Assert.Equal("Fox", info.Brand);
        Assert.Equal(18.79m, info.Price);
        Assert.Equal("CHF", info.Currency);
        Assert.Equal(Availability.InStock, info.Availability);
        Assert.Equal("4006381333931", info.Gtin);
    }

    [Theory]
    [InlineData("Lego Technic | Galaxus", "Lego Technic")]
    [InlineData("Duplo Zug – Manor", "Duplo Zug")]
    [InlineData("Spider-Man: Homecoming", "Spider-Man: Homecoming")]
    [InlineData("Tee - grün - Galaxus", "Tee - grün")]
    public void Shop_names_are_cut_from_titles(string title, string expected)
    {
        Assert.Equal(expected, PageParser.StripSiteSuffix(title, new Uri("https://www.galaxus.ch/x"), title.Contains("Manor") ? "Manor" : "Galaxus"));
    }

    [Theory]
    [InlineData("4006381333931", "4006381333931")]
    [InlineData("4006-3813-33931", "4006381333931")]
    [InlineData("96385074", "96385074")]
    [InlineData("4006381333932", null)] // wrong check digit
    [InlineData("ABC4006381333931", null)]
    [InlineData("12345", null)]
    public void Barcodes_need_a_valid_check_digit(string text, string? expected)
    {
        Assert.Equal(expected, PageParser.NormalizeGtin(text));
    }

    [Theory]
    [InlineData("129.90", "129.90")]
    [InlineData("1'299.–", "1299")]
    [InlineData("1.299,00", "1299.00")]
    [InlineData("1,299.50", "1299.50")]
    [InlineData("1.299", "1299")]
    [InlineData("CHF 49", "49")]
    [InlineData("gratis", null)]
    public void Prices_in_common_formats(string text, string? expected) =>
        Assert.Equal(expected is null ? null : decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), PageParser.ParsePrice(text));

    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("10.1.2.3", true)]
    [InlineData("172.20.0.1", true)]
    [InlineData("192.168.1.10", true)]
    [InlineData("169.254.169.254", true)]
    [InlineData("100.64.0.1", true)]
    [InlineData("0.0.0.0", true)]
    [InlineData("224.0.0.1", true)]
    [InlineData("::1", true)]
    [InlineData("::", true)]
    [InlineData("fe80::1", true)]
    [InlineData("fd00::1", true)]
    [InlineData("::ffff:192.168.1.1", true)]
    [InlineData("64:ff9b::a00:1", true)]
    [InlineData("2002:c0a8:0101::1", true)]
    [InlineData("8.8.8.8", false)]
    [InlineData("172.32.0.1", false)]
    [InlineData("2a00:1450:4001::1", false)]
    public void Internal_addresses_are_blocked(string address, bool blocked) =>
        Assert.Equal(blocked, SafeHttp.IsBlocked(IPAddress.Parse(address)));

    [Theory]
    [InlineData("https://shop.example/p", true)]
    [InlineData("http://shop.example:80/p", true)]
    [InlineData("https://shop.example:8443/p", false)]
    [InlineData("ftp://shop.example/p", false)]
    [InlineData("file:///etc/passwd", false)]
    [InlineData("http://127.0.0.1/", false)]
    [InlineData("http://[::1]/", false)]
    [InlineData("http://localhost/", false)]
    [InlineData("https://user:pw@shop.example/", false)]
    [InlineData("shop.example/p", false)]
    public void Only_public_web_urls_are_fetched(string url, bool allowed) => Assert.Equal(allowed, SafeHttp.IsAllowedUrl(url, out _));

    [Fact]
    public async Task Scrape_prefills_a_wish_from_a_shop_page()
    {
        app.Web.Page("https://shop.example/woom", ShopPage);
        var c = await app.UserAsync("scrape@example.com", "Scrape");

        var result = await c.Post("/api/scrape", new { url = "https://shop.example/woom" }).Read<ScrapeResultDto>();
        Assert.Equal("Woom 1", result.Title);
        Assert.Equal(299m, result.Price);
        Assert.Equal("https://shop.example/woom", result.Url);

        // Cached: a second request (e.g. the preview when saving the link) doesn't fetch again.
        await c.Post("/api/scrape", new { url = "https://shop.example/woom" }).Read<ScrapeResultDto>();
        Assert.Equal(1, app.Web.Hits("https://shop.example/woom"));

        await c.Post("/api/scrape", new { url = "http://127.0.0.1/admin" }).Fails(400, "invalid-url");
        await c.Post("/api/scrape", new { url = "not a url" }).Fails(400, "invalid-url");
        await c.Post("/api/scrape", new { url = "https://shop.example/missing" }).Fails(422, "scrape-failed");
        app.Web.Image("https://shop.example/picture.png");
        await c.Post("/api/scrape", new { url = "https://shop.example/picture.png" }).Fails(422, "scrape-failed");

        var anonymous = await app.Anonymous().PostAsJsonAsync("/api/scrape", new { url = "https://shop.example/woom" });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Fact]
    public async Task Online_links_get_a_preview_and_stores_need_a_name()
    {
        app.Web.Page("https://shop.example/lamp", """
            <meta property="og:title" content="Stehlampe Nordlicht"><meta property="og:site_name" content="Lampenland">
            <meta property="og:image" content="https://shop.example/lamp.png">
            """);
        app.Web.Image("https://shop.example/lamp.png");
        var c = await app.UserAsync("links@example.com", "Links");
        var list = await c.Post("/api/wishlists", new { title = "Wohnung" }).Read<WishlistDetailDto>();

        await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Lampe", links = new[] { new { kind = "Store", label = " " } } })
            .Fails(400);
        await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Lampe", links = new[] { new { kind = "Online", label = "Shop" } } })
            .Fails(400);
        await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Lampe", links = new[] { new { kind = "Online", url = "javascript:alert(1)" } } })
            .Fails(400);

        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new
        {
            name = "Lampe",
            links = new object[]
            {
                new { kind = "Online", url = "https://shop.example/lamp", note = "in Weiss" },
                new { kind = "Store", label = "Manor", url = "https://ignored.example", note = "Bern, 2. Stock" },
                new { kind = "Online", url = "https://shop.example/gone" },
            },
        }).Read<WishDto>();

        var online = wish.Links[0];
        Assert.Equal(LinkKind.Online, online.Kind);
        Assert.Equal("Stehlampe Nordlicht", online.Preview!.Title);
        Assert.Equal("Lampenland", online.Preview.SiteName);
        Assert.Equal(HttpStatusCode.OK, (await app.Anonymous().GetAsync(online.Preview.ImageUrl)).StatusCode);
        var store = wish.Links[1];
        Assert.Equal((LinkKind.Store, "Manor", (string?)null, "Bern, 2. Stock", (LinkPreviewDto?)null), (store.Kind, store.Label, store.Url, store.Note, store.Preview));
        Assert.Null(wish.Links[2].Preview); // 404: no preview, still a link

        // Unchanged URLs keep their preview without fetching again; dropped links take their thumbnail with them.
        var hits = app.Web.Hits("https://shop.example/lamp.png");
        var thumb = Path.Combine(app.ImagesDir, Path.GetFileName(online.Preview.ImageUrl!));
        var edited = await c.Put($"/api/wishes/{wish.Id}", new { name = "Lampe", links = new[] { new { kind = "Online", url = "https://shop.example/lamp", label = "Lampenland" } } })
            .Read<WishDto>();
        Assert.Equal(online.Preview, edited.Links.Single().Preview);
        Assert.Equal(hits, app.Web.Hits("https://shop.example/lamp.png"));
        Assert.True(File.Exists(thumb));

        await c.Put($"/api/wishes/{wish.Id}", new { name = "Lampe" }).Ok();
        Assert.False(File.Exists(thumb));
    }

    [Fact]
    public void Parser_finds_logo_candidates_best_first_and_skips_formats_we_cannot_decode()
    {
        const string html = """
            <link rel="icon" href="/favicon.ico"><link rel="icon" type="image/svg+xml" href="/logo.svg">
            <link rel="shortcut icon" sizes="32x32" href="/f32.png"><link rel="icon" sizes="192x192" href="/f192.png">
            <link rel="apple-touch-icon" sizes="120x120" href="/a120.png"><link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example/a180.png">
            """;
        var info = PageParser.Parse(html, new Uri("https://shop.example/p/1"));
        Assert.Equal(["https://cdn.example/a180.png", "https://shop.example/a120.png", "https://shop.example/f192.png"], info.Icons);
    }

    [Fact]
    public async Task Links_can_show_the_shop_logo_instead_of_the_product_picture()
    {
        app.Web.Page("https://logo.example/shirt", """
            <meta property="og:title" content="Shirt"><meta property="og:image" content="https://logo.example/shirt.png">
            <link rel="apple-touch-icon" href="/touch.png">
            """);
        app.Web.Image("https://logo.example/shirt.png");
        app.Web.Image("https://logo.example/touch.png");
        var c = await app.UserAsync("logo@example.com", "Logo");
        var list = await c.Post("/api/wishlists", new { title = "Kleider" }).Read<WishlistDetailDto>();

        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Shirt", links = new[] { new { kind = "Online", url = "https://logo.example/shirt", useLogo = true } } })
            .Read<WishDto>();
        var link = wish.Links.Single();
        Assert.True(link.UseLogo);
        Assert.NotNull(link.Preview!.ImageUrl);
        Assert.NotNull(link.Preview.LogoUrl);
        Assert.NotEqual(link.Preview.ImageUrl, link.Preview.LogoUrl);
        Assert.Equal(HttpStatusCode.OK, (await app.Anonymous().GetAsync(link.Preview.LogoUrl)).StatusCode);

        // Switching back only flips the flag; both pictures stay.
        var back = await c.Put($"/api/wishes/{wish.Id}", new { name = "Shirt", links = new[] { new { kind = "Online", url = "https://logo.example/shirt", useLogo = false } } })
            .Read<WishDto>();
        Assert.False(back.Links.Single().UseLogo);
        Assert.Equal(link.Preview, back.Links.Single().Preview);
    }

    [Fact]
    public async Task Shop_pictures_are_previewed_through_the_server()
    {
        app.Web.Image("https://shop.example/preview.png");
        app.Web.Page("https://shop.example/preview.html", "<p>no image</p>");
        var c = await app.UserAsync("preview@example.com", "Preview");

        var res = await c.GetAsync("/api/scrape/image?url=" + Uri.EscapeDataString("https://shop.example/preview.png"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("image/webp", res.Content.Headers.ContentType!.MediaType);
        Assert.True((await res.Content.ReadAsByteArrayAsync()).Length is > 0 and < 50_000);

        // The cropper works on the full-size picture (what an import would store), not the 320 px thumbnail.
        app.Web.File("https://shop.example/big.png", FakeWeb.Png(2400, 1600), "image/png");
        using var full = SkiaSharp.SKBitmap.Decode(await c.GetByteArrayAsync("/api/scrape/image?full=true&url=" + Uri.EscapeDataString("https://shop.example/big.png")));
        Assert.Equal(1600, full.Width);

        await c.GetAsync("/api/scrape/image?url=" + Uri.EscapeDataString("https://shop.example/preview.html")).Fails(400, "not-an-image");
        await c.GetAsync("/api/scrape/image?url=" + Uri.EscapeDataString("http://169.254.169.254/latest")).Fails(400, "invalid-url");
        await app.Anonymous().GetAsync("/api/scrape/image?url=" + Uri.EscapeDataString("https://shop.example/preview.png")).Fails(401);
    }

    [Fact]
    public async Task Images_can_be_imported_from_a_url()
    {
        app.Web.Image("https://shop.example/teddy.png");
        app.Web.Page("https://shop.example/teddy.html", "<p>no image</p>");
        var c = await app.UserAsync("import@example.com", "Import");
        var list = await c.Post("/api/wishlists", new { title = "Plüsch" }).Read<WishlistDetailDto>();
        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Teddy" }).Read<WishDto>();

        var image = await c.Post($"/api/wishes/{wish.Id}/images/import", new { url = "https://shop.example/teddy.png" }).Read<WishImageDto>();
        Assert.Equal(HttpStatusCode.OK, (await app.Anonymous().GetAsync(image.ThumbUrl)).StatusCode);

        await c.Post($"/api/wishes/{wish.Id}/images/import", new { url = "https://shop.example/teddy.html" }).Fails(400, "not-an-image");
        await c.Post($"/api/wishes/{wish.Id}/images/import", new { url = "https://shop.example/nope.png" }).Fails(422, "scrape-failed");
        await c.Post($"/api/wishes/{wish.Id}/images/import", new { url = "http://169.254.169.254/latest" }).Fails(400, "invalid-url");

        var stranger = await app.UserAsync("stranger-import@example.com", "Stranger");
        await stranger.Post($"/api/wishes/{wish.Id}/images/import", new { url = "https://shop.example/teddy.png" }).Fails(404);
    }

    [Fact]
    public async Task Images_from_cdns_that_negotiate_avif_still_import()
    {
        // AliExpress & co. send AVIF to anyone who lists it in Accept; SkiaSharp can't decode it.
        app.Web.NegotiatingImage("https://cdn.shop.example/helmet.jpg");
        var c = await app.UserAsync("avif@example.com", "Avif");
        var list = await c.Post("/api/wishlists", new { title = "Helme" }).Read<WishlistDetailDto>();
        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Helm" }).Read<WishDto>();

        await c.Post($"/api/wishes/{wish.Id}/images/import", new { url = "https://cdn.shop.example/helmet.jpg" }).Read<WishImageDto>();
    }

    [Fact]
    public async Task Wishes_keep_their_barcode()
    {
        var c = await app.UserAsync("gtin@example.com", "Gtin");
        var list = await c.Post("/api/wishlists", new { title = "Bauklötze" }).Read<WishlistDetailDto>();
        var wish = await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Porsche", gtin = "5702016912494" }).Read<WishDto>();
        Assert.Equal("5702016912494", wish.Gtin);

        await c.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Porsche", gtin = "570201" }).Fails(400);
        var cleared = await c.Put($"/api/wishes/{wish.Id}", new { name = "Porsche", gtin = (string?)null }).Read<WishDto>();
        Assert.Null(cleared.Gtin);
    }
}
