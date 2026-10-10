using System.Net;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

public class GiftTests(AppFactory app) : IClassFixture<AppFactory>
{
    record Setup(HttpClient Owner, WishlistDetailDto List, string Token);

    async Task<Setup> ListAsync(string owner, bool forMe = true, bool showGiverNames = true)
    {
        var c = await app.UserAsync(owner, owner.Split('@')[0]);
        var list = await c.Post("/api/wishlists", new { title = "Geburtstag", forMe, eventDate = "2026-12-24" }).Read<WishlistDetailDto>();
        if (!showGiverNames)
            await c.Put($"/api/wishlists/{list.Id}", new { title = "Geburtstag", currency = "CHF", access = "Link", showGiverNames = false,
                eventDate = "2026-12-24", theme = new { palette = "Classic", layout = "Grid" } }).Ok();
        return new(c, list, list.ShareToken);
    }

    static Task<WishDto> AddWish(HttpClient c, Guid listId, string name, int? quantity = 1, bool group = false, decimal? price = null) =>
        c.Post($"/api/wishlists/{listId}/wishes", new { name, quantity, groupGiftAllowed = group, price }).Read<WishDto>();

    static Task<AvailabilityDto> Availability(HttpClient c, string token) => c.GetAsync($"/api/shared/{token}/availability").Read<AvailabilityDto>();

    static Task<HttpResponseMessage> Reserve(HttpClient c, string token, Guid wishId, object? body = null) =>
        c.Post($"/api/shared/{token}/wishes/{wishId}/gifts", body ?? new { isGroup = false });

    [Fact]
    public async Task A_guest_reserves_and_others_see_it_taken()
    {
        var s = await ListAsync("o1@example.com");
        var bike = await AddWish(s.Owner, s.List.Id, "Velo");
        var guest = await app.GuestAsync("anna@example.com", "Anna");

        var gift = await Reserve(guest, s.Token, bike.Id).Read<GiftRefDto>();
        var mine = (await Availability(guest, s.Token)).Wishes.Single();
        Assert.Equal(0, mine.Available);
        var myGift = Assert.Single(mine.Mine);
        Assert.Equal(gift.GiftId, myGift.GiftId);
        Assert.NotNull(myGift.ExpiresAt); // unconfirmed

        // The "Du hast gewählt" mail doubles as verification mail.
        var mail = (await app.MailsToAsync("anna@example.com")).Last();
        Assert.Contains("Velo", mail.Subject);
        Assert.Contains("/confirm?token=", mail.TextBody);

        var other = await app.GuestAsync("ben@example.com", "Ben");
        var seen = (await Availability(other, s.Token)).Wishes.Single();
        Assert.Equal((0, true), (seen.Available!.Value, seen.HasUnconfirmed));
        Assert.Equal(["Anna"], seen.Givers);
        Assert.Empty(seen.Mine);
        await Reserve(other, s.Token, bike.Id).Fails(409, "not-available");
        await Reserve(guest, s.Token, bike.Id).Fails(409, "already-participating");
    }

    [Fact]
    public async Task Units_and_unlimited_quantities()
    {
        var s = await ListAsync("o2@example.com");
        var socks = await AddWish(s.Owner, s.List.Id, "Socken", quantity: 3);
        var books = await AddWish(s.Owner, s.List.Id, "Bücher", quantity: null);

        await Reserve(await app.GuestAsync("u1@example.com", "U1"), s.Token, socks.Id, new { isGroup = false, units = 2 }).Ok();
        await Reserve(await app.GuestAsync("u2@example.com", "U2"), s.Token, socks.Id, new { isGroup = false, units = 2 }).Fails(409, "not-available");
        await Reserve(await app.GuestAsync("u3@example.com", "U3"), s.Token, socks.Id).Ok();

        for (var i = 0; i < 4; i++)
            await Reserve(await app.GuestAsync($"b{i}@example.com", $"B{i}"), s.Token, books.Id).Ok();
        var av = (await Availability(app.Anonymous(), s.Token)).Wishes.Single(w => w.WishId == books.Id);
        Assert.Null(av.Available);
        Assert.Equal(4, av.TakenUnits);
    }

    [Fact]
    public async Task Recipients_never_see_gift_state()
    {
        var s = await ListAsync("lena@example.com");
        var bike = await AddWish(s.Owner, s.List.Id, "Velo", group: true, price: 300);
        var book = await AddWish(s.Owner, s.List.Id, "Buch");

        async Task<(string, string, string)> Snapshot() => (
            await s.Owner.GetStringAsync($"/api/wishlists/{s.List.Id}"),
            await s.Owner.GetStringAsync($"/api/shared/{s.Token}"),
            await s.Owner.GetStringAsync("/api/wishlists"));
        var before = await Snapshot();

        await Reserve(await app.GuestAsync("g1@example.com", "G1"), s.Token, book.Id).Ok();
        await Reserve(await app.GuestAsync("g2@example.com", "G2"), s.Token, bike.Id, new { isGroup = true, amount = 100 }).Ok();

        Assert.Equal(before, await Snapshot());
        await s.Owner.GetAsync($"/api/shared/{s.Token}/availability").Fails(403);
        await s.Owner.GetAsync($"/api/wishlists/{s.List.Id}/gifts").Fails(403);
        await Reserve(s.Owner, s.Token, book.Id).Fails(403, "not-allowed");
    }

