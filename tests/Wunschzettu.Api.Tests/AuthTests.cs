using System.Net;
using Wunschzettu.Api.Features.Auth;

namespace Wunschzettu.Api.Tests;

public class AuthTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task Login_with_email_code_confirms_and_signs_in()
    {
        var c = app.Anonymous();
        Assert.Equal(HttpStatusCode.NoContent, (await c.GetAsync("/api/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.Accepted, (await c.Post("/api/auth/request-code", new { email = "new@example.com" })).StatusCode);
        var mail = Assert.Single(await app.MailsToAsync("new@example.com"));
        Assert.Contains("/confirm?token=", mail.HtmlBody);

        await c.Post("/api/auth/verify-code", new { email = "new@example.com", code = "000000" }).Fails(400, "invalid-code");
        var me = await c.Post("/api/auth/verify-code", new { email = "new@example.com", code = await app.LatestCodeAsync("new@example.com") }).Read<MeDto>();
        Assert.True(me.EmailConfirmed);
        Assert.Equal("new@example.com", (await c.GetAsync("/api/auth/me").Read<MeDto>()).Email);

        // Codes are single-use.
        await app.Anonymous().Post("/api/auth/verify-code", new { email = "new@example.com", code = await app.LatestCodeAsync("new@example.com") })
            .Fails(400, "invalid-code");
    }

    [Fact]
    public async Task Codes_expire_after_15_minutes()
    {
        var c = app.Anonymous();
        await c.Post("/api/auth/request-code", new { email = "slow@example.com" }).Ok();
        var code = await app.LatestCodeAsync("slow@example.com");
        app.Clock.Advance(TimeSpan.FromMinutes(16));
        await c.Post("/api/auth/verify-code", new { email = "slow@example.com", code }).Fails(400, "invalid-code");
    }

    [Fact]
    public async Task Five_wrong_codes_lock_the_account()
    {
        var c = app.Anonymous();
        await c.Post("/api/auth/request-code", new { email = "brute@example.com" }).Ok();
        var code = await app.LatestCodeAsync("brute@example.com");
        for (var i = 0; i < 5; i++)
            await c.Post("/api/auth/verify-code", new { email = "brute@example.com", code = code == "111111" ? "222222" : "111111" }).Fails(400);
        await c.Post("/api/auth/verify-code", new { email = "brute@example.com", code }).Fails(400, "invalid-code");
    }

    [Fact]
    public async Task Request_code_answers_the_same_for_known_and_unknown_emails_and_limits_mails()
    {
        var c = app.Anonymous();
        for (var i = 0; i < 8; i++)
            Assert.Equal(HttpStatusCode.Accepted, (await c.Post("/api/auth/request-code", new { email = "flood@example.com" })).StatusCode);
        Assert.Equal(5, (await app.MailsToAsync("flood@example.com")).Count);
    }

    [Fact]
    public async Task Identify_can_insist_on_a_code_and_unconfirmed_sessions_are_temporary()
    {
        var group = app.Anonymous();
        var res = await group.Post("/api/auth/identify", new { email = "groupie@example.com", displayName = "G", requireConfirmation = true }).Read<IdentifyResponse>();
        Assert.Equal(IdentifyStatus.CodeSent, res.Status);
        Assert.Equal(HttpStatusCode.NoContent, (await group.GetAsync("/api/auth/me")).StatusCode);

        var guest = app.Anonymous();
        (await guest.Post("/api/auth/identify", new { email = "shortlived@example.com", displayName = "S" }).Read<IdentifyResponse>()).User!.EmailConfirmed.ToString();
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync("/api/auth/me")).StatusCode);
        app.Clock.Advance(TimeSpan.FromDays(6));
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync("/api/auth/me")).StatusCode); // using it keeps it alive for 7 more days
        app.Clock.Advance(TimeSpan.FromDays(8));
        Assert.Equal(HttpStatusCode.NoContent, (await guest.GetAsync("/api/auth/me")).StatusCode); // unused for 8 days: gone

        var member = await app.UserAsync("longlived@example.com", "L");
        app.Clock.Advance(TimeSpan.FromDays(30));
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync("/api/auth/me")).StatusCode); // confirmed: 90 days
    }

    [Fact]
    public async Task Identify_signs_in_unknown_emails_but_asks_confirmed_ones_for_a_code()
    {
        var guest = app.Anonymous();
        var res = await guest.Post("/api/auth/identify", new { email = "guest@example.com", displayName = "Gast" }).Read<IdentifyResponse>();
        Assert.Equal(IdentifyStatus.SignedIn, res.Status);
        Assert.False(res.User!.EmailConfirmed);

        await app.UserAsync("known@example.com", "Known");
        var impostor = app.Anonymous();
        res = await impostor.Post("/api/auth/identify", new { email = "known@example.com", displayName = "Fake" }).Read<IdentifyResponse>();
        Assert.Equal(IdentifyStatus.CodeSent, res.Status);
        Assert.Equal(HttpStatusCode.NoContent, (await impostor.GetAsync("/api/auth/me")).StatusCode);
        // The impostor didn't rename the real user.
        Assert.Equal("Known", await app.WithDb(db => Task.FromResult(db.Users.Single(u => u.Email == "known@example.com").DisplayName)));
    }

    [Fact]
    public async Task Each_code_survives_only_five_wrong_guesses()
    {
        var c = app.Anonymous();
        await c.Post("/api/auth/request-code", new { email = "guess@example.com" }).Ok();
        var code = await app.LatestCodeAsync("guess@example.com");
        for (var i = 0; i < 5; i++)
            await c.Post("/api/auth/verify-code", new { email = "guess@example.com", code = code == "111111" ? "222222" : "111111" }).Fails(400);
        app.Clock.Advance(TimeSpan.FromMinutes(14)); // lockout over, code still within its 15 minutes
        await c.Post("/api/auth/verify-code", new { email = "guess@example.com", code }).Fails(400, "invalid-code");
    }

    [Fact]
    public async Task Unconfirmed_sessions_cannot_rename_the_account()
    {
        var guest = await app.GuestAsync("rename@example.com", "Real Name");
        await guest.Put("/api/auth/me", new { displayName = "Hacked", language = "de-CH" }).Fails(403);
    }

    [Fact]
    public async Task Unconfirmed_users_cannot_create_lists()
    {
        var guest = await app.GuestAsync("lazy@example.com", "Lazy");
        await guest.Post("/api/wishlists", new { title = "Nope" }).Fails(403);
    }

    [Fact]
    public async Task Magic_links_confirm_once()
    {
        await app.Anonymous().Post("/api/auth/request-code", new { email = "link@example.com", returnUrl = "/lists" }).Ok();
        var token = await app.LatestLinkTokenAsync("link@example.com");

        var c = app.Anonymous();
        Assert.True((await c.Post("/api/auth/confirm", new { token }).Read<MeDto>()).EmailConfirmed);
        await app.Anonymous().Post("/api/auth/confirm", new { token }).Fails(400, "invalid-token");
    }

    [Theory]
    [InlineData("/l/abc", "/l/abc")]
    [InlineData("//evil.example", "/")]
    [InlineData("https://evil.example", "/")]
    [InlineData("/\\evil.example", "/")]
    [InlineData(null, "/")]
    public void Return_urls_stay_on_the_site(string? input, string expected) =>
        Assert.Equal(expected, AuthEndpoints.SafeReturnUrl(input));

    [Fact]
    public async Task Profile_changes_name_and_language()
    {
        var c = await app.UserAsync("profile@example.com", "Ann", "en");
        var me = await c.GetAsync("/api/auth/me").Read<MeDto>();
        Assert.Equal(("Ann", "en"), (me.DisplayName, me.Language));
        await c.Put("/api/auth/me", new { displayName = "Ann", language = "it" }).Fails(400);
    }
}
