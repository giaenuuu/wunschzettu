using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class WishlistTests(AppFactory app) : IClassFixture<AppFactory>
{
    static readonly JsonSerializerOptions Json = AppFactory.Json;

    static async Task<T> Read<T>(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<T>(Json))!;
    }

    static async Task<WishlistDetailDto> CreateList(HttpClient c, string title = "Geburtstag", bool forMe = true) =>
        await Read<WishlistDetailDto>(await c.PostAsJsonAsync("/api/wishlists", new { title, forMe }, Json));

    static async Task<WishDto> AddWish(HttpClient c, Guid listId, string name, object? extra = null) =>
        await Read<WishDto>(await c.PostAsJsonAsync($"/api/wishlists/{listId}/wishes",
            extra ?? new { name, quantity = 1 }, Json));

    [Fact]
    public async Task Anonymous_users_cannot_see_the_dashboard()
    {
        var c = app.Anonymous();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/wishlists")).StatusCode);
    }

    [Fact]
    public async Task Mutations_without_the_csrf_header_are_rejected()
    {
        var c = await app.UserAsync("csrf@example.com");
        c.DefaultRequestHeaders.Remove("X-Requested-With");
        var res = await c.PostAsJsonAsync("/api/wishlists", new { title = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Invalid_input_is_a_validation_problem()
    {
        var c = await app.UserAsync("validate@example.com");
        var res = await c.PostAsJsonAsync("/api/wishlists", new { title = "" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("Title", await res.Content.ReadAsStringAsync());

        res = await c.PostAsJsonAsync("/api/wishlists", new { title = "x", theme = new { palette = "Neon", layout = "Grid" } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        res = await c.PostAsJsonAsync("/api/wishlists", new { title = "x", currency = "chf" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Manager_builds_a_list_and_guests_see_it_through_the_link()
    {
        var owner = await app.UserAsync("owner@example.com");
        var list = await CreateList(owner);
        Assert.True(list.IsManager);
        Assert.True(list.IsRecipient);

        var bike = await AddWish(owner, list.Id, "Velo", new
        {
            name = "Velo", price = 450.50m, isFavorite = true, quantity = 1,
            links = new[] { new { kind = "Online", label = "Galaxus", url = (string?)"https://galaxus.ch/velo" }, new { kind = "Store", label = "Manor Bern", url = (string?)null } },
        });
        var books = await AddWish(owner, list.Id, "Bücher", new { name = "Bücher", quantity = (int?)null });
        var socks = await AddWish(owner, list.Id, "Socken");
        Assert.Equal(["Galaxus", "Manor Bern"], bike.Links.Select(l => l.Label));
        Assert.Null(books.Quantity);

        // Edit replaces the links.
        var edited = await Read<WishDto>(await owner.PutAsJsonAsync($"/api/wishes/{bike.Id}",
            new { name = "E-Bike", price = 2000m, quantity = 1, links = new[] { new { kind = "Store", label = "Velo Ruef" } } }, Json));
        Assert.Equal("E-Bike", edited.Name);
        Assert.Single(edited.Links);

        Assert.Equal(HttpStatusCode.NoContent,
            (await owner.PutAsJsonAsync($"/api/wishlists/{list.Id}/wishes/order", new[] { socks.Id, bike.Id, books.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/wishes/{books.Id}/fulfil", null)).StatusCode);

        var detail = await Read<WishlistDetailDto>(await owner.GetAsync($"/api/wishlists/{list.Id}"));
        Assert.Equal(["Socken", "E-Bike", "Bücher"], detail.Wishes.Select(w => w.Name));
        Assert.Equal(WishState.Fulfilled, detail.Wishes[2].State);

        // Guests see active wishes only, in order.
        var guest = app.Anonymous();
        var shared = await Read<SharedListDto>(await guest.GetAsync($"/api/shared/{list.ShareToken}"));
        Assert.Equal(ViewerRole.Guest, shared.ViewerRole);
        Assert.Equal(["Socken", "E-Bike"], shared.Wishes.Select(w => w.Name));

        // Recipient always wins.
        var own = await Read<SharedListDto>(await owner.GetAsync($"/api/shared/{list.ShareToken}"));
        Assert.Equal(ViewerRole.Recipient, own.ViewerRole);

        var dashboard = await Read<DashboardDto>(await owner.GetAsync("/api/wishlists"));
        Assert.Equal(2, Assert.Single(dashboard.Mine, l => l.Id == list.Id).WishCount);
    }

    [Fact]
    public async Task Strangers_cannot_touch_someone_elses_list()
    {
        var owner = await app.UserAsync("alice@example.com");
        var list = await CreateList(owner);
        var wish = await AddWish(owner, list.Id, "Buch");

        var stranger = await app.UserAsync("mallory@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/wishlists/{list.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/wishlists/{list.Id}/wishes", new { name = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/wishes/{wish.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/wishlists/{list.Id}")).StatusCode);
    }

    [Fact]
    public async Task Invited_lists_and_regenerated_tokens_hide_the_list_from_the_old_link()
    {
        var owner = await app.UserAsync("bob@example.com");
        var list = await CreateList(owner);
        var guest = app.Anonymous();
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync($"/api/shared/{list.ShareToken}")).StatusCode);

        var token = await Read<ShareTokenDto>(await owner.PostAsync($"/api/wishlists/{list.Id}/share-token", null));
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/shared/{list.ShareToken}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync($"/api/shared/{token.ShareToken}")).StatusCode);

        var update = new { title = "Weihnachten", currency = "CHF", access = "Invited", showGiverNames = false,
            theme = new { palette = "Forest", emoji = "🎄", layout = "List" } };
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync($"/api/wishlists/{list.Id}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/shared/{token.ShareToken}")).StatusCode);

        var detail = await Read<WishlistDetailDto>(await owner.GetAsync($"/api/wishlists/{list.Id}"));
        Assert.Equal(Palette.Forest, detail.Theme.Palette);
        Assert.Equal(ListLayout.List, detail.Theme.Layout);
    }

    [Fact]
    public async Task Deleted_lists_disappear_and_can_be_restored()
    {
        var owner = await app.UserAsync("carol@example.com");
        var list = await CreateList(owner);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/wishlists/{list.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/wishlists/{list.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await (app.Anonymous()).GetAsync($"/api/shared/{list.ShareToken}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/wishlists/{list.Id}/restore", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/wishlists/{list.Id}")).StatusCode);
    }

    [Fact]
    public async Task Unknown_api_routes_are_404_not_the_spa()
    {
        var c = app.Anonymous();
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/nope")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/healthz")).StatusCode);
    }
}
