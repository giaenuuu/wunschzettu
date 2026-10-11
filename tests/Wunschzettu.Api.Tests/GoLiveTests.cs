using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

/// Lockout without abuse, data subject rights, retention and backups (§5.5, §5.10, §11).
public class GoLiveTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task Wrong_passwords_throttle_for_a_while_but_codes_keep_working()
    {
        var me = await app.UserAsync("throttle@example.com", "T");
        await me.Put("/api/auth/password", new { password = "the right one" }).Ok();
        var other = app.Anonymous();
        for (var i = 0; i < 5; i++)
            await other.Post("/api/auth/login-password", new { email = "throttle@example.com", password = "wrong" }).Fails(400, "invalid-login");

        await other.Post("/api/auth/login-password", new { email = "throttle@example.com", password = "the right one" }).Fails(400, "invalid-login");
        await app.UserAsync("throttle@example.com"); // the code still works: no account lockout

        app.Clock.Advance(LoginThrottle.Window + TimeSpan.FromMinutes(1));
        await other.Post("/api/auth/login-password", new { email = "throttle@example.com", password = "the right one" }).Ok();
    }

    [Fact]
    public async Task Look_alike_spellings_share_the_throttle()
    {
        var me = await app.UserAsync("kim@example.com", "Kim");
        await me.Put("/api/auth/password", new { password = "the right one" }).Ok();
        var attacker = app.Anonymous();
        for (var i = 0; i < 5; i++)
            await attacker.Post("/api/auth/login-password", new { email = "kim@example.com", password = "wrong" }).Fails(400, "invalid-login");

        // U+212A KELVIN SIGN normalizes to "K": Identity finds the same account, the throttle must too.
        await attacker.Post("/api/auth/login-password", new { email = "\u212Aim@example.com", password = "the right one" }).Fails(400, "invalid-login");
    }

    [Fact]
    public async Task Wrong_codes_burn_that_code_but_never_lock_the_account()
    {
        await app.UserAsync("codes@example.com", "C");
        var stranger = app.Anonymous();
        await stranger.Post("/api/auth/request-code", new { email = "codes@example.com" }).Ok();
        for (var i = 0; i < 8; i++)
            await stranger.Post("/api/auth/verify-code", new { email = "codes@example.com", code = "000000" }).Fails(400, "invalid-code");

        await app.UserAsync("codes@example.com"); // a fresh code works right away
    }

    [Fact]
    public async Task Logout_everywhere_ends_other_sessions_only()
    {
        var phone = await app.UserAsync("everywhere@example.com", "E");
        var laptop = await app.UserAsync("everywhere@example.com");

        await laptop.Post("/api/auth/logout-everywhere").Ok();
        app.Clock.Advance(TimeSpan.FromMinutes(6));

        Assert.Equal(HttpStatusCode.NoContent, (await phone.GetAsync("/api/auth/me")).StatusCode); // signed out
        await laptop.GetAsync("/api/wishlists").Ok();
    }

    [Fact]
    public async Task Export_contains_my_lists_and_gifts()
    {
        var me = await app.UserAsync("export@example.com", "X");
        var list = await me.Post("/api/wishlists", new { title = "Exportliste" }).Read<WishlistDetailDto>();
        await me.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Teekanne" }).Ok();
        var other = await app.UserAsync("export-o@example.com", "O");
        var otherList = await other.Post("/api/wishlists", new { title = "Fremd", forMe = true }).Read<WishlistDetailDto>();
        var wish = await other.Post($"/api/wishlists/{otherList.Id}/wishes", new { name = "Velo" }).Read<WishDto>();
        await me.Post($"/api/shared/{otherList.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false, message = "Viel Spass" }).Ok();

        var res = await me.GetAsync("/api/auth/me/export").Ok();
        Assert.Equal("wunschzettu-export.json", res.Content.Headers.ContentDisposition?.FileNameStar ?? res.Content.Headers.ContentDisposition?.FileName);
        var json = await res.Content.ReadAsStringAsync();
        Assert.Contains("Exportliste", json);
        Assert.Contains("Teekanne", json);
        Assert.Contains("Viel Spass", json);
        using var _ = JsonDocument.Parse(json);
    }

    [Fact]
    public async Task Deleting_the_account_needs_a_fresh_code_and_cleans_up()
    {
        var me = await app.UserAsync("leaver@example.com", "Lea");
        var mine = await me.Post("/api/wishlists", new { title = "Nur meine" }).Read<WishlistDetailDto>();
        var shared = await me.Post("/api/wishlists", new { title = "Gemeinsam" }).Read<WishlistDetailDto>();
        await me.Post($"/api/wishlists/{shared.Id}/members", new { email = "comanager@example.com", role = "Manager" }).Ok();

        var owner = await app.UserAsync("leaver-o@example.com", "O");
        var otherList = await owner.Post("/api/wishlists", new { title = "Fest", forMe = true }).Read<WishlistDetailDto>();
        var wish = await owner.Post($"/api/wishlists/{otherList.Id}/wishes", new { name = "Velo", groupGiftAllowed = true }).Read<WishDto>();
        var gift = await me.Post($"/api/shared/{otherList.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = true }).Read<GiftRefDto>();
        var partner = await app.UserAsync("leaver-p@example.com", "Pia");
        await partner.Post($"/api/shared/{otherList.ShareToken}/gifts/{gift.GiftId}/participants", new { }).Ok();

        await DeleteAccount(me, "123456").Fails(400, "invalid-code");
        await me.Post("/api/auth/request-code", new { email = "leaver@example.com" }).Ok();
        await DeleteAccount(me, await app.LatestCodeAsync("leaver@example.com")).Fails(400, "invalid-code"); // a login code doesn't delete
        await me.Post("/api/auth/me/deletion-code").Ok();
        var code = await app.LatestCodeAsync("leaver@example.com");
        Assert.Equal("DeletionCode", (await app.MailsToAsync("leaver@example.com")).Last().Type);
        await DeleteAccount(me, code).Ok();

        Assert.False(await app.WithDb(db => db.Users.AnyAsync(u => u.Email == "leaver@example.com")));
        Assert.False(await app.WithDb(db => db.Wishlists.AnyAsync(l => l.Id == mine.Id)));
        Assert.True(await app.WithDb(db => db.Wishlists.AnyAsync(l => l.Id == shared.Id)));
        Assert.Equal(1, await app.WithDb(db => db.GiftParticipants.CountAsync(p => p.GiftId == gift.GiftId)));
        Assert.True(await app.WithDb(db => db.GiftParticipants.AnyAsync(p => p.GiftId == gift.GiftId && p.IsOrganizer)));
        Assert.Contains(await app.MailsToAsync("leaver-p@example.com"), m => m.Type == "NowOrganizer");
        Assert.Equal(HttpStatusCode.NoContent, (await me.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Unconfirmed_empty_accounts_are_dropped_after_30_days()
    {
        await app.Anonymous().Post("/api/auth/request-code", new { email = "typo@example.com" }).Ok();

        app.Clock.Advance(TimeSpan.FromDays(31));
        await app.Anonymous().Post("/api/auth/request-code", new { email = "fresh@example.com" }).Ok();
        await app.RunJobsAsync();

        Assert.False(await app.WithDb(db => db.Users.AnyAsync(u => u.Email == "typo@example.com")));
        Assert.True(await app.WithDb(db => db.Users.AnyAsync(u => u.Email == "fresh@example.com")));
    }

    [Fact]
    public async Task An_old_unconfirmed_account_signing_in_right_now_is_kept()
    {
        await app.Anonymous().Post("/api/auth/request-code", new { email = "late@example.com" }).Ok();
        app.Clock.Advance(TimeSpan.FromDays(31));
        await app.Anonymous().Post("/api/auth/request-code", new { email = "late@example.com" }).Ok();

        await app.RunJobsAsync();

        await app.UserAsync("late@example.com"); // the fresh code still works
    }

    [Fact]
    public async Task A_list_made_for_someone_passes_to_them_when_its_manager_leaves()
    {
        var mom = await app.UserAsync("handover-m@example.com", "Mom");
        var list = await mom.Post("/api/wishlists", new { title = "Für Lena" }).Read<WishlistDetailDto>();
        await mom.Post($"/api/wishlists/{list.Id}/members", new { email = "handover-l@example.com", role = "Recipient" }).Ok();
        var lena = await app.UserAsync("handover-l@example.com", "Lena");

        await mom.Post("/api/auth/me/deletion-code").Ok();
        await DeleteAccount(mom, await app.LatestCodeAsync("handover-m@example.com")).Ok();

        await lena.GetAsync($"/api/wishlists/{list.Id}").Ok();
        await lena.GetAsync($"/api/wishlists/{list.Id}/gifts").Fails(403); // manager now, still recipient
    }

    [Fact]
    public async Task Jobs_write_a_daily_backup()
    {
        await app.RunJobsAsync();
        var dir = Path.Combine(Path.GetDirectoryName(app.ImagesDir)!, "backups");
        Assert.Contains(Directory.GetFiles(dir), f => Path.GetFileName(f).StartsWith("wunschzettu-"));
    }

    [Fact]
    public async Task Legal_info_and_privacy_headers()
    {
        var res = await app.Anonymous().GetAsync("/api/legal");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("default-src 'self'", res.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("noindex, nofollow", res.Headers.GetValues("X-Robots-Tag").Single());
    }

    static Task<HttpResponseMessage> DeleteAccount(HttpClient c, string code) =>
        c.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/auth/me") { Content = JsonContent.Create(new { code }) });
}