    [Fact]
    public async Task Managers_who_are_not_the_recipient_see_who_gives_what()
    {
        var s = await ListAsync("mama@example.com", forMe: false);
        var bike = await AddWish(s.Owner, s.List.Id, "Laufrad", group: true, price: 120);
        await Reserve(await app.GuestAsync("oma@example.com", "Oma"), s.Token, bike.Id, new { isGroup = true, amount = 50, message = "Für Lena" }).Ok();

        var gifts = await s.Owner.GetAsync($"/api/wishlists/{s.List.Id}/gifts").Read<List<WishGiftsDto>>();
        var gift = Assert.Single(Assert.Single(gifts).Gifts);
        Assert.Equal(50, gift.PledgedTotal);
        Assert.Equal(("Oma", true, true), (gift.Participants[0].Name, gift.Participants[0].IsOrganizer, gift.Participants[0].Unconfirmed));
        await Reserve(s.Owner, s.Token, bike.Id).Fails(403, "not-allowed");
    }

    [Fact]
    public async Task Group_gifts_join_leave_organizer_handover_and_bought()
    {
        var s = await ListAsync("o3@example.com", showGiverNames: false);
        var bike = await AddWish(s.Owner, s.List.Id, "Velo", group: true, price: 400);
        var plain = await AddWish(s.Owner, s.List.Id, "Buch");

        var anna = await app.UserAsync("ga@example.com", "Anna");
        var ben = await app.UserAsync("gb@example.com", "Ben");
        var cleo = await app.UserAsync("gc@example.com", "Cleo");
        var stranger = await app.GuestAsync("gx@example.com", "X");

        await Reserve(anna, s.Token, plain.Id, new { isGroup = true }).Fails(400, "group-not-allowed");
        var gift = await Reserve(anna, s.Token, bike.Id, new { isGroup = true, amount = 100 }).Read<GiftRefDto>();
        await Reserve(ben, s.Token, bike.Id, new { isGroup = true }).Fails(409, "join-existing");

        var open = (await Availability(ben, s.Token)).Wishes.Single(w => w.WishId == bike.Id);
        Assert.Equal(gift.GiftId, open.OpenGroup!.GiftId);
        Assert.Empty(open.Givers); // names hidden on this list

        app.Clock.Advance(TimeSpan.FromMinutes(1));
        await ben.Post($"/api/shared/{s.Token}/gifts/{gift.GiftId}/participants", new { amount = 150 }).Ok();
        app.Clock.Advance(TimeSpan.FromMinutes(1));
        await cleo.Post($"/api/shared/{s.Token}/gifts/{gift.GiftId}/participants", new { amount = 50 }).Ok();
        Assert.Contains((await app.MailsToAsync("ga@example.com")), m => m.Type == "GroupJoined");

        // Participants see each other, names and amounts, even though the list hides giver names.
        var benView = Assert.Single((await Availability(ben, s.Token)).Wishes.Single(w => w.WishId == bike.Id).Mine);
        Assert.Equal(300, benView.PledgedTotal);
        Assert.Equal(["Anna", "Ben", "Cleo"], benView.Participants.Select(p => p.Name));
        Assert.Empty((await Availability(stranger, s.Token)).Wishes.Single(w => w.WishId == bike.Id).Mine);

        // Only the organizer marks as bought; then nobody can leave.
        await ben.Post($"/api/gifts/{gift.GiftId}/bought").Fails(403, "not-organizer");
        await anna.Post($"/api/gifts/{gift.GiftId}/bought").Ok();
        await ben.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Fails(409, "gift-bought");
        await anna.DeleteAsync($"/api/gifts/{gift.GiftId}/bought").Ok();

        // The organizer leaves: the longest-standing participant takes over.
        await anna.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Ok();
        var after = Assert.Single((await Availability(ben, s.Token)).Wishes.Single(w => w.WishId == bike.Id).Mine);
        Assert.True(after.IsOrganizer);
        Assert.Contains(await app.MailsToAsync("gb@example.com"), m => m.Type == "NowOrganizer");

        await ben.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Ok();
        await cleo.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Ok();
        Assert.Null((await Availability(ben, s.Token)).Wishes.Single(w => w.WishId == bike.Id).OpenGroup);
        Assert.Equal(1, (await Availability(ben, s.Token)).Wishes.Single(w => w.WishId == bike.Id).Available);
    }

