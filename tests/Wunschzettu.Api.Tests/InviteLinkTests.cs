using System.Net;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Members;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class InviteLinkTests(AppFactory app) : IClassFixture<AppFactory>
{
    static string TokenOf(CreatedInviteLinkDto link) => link.Url[(link.Url.LastIndexOf('/') + 1)..];

    async Task<(HttpClient Owner, WishlistDetailDto List)> ListAsync(string owner)
    {
        var c = await app.UserAsync(owner, "Mama");
        return (c, await c.Post("/api/wishlists", new { title = "Lena", forMe = false, recipientName = "Lena" }).Read<WishlistDetailDto>());
    }

    [Fact]
    public async Task A_link_makes_whoever_opens_it_a_co_manager_once()
    {
        var (mama, list) = await ListAsync("il-mama@example.com");
        var link = await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Manager" }).Read<CreatedInviteLinkDto>();
        Assert.StartsWith("https://wunsch.test/invite/", link.Url);
        var token = TokenOf(link);

        var peek = await app.Anonymous().GetAsync($"/api/invite-links/{token}").Read<InvitePeekDto>();
        Assert.Equal(("Lena", "Mama", InviteLinkRole.Manager), (peek.ListTitle, peek.InviterName, peek.Role));

        var papa = await app.UserAsync("il-papa@example.com", "Papa");
        var accepted = await papa.Post($"/api/invite-links/{token}/accept", new { }).Read<AcceptInviteResponse>();
        Assert.Equal(list.Id, accepted.ListId);
        Assert.True((await papa.GetAsync($"/api/wishlists/{list.Id}").Read<WishlistDetailDto>()).IsManager);

        // Used up: a second person gets nothing, and the page says so.
        var other = await app.UserAsync("il-other@example.com", "Other");
        await other.Post($"/api/invite-links/{token}/accept", new { }).Fails(404);
        await other.GetAsync($"/api/wishlists/{list.Id}").Fails(404);
        await app.Anonymous().GetAsync($"/api/invite-links/{token}").Fails(404);
    }

    [Fact]
    public async Task Accepting_needs_a_confirmed_email_and_only_managers_create_links()
    {
        var (mama, list) = await ListAsync("il-mama2@example.com");
        var token = TokenOf(await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Manager" }).Read<CreatedInviteLinkDto>());

        await app.Anonymous().Post($"/api/invite-links/{token}/accept", new { }).Fails(401);
        await (await app.GuestAsync("il-guest@example.com", "Guest")).Post($"/api/invite-links/{token}/accept", new { }).Fails(403);

        var stranger = await app.UserAsync("il-stranger@example.com", "Stranger");
        await stranger.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Manager" }).Fails(404);
        await stranger.GetAsync($"/api/wishlists/{list.Id}/invite-links").Fails(404);
    }

    [Fact]
    public async Task Links_expire_can_be_revoked_and_do_not_burn_for_existing_members()
    {
        var (mama, list) = await ListAsync("il-mama3@example.com");
        var expired = await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Manager" }).Read<CreatedInviteLinkDto>();
        var revoked = await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Manager" }).Read<CreatedInviteLinkDto>();
        var spare = await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Recipient" }).Read<CreatedInviteLinkDto>();
        Assert.Equal(3, (await mama.GetAsync($"/api/wishlists/{list.Id}/invite-links").Read<List<InviteLinkDto>>()).Count);

        await mama.DeleteAsync($"/api/wishlists/{list.Id}/invite-links/{revoked.Id}").Ok();
        await app.Anonymous().GetAsync($"/api/invite-links/{TokenOf(revoked)}").Fails(404);

        // The owner opening their own link changes nothing and leaves it usable.
        await mama.Post($"/api/invite-links/{TokenOf(expired)}/accept", new { }).Ok();
        Assert.Equal(HttpStatusCode.OK, (await app.Anonymous().GetAsync($"/api/invite-links/{TokenOf(expired)}")).StatusCode);

        app.Clock.Advance(TimeSpan.FromDays(8));
        await app.Anonymous().GetAsync($"/api/invite-links/{TokenOf(spare)}").Fails(404);
        Assert.Empty(await mama.GetAsync($"/api/wishlists/{list.Id}/invite-links").Read<List<InviteLinkDto>>());
    }

    [Fact]
    public async Task A_recipient_link_ends_the_persons_own_gifts_on_that_list()
    {
        var (mama, list) = await ListAsync("il-mama4@example.com");
        var wish = await mama.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Buch" }).Read<WishDto>();
        var lena = await app.UserAsync("il-lena@example.com", "Lena");
        await lena.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();

        var token = TokenOf(await mama.Post($"/api/wishlists/{list.Id}/invite-links", new { role = "Recipient" }).Read<CreatedInviteLinkDto>());
        await lena.Post($"/api/invite-links/{token}/accept", new { }).Ok();

        var detail = await lena.GetAsync($"/api/wishlists/{list.Id}").Read<WishlistDetailDto>();
        Assert.True(detail.IsRecipient);
        Assert.False(detail.CanSeeGifts);
        await lena.GetAsync($"/api/shared/{list.ShareToken}/availability").Fails(403);
        // Her reservation ended as if she had withdrawn: the wish is free again for everyone else.
        var other = await app.UserAsync("il-other4@example.com", "Other");
        await other.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();
    }
}
