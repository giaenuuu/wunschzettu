using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Members;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class MemberTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task A_manager_invites_a_co_manager_who_signs_in_through_the_mail()
    {
        var mama = await app.UserAsync("mama@example.com", "Mama");
        var list = await mama.Post("/api/wishlists", new { title = "Lena", forMe = false, recipientName = "Lena" }).Read<WishlistDetailDto>();

        await mama.Post($"/api/wishlists/{list.Id}/members", new { email = "papa@example.com", role = "Manager" }).Ok();
        var mail = Assert.Single(await app.MailsToAsync("papa@example.com"));
        Assert.Contains("Mama", mail.Subject);

        var papa = app.Anonymous();
        var me = await papa.Post("/api/auth/confirm", new { token = await app.LatestLinkTokenAsync("papa@example.com") }).Read<MeDto>();
        Assert.True(me.EmailConfirmed);
        var detail = await papa.GetAsync($"/api/wishlists/{list.Id}").Read<WishlistDetailDto>();
        Assert.True(detail.IsManager && detail.CanSeeGifts);

        var members = await mama.GetAsync($"/api/wishlists/{list.Id}/members").Read<List<MemberDto>>();
        Assert.Equal(["mama@example.com", "papa@example.com"], members.Select(m => m.Email));
    }

    [Fact]
    public async Task The_member_list_never_shows_guests_who_joined_by_giving()
    {
        var me = await app.UserAsync("self@example.com", "Self");
        var list = await me.Post("/api/wishlists", new { title = "Meins" }).Read<WishlistDetailDto>();
        var wish = await me.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Buch" }).Read<WishDto>();
        await (await app.GuestAsync("secret@example.com", "Secret")).Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();

        var members = await me.GetAsync($"/api/wishlists/{list.Id}/members").Read<List<MemberDto>>();
        Assert.Equal(["self@example.com"], members.Select(m => m.Email));
    }

    [Fact]
    public async Task Typing_an_invited_persons_email_does_not_sign_in_as_them()
    {
        var mama = await app.UserAsync("owner-x@example.com", "Owner");
        var list = await mama.Post("/api/wishlists", new { title = "Privat", forMe = false }).Read<WishlistDetailDto>();
        foreach (var (email, role) in new[] { ("cm@example.com", "Manager"), ("rc@example.com", "Recipient"), ("gs@example.com", "Guest") })
        {
            await mama.Post($"/api/wishlists/{list.Id}/members", new { email, role }).Ok();

            var attacker = app.Anonymous();
            var res = await attacker.Post("/api/auth/identify", new { email, displayName = "Evil" }).Read<IdentifyResponse>();
            Assert.Equal(IdentifyStatus.CodeSent, res.Status);
            await attacker.GetAsync($"/api/wishlists/{list.Id}").Fails(401);
        }
    }

    [Fact]
    public async Task A_list_keeps_at_least_one_manager()
    {
        var me = await app.UserAsync("solo@example.com", "Solo");
        var list = await me.Post("/api/wishlists", new { title = "Solo" }).Read<WishlistDetailDto>();
        var myId = (await me.GetAsync("/api/auth/me").Read<MeDto>()).Id;

        await me.DeleteAsync($"/api/wishlists/{list.Id}/members/{myId}").Fails(409, "last-manager");
        await me.Put($"/api/wishlists/{list.Id}/members/{myId}", new { isManager = false, isRecipient = true }).Fails(409, "last-manager");
    }

    [Fact]
    public async Task An_invited_recipient_can_edit_wishes_but_not_see_gifts()
    {
        var mama = await app.UserAsync("mum@example.com", "Mum");
        var list = await mama.Post("/api/wishlists", new { title = "Max", forMe = false }).Read<WishlistDetailDto>();
        await mama.Post($"/api/wishlists/{list.Id}/members", new { email = "max@example.com", role = "Recipient" }).Ok();

        var max = app.Anonymous();
        await max.Post("/api/auth/confirm", new { token = await app.LatestLinkTokenAsync("max@example.com") }).Ok();
        await max.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Drohne" }).Ok();
        await max.GetAsync($"/api/wishlists/{list.Id}/gifts").Fails(403);
        await max.Put($"/api/wishlists/{list.Id}", new { title = "x", currency = "CHF", access = "Link", showGiverNames = true,
            theme = new { palette = "Classic", layout = "Grid" } }).Fails(403);
    }
}