    [Fact]
    public async Task Unconfirmed_participations_can_only_be_changed_from_the_same_device()
    {
        var s = await ListAsync("o4@example.com");
        var wish = await AddWish(s.Owner, s.List.Id, "Puzzle");
        var phone = await app.GuestAsync("dora@example.com", "Dora");
        var gift = await Reserve(phone, s.Token, wish.Id).Read<GiftRefDto>();

        // Typing the same email on another device signs in, but reveals nothing of what the phone did.
        var laptop = await app.GuestAsync("dora@example.com", "Dora");
        Assert.Empty((await Availability(laptop, s.Token)).Wishes.Single().Mine);
        await laptop.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Fails(403, "wrong-device");
        Assert.Empty((await laptop.GetAsync("/api/wishlists").Read<DashboardDto>()).MyGifts);

        // Confirming the email on the laptop lifts the restriction.
        await laptop.Post("/api/auth/verify-code", new { email = "dora@example.com", code = await app.LatestCodeAsync("dora@example.com") }).Ok();
        Assert.Single((await laptop.GetAsync("/api/wishlists").Read<DashboardDto>()).MyGifts);
        await laptop.DeleteAsync($"/api/gifts/{gift.GiftId}/participants/me").Ok();
    }

    [Fact]
    public async Task Removing_a_given_wish_keeps_it_for_its_givers_and_tells_them()
    {
        var s = await ListAsync("o5@example.com");
        var wish = await AddWish(s.Owner, s.List.Id, "Lego");
        var giver = await app.UserAsync("giver5@example.com", "Giver");
        await Reserve(giver, s.Token, wish.Id).Ok();

        Assert.Equal(HttpStatusCode.NoContent, (await s.Owner.DeleteAsync($"/api/wishes/{wish.Id}")).StatusCode);
        Assert.Empty((await s.Owner.GetAsync($"/api/wishlists/{s.List.Id}").Read<WishlistDetailDto>()).Wishes);
        Assert.Empty((await app.Anonymous().GetAsync($"/api/shared/{s.Token}").Read<SharedListDto>()).Wishes);

        var removed = Assert.Single((await Availability(giver, s.Token)).RemovedWishes);
        Assert.Equal("Lego", removed.Wish.Name);
        Assert.Single(removed.Mine);
        Assert.Contains(await app.MailsToAsync("giver5@example.com"), m => m.Type == "WishChanged");
        var dashboard = await giver.GetAsync("/api/wishlists").Read<DashboardDto>();
        Assert.Equal(WishState.Removed, Assert.Single(dashboard.MyGifts).WishState);
        Assert.Single(dashboard.SharedWithMe);

        // Once the giver withdraws, the cleanup job deletes the wish for good.
        await giver.DeleteAsync($"/api/gifts/{removed.Mine[0].GiftId}/participants/me").Ok();
        await app.RunJobsAsync();
        Assert.False(await app.WithDb(db => Task.FromResult(db.Wishes.Any(w => w.Id == wish.Id))));
    }

    [Fact]
    public async Task Editing_price_or_quantity_notifies_givers_but_is_never_blocked()
    {
        var s = await ListAsync("o6@example.com");
        var wish = await AddWish(s.Owner, s.List.Id, "Kamera", quantity: 2, price: 200);
        await Reserve(await app.UserAsync("giver6@example.com", "G"), s.Token, wish.Id, new { isGroup = false, units = 2 }).Ok();

        await s.Owner.Put($"/api/wishes/{wish.Id}", new { name = "Kamera", quantity = 1, price = 250 }).Ok();
        Assert.Contains(await app.MailsToAsync("giver6@example.com"), m => m.Type == "WishChanged");
        await s.Owner.Post($"/api/wishes/{wish.Id}/fulfil").Ok();
        Assert.Equal(2, (await app.MailsToAsync("giver6@example.com")).Count(m => m.Type == "WishChanged"));
    }

    [Fact]
    public async Task Two_people_racing_for_the_last_unit_exactly_one_wins()
    {
        var s = await ListAsync("o7@example.com");
        var wish = await AddWish(s.Owner, s.List.Id, "Einzelstück");
        var racers = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => app.UserAsync($"racer{i}@example.com", $"R{i}")));

        var results = await Task.WhenAll(racers.Select(r => Reserve(r, s.Token, wish.Id)));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        Assert.All(results.Where(r => !r.IsSuccessStatusCode), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1, await app.WithDb(db => Task.FromResult(db.Gifts.Count(g => g.WishId == wish.Id))));
    }

    [Fact]
    public async Task Invite_only_lists_need_membership()
    {
        var s = await ListAsync("o8@example.com");
        var wish = await AddWish(s.Owner, s.List.Id, "Tee");
        await s.Owner.Put($"/api/wishlists/{s.List.Id}", new { title = "Geburtstag", currency = "CHF", access = "Invited", showGiverNames = true,
            theme = new { palette = "Classic", layout = "Grid" } }).Ok();

        var guest = await app.UserAsync("outsider@example.com", "O");
        await guest.GetAsync($"/api/shared/{s.Token}").Fails(404);
        await Reserve(guest, s.Token, wish.Id).Fails(404);

        await s.Owner.Post($"/api/wishlists/{s.List.Id}/members", new { email = "outsider@example.com", role = "Guest" }).Ok();
        await Reserve(guest, s.Token, wish.Id).Ok();
    }
}
