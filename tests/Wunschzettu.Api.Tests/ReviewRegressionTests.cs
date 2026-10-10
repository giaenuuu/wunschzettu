using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using Wunschzettu.Api.Features.Auth;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Images;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

/// Findings of the security, no-spoiler and robustness review (2026-10), each kept fixed.
public class ReviewRegressionTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task Session_started_by_someone_typing_the_email_dies_when_the_owner_confirms()
    {
        var attacker = await app.GuestAsync("victim@example.com", "Mallory");
        var victim = await app.UserAsync("victim@example.com", "Victim");
        await victim.Post("/api/wishlists", new { title = "Secret", forMe = true }).Ok();

        app.Clock.Advance(TimeSpan.FromMinutes(6)); // past the security stamp check interval
        var lists = await attacker.GetAsync("/api/wishlists");
        Assert.DoesNotContain("Secret", await lists.Content.ReadAsStringAsync());
        Assert.False((await attacker.PutAsJsonAsync("/api/auth/password", new { password = "attackerpw123" })).IsSuccessStatusCode);
        // The confirming device itself stays signed in.
        await victim.GetAsync("/api/wishlists").Ok();
    }

    [Fact]
    public async Task Setting_a_password_is_mailed_to_the_owner()
    {
        var me = await app.UserAsync("pwmail@example.com", "P");
        await me.Put("/api/auth/password", new { password = "long enough pw" }).Ok();
        Assert.Contains(await app.MailsToAsync("pwmail@example.com"), m => m.Type == "PasswordChanged");
    }

    [Fact]
    public async Task Recipient_cannot_unmake_themselves_recipient()
    {
        var me = await app.UserAsync("self-r@example.com", "R");
        var list = await me.Post("/api/wishlists", new { title = "Meins" }).Read<WishlistDetailDto>();
        var myId = (await me.GetAsync("/api/auth/me").Read<MeDto>()).Id;

        await me.Put($"/api/wishlists/{list.Id}/members/{myId}", new { isManager = true, isRecipient = false }).Fails(409, "self-recipient");
        await me.GetAsync($"/api/wishlists/{list.Id}/gifts").Fails(403);
    }

    [Fact]
    public async Task Giver_who_becomes_recipient_stops_giving()
    {
        var mama = await app.UserAsync("role-m@example.com", "Mama");
        var list = await mama.Post("/api/wishlists", new { title = "Wir", forMe = true }).Read<WishlistDetailDto>();
        var wish = await mama.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Velo", groupGiftAllowed = true }).Read<WishDto>();
        var ben = await app.UserAsync("role-b@example.com", "Ben");
        await ben.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = true }).Ok();

        await mama.Post($"/api/wishlists/{list.Id}/members", new { email = "role-b@example.com", role = "Recipient" }).Ok();

        Assert.Empty((await ben.GetAsync("/api/wishlists").Read<DashboardDto>()).MyGifts);
        Assert.False(await app.WithDb(db => db.GiftParticipants.AnyAsync(p => p.User.Email == "role-b@example.com")));
    }

    [Fact]
    public async Task Deleting_a_wish_removes_its_images_whether_or_not_it_was_taken()
    {
        var me = await app.UserAsync("img-del@example.com", "R");
        var list = await me.Post("/api/wishlists", new { title = "Meins" }).Read<WishlistDetailDto>();
        var taken = await me.Post($"/api/wishlists/{list.Id}/wishes", new { name = "A" }).Read<WishDto>();
        var free = await me.Post($"/api/wishlists/{list.Id}/wishes", new { name = "B" }).Read<WishDto>();
        var takenImage = await Upload(me, taken.Id, Jpeg(200, 200)).Read<WishImageDto>();
        var freeImage = await Upload(me, free.Id, Jpeg(200, 200)).Read<WishImageDto>();
        await (await app.GuestAsync("img-del-g@example.com", "Oma")).Post($"/api/shared/{list.ShareToken}/wishes/{taken.Id}/gifts", new { isGroup = false }).Ok();

        await me.DeleteAsync($"/api/wishes/{taken.Id}").Ok();
        await me.DeleteAsync($"/api/wishes/{free.Id}").Ok();

        Assert.Equal(HttpStatusCode.NotFound, (await me.GetAsync(takenImage.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await me.GetAsync(freeImage.Url)).StatusCode);
    }

    [Fact]
    public async Task Concurrent_reservations_all_succeed_while_units_are_left()
    {
        var owner = await app.UserAsync("race-o@example.com", "O");
        var list = await owner.Post("/api/wishlists", new { title = "G", forMe = true }).Read<WishlistDetailDto>();
        var wish = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Buch" }).Read<WishDto>();
        var guests = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => app.UserAsync($"race{i}@example.com", $"R{i}")));

        var results = await Task.WhenAll(guests.Select(g => g.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false })));

        Assert.All(results, r => Assert.True(r.IsSuccessStatusCode, $"{(int)r.StatusCode}"));
    }

    [Fact]
    public async Task A_guests_first_two_reservations_at_once_both_succeed()
    {
        var owner = await app.UserAsync("first-o@example.com", "O");
        var list = await owner.Post("/api/wishlists", new { title = "G", forMe = true }).Read<WishlistDetailDto>();
        var a = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "A" }).Read<WishDto>();
        var b = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "B" }).Read<WishDto>();
        var guest = await app.UserAsync("first-g@example.com", "G");

        var results = await Task.WhenAll(new[] { a, b }.Select(w => guest.Post($"/api/shared/{list.ShareToken}/wishes/{w.Id}/gifts", new { isGroup = false })));

        Assert.All(results, r => Assert.True(r.IsSuccessStatusCode, $"{(int)r.StatusCode}"));
    }

    [Fact]
    public async Task Two_managers_removing_each_other_leave_one()
    {
        for (var round = 0; round < 5; round++)
        {
            var a = await app.UserAsync($"mgr-a{round}@example.com", "A");
            var list = await a.Post("/api/wishlists", new { title = "G", forMe = false }).Read<WishlistDetailDto>();
            await a.Post($"/api/wishlists/{list.Id}/members", new { email = $"mgr-b{round}@example.com", role = "Manager" }).Ok();
            var b = await app.UserAsync($"mgr-b{round}@example.com", "B");
            var aId = (await a.GetAsync("/api/auth/me").Read<MeDto>()).Id;
            var bId = (await b.GetAsync("/api/auth/me").Read<MeDto>()).Id;

            await Task.WhenAll(a.DeleteAsync($"/api/wishlists/{list.Id}/members/{bId}"), b.DeleteAsync($"/api/wishlists/{list.Id}/members/{aId}"));

            Assert.Equal(1, await app.WithDb(db => db.ListMembers.CountAsync(m => m.WishlistId == list.Id && m.IsManager)));
        }
    }

    [Fact]
    public async Task Reordering_never_conflicts_with_gifts_or_itself()
    {
        var me = await app.UserAsync("order@example.com", "R");
        var list = await me.Post("/api/wishlists", new { title = "G", forMe = true }).Read<WishlistDetailDto>();
        var ids = new List<Guid>();
        for (var i = 0; i < 5; i++) ids.Add((await me.Post($"/api/wishlists/{list.Id}/wishes", new { name = $"W{i}" }).Read<WishDto>()).Id);
        var guest = await app.UserAsync("order-g@example.com", "G");
        var reversed = ids.AsEnumerable().Reverse().ToList();

        var results = await Task.WhenAll(
            me.Put($"/api/wishlists/{list.Id}/wishes/order", reversed),
            me.Put($"/api/wishlists/{list.Id}/wishes/order", ids),
            guest.Post($"/api/shared/{list.ShareToken}/wishes/{ids[2]}/gifts", new { isGroup = false }));

        Assert.All(results, r => Assert.True(r.IsSuccessStatusCode, $"{(int)r.StatusCode}"));
    }

    [Fact]
    public void Huge_images_are_refused_and_big_photos_decode_scaled()
    {
        var store = app.Services.GetRequiredService<ImageStore>();
        Assert.Null(store.Save(new MemoryStream(Png(7000, 7000))));

        var saved = store.Save(new MemoryStream(Jpeg(6000, 4000)));
        Assert.NotNull(saved);
        using var stored = SKBitmap.Decode(Path.Combine(app.ImagesDir, $"{saved.Value.Key}.webp"));
        Assert.Equal(1600, stored.Width);
        Assert.Equal(1067, stored.Height);
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        var res = await app.Anonymous().GetAsync("/api/auth/me");
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("same-origin", res.Headers.GetValues("Referrer-Policy").Single());
    }

    static Task<HttpResponseMessage> Upload(HttpClient c, Guid wishId, byte[] jpeg)
    {
        var file = new ByteArrayContent(jpeg);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return c.PostAsync($"/api/wishes/{wishId}/images", new MultipartFormDataContent { { file, "file", "p.jpg" } });
    }

    static byte[] Jpeg(int w, int h) => Encode(w, h, SKEncodedImageFormat.Jpeg);
    static byte[] Png(int w, int h) => Encode(w, h, SKEncodedImageFormat.Png);

    static byte[] Encode(int w, int h, SKEncodedImageFormat format)
    {
        using var bitmap = new SKBitmap(w, h);
        bitmap.Erase(SKColors.Orange);
        using var data = SKImage.FromBitmap(bitmap).Encode(format, 90);
        return data.ToArray();
    }
}
