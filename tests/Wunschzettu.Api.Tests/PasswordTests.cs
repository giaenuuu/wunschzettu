using System.Net;
using System.Net.Http.Json;
using Wunschzettu.Api.Features.Auth;

namespace Wunschzettu.Api.Tests;

public class PasswordTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task A_password_is_an_optional_second_way_in()
    {
        var c = await app.UserAsync("pw@example.com", "Pia");
        Assert.False((await c.GetFromJsonAsync<MeDto>("/api/auth/me", AppFactory.Json))!.HasPassword);

        await c.Put("/api/auth/password", new { password = "short" }).Fails(400);
        await c.Put("/api/auth/password", new { password = "lange genug" }).Ok();
        // Setting it renews this session instead of ending it.
        Assert.True((await c.GetFromJsonAsync<MeDto>("/api/auth/me", AppFactory.Json))!.HasPassword);

        var other = app.Anonymous();
        await other.Post("/api/auth/login-password", new { email = "pw@example.com", password = "falsch!!" }).Fails(400, "invalid-login");
        await other.Post("/api/auth/login-password", new { email = "nobody@example.com", password = "lange genug" }).Fails(400, "invalid-login");
        var me = await other.Post("/api/auth/login-password", new { email = " PW@example.com ", password = "lange genug" }).Read<MeDto>();
        Assert.Equal("Pia", me.DisplayName);
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/wishlists")).StatusCode);

        // Replace, then remove.
        await c.Put("/api/auth/password", new { password = "noch länger als vorher" }).Ok();
        await app.Anonymous().Post("/api/auth/login-password", new { email = "pw@example.com", password = "lange genug" }).Fails(400, "invalid-login");
        await app.Anonymous().Post("/api/auth/login-password", new { email = "pw@example.com", password = "noch länger als vorher" }).Ok();
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync("/api/auth/password")).StatusCode);
        Assert.False((await c.GetFromJsonAsync<MeDto>("/api/auth/me", AppFactory.Json))!.HasPassword);
        await app.Anonymous().Post("/api/auth/login-password", new { email = "pw@example.com", password = "noch länger als vorher" }).Fails(400, "invalid-login");
    }

    [Fact]
    public async Task Wrong_passwords_lock_the_account_for_a_while()
    {
        var c = await app.UserAsync("lock@example.com", "Lock");
        await c.Put("/api/auth/password", new { password = "richtig richtig" }).Ok();
        var attacker = app.Anonymous();
        for (var i = 0; i < 5; i++)
            await attacker.Post("/api/auth/login-password", new { email = "lock@example.com", password = $"falsch {i}" }).Fails(400, "invalid-login");
        await attacker.Post("/api/auth/login-password", new { email = "lock@example.com", password = "richtig richtig" }).Fails(400, "invalid-login");
    }

    [Fact]
    public async Task Unconfirmed_sessions_cannot_set_a_password()
    {
        var guest = await app.GuestAsync("guest-pw@example.com", "Gast");
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Put("/api/auth/password", new { password = "lange genug" })).StatusCode);
        await app.Anonymous().Post("/api/auth/login-password", new { email = "guest-pw@example.com", password = "lange genug" }).Fails(400, "invalid-login");
    }
}
