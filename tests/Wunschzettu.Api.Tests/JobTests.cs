using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Gifts;
using Wunschzettu.Api.Features.Wishes;
using Wunschzettu.Api.Features.Wishlists;

namespace Wunschzettu.Api.Tests;

/// Each test gets a fresh app, because the tests move the clock.
public class JobTests : IAsyncLifetime
{
    readonly AppFactory app = new();

    public Task InitializeAsync() => Task.CompletedTask;
    public Task DisposeAsync() => app.DisposeAsync().AsTask();

    async Task<(HttpClient Owner, WishlistDetailDto List)> ListAsync(string? eventDate = null)
    {
        var owner = await app.UserAsync("owner@example.com", "Owner");
        var list = await owner.Post("/api/wishlists", new { title = "Fest", forMe = true, eventDate }).Read<WishlistDetailDto>();
        return (owner, list);
    }

    Task<int> MailCount(string email, string type) =>
        app.MailsToAsync(email).ContinueWith(t => t.Result.Count(m => m.Type == type));

    [Fact]
    public async Task Unconfirmed_reservations_get_two_reminders_and_are_released_after_seven_days()
    {
        var (owner, list) = await ListAsync();
        var wish = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Teddy", quantity = 1 }).Read<WishDto>();
        var guest = await app.GuestAsync("typo@example.con", "Typo");
        await guest.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();

        app.Clock.Advance(TimeSpan.FromDays(1));
        await app.RunJobsAsync();
        Assert.Equal(0, await MailCount("typo@example.con", "ConfirmReminder"));

        app.Clock.Advance(TimeSpan.FromDays(1.1));
        await app.RunJobsAsync();
        await app.RunJobsAsync();
        Assert.Equal(1, await MailCount("typo@example.con", "ConfirmReminder"));

        app.Clock.Advance(TimeSpan.FromDays(3));
        await app.RunJobsAsync();
        Assert.Equal(2, await MailCount("typo@example.con", "ConfirmReminder"));

        app.Clock.Advance(TimeSpan.FromDays(2));
        await app.RunJobsAsync();
        Assert.Equal(1, await MailCount("typo@example.con", "Released"));
        var av = await app.Anonymous().GetAsync($"/api/shared/{list.ShareToken}/availability").Read<AvailabilityDto>();
        Assert.Equal(1, av.Wishes.Single().Available);
    }

    [Fact]
    public async Task Confirming_keeps_the_reservation()
    {
        var (owner, list) = await ListAsync();
        var wish = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Teddy", quantity = 1 }).Read<WishDto>();
        var guest = await app.GuestAsync("real@example.com", "Real");
        await guest.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();

        // Clicking the link in the "Du hast gewählt" mail.
        await app.Anonymous().Post("/api/auth/confirm", new { token = await app.LatestLinkTokenAsync("real@example.com") }).Ok();

        app.Clock.Advance(TimeSpan.FromDays(10));
        await app.RunJobsAsync();
        Assert.Equal(0, await MailCount("real@example.com", "ConfirmReminder"));
        Assert.Equal(0, (await app.Anonymous().GetAsync($"/api/shared/{list.ShareToken}/availability").Read<AvailabilityDto>()).Wishes.Single().Available);
    }

    [Fact]
    public async Task A_close_event_date_compresses_the_confirmation_window()
    {
        // Clock: 2 Nov 09:00. Event on 5 Nov → released on 4 Nov 00:00, not after 7 days.
        var (owner, list) = await ListAsync("2026-11-05");
        var wish = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Blumen", quantity = 1 }).Read<WishDto>();
        var guest = await app.GuestAsync("late@example.com", "Late");
        await guest.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = false }).Ok();

        var mine = Assert.Single((await guest.GetAsync($"/api/shared/{list.ShareToken}/availability").Read<AvailabilityDto>()).Wishes.Single().Mine);
        Assert.Equal(new DateTime(2026, 11, 4, 0, 0, 0, DateTimeKind.Utc), mine.ExpiresAt);

        app.Clock.Advance(TimeSpan.FromDays(1.6));
        await app.RunJobsAsync();
        Assert.Equal(0, await MailCount("late@example.com", "Released"));
        app.Clock.Advance(TimeSpan.FromDays(0.1));
        await app.RunJobsAsync();
        Assert.Equal(1, await MailCount("late@example.com", "Released"));
    }

    [Fact]
    public async Task After_the_event_given_wishes_are_fulfilled_and_the_thanks_list_opens()
    {
        var (owner, list) = await ListAsync("2026-11-20");
        var given = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Velo", quantity = 1 }).Read<WishDto>();
        var open = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Ballon", quantity = 1 }).Read<WishDto>();
        var books = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Bücher", quantity = (int?)null }).Read<WishDto>();
        var giver = await app.UserAsync("giver@example.com", "Gina");
        await giver.Post($"/api/shared/{list.ShareToken}/wishes/{given.Id}/gifts", new { isGroup = false, message = "Viel Spass!" }).Ok();
        await giver.Post($"/api/shared/{list.ShareToken}/wishes/{books.Id}/gifts", new { isGroup = false }).Ok();

        await owner.GetAsync($"/api/wishlists/{list.Id}/thanks").Fails(409, "too-early");

        // A week before: a reminder for gifts not yet bought.
        app.Clock.Advance(TimeSpan.FromDays(12));
        await app.RunJobsAsync();
        await app.RunJobsAsync();
        Assert.Equal(1, await MailCount("giver@example.com", "EventReminder"));

        app.Clock.Advance(TimeSpan.FromDays(7)); // 21 Nov
        await app.RunJobsAsync();

        var detail = await owner.GetAsync($"/api/wishlists/{list.Id}").Read<WishlistDetailDto>();
        Assert.Equal(WishState.Fulfilled, detail.Wishes.Single(w => w.Id == given.Id).State);
        Assert.Equal(WishState.Active, detail.Wishes.Single(w => w.Id == open.Id).State);
        Assert.Equal(WishState.Active, detail.Wishes.Single(w => w.Id == books.Id).State);
        Assert.True(detail.CanShowThanks);

        // Archived gifts no longer count: the books are available again for the next occasion.
        var av = await app.Anonymous().GetAsync($"/api/shared/{list.ShareToken}/availability").Read<AvailabilityDto>();
        Assert.Equal(0, av.Wishes.Single(w => w.WishId == books.Id).TakenUnits);

        var thanks = await owner.GetAsync($"/api/wishlists/{list.Id}/thanks").Read<List<ThanksEntryDto>>();
        var velo = thanks.Single(t => t.WishName == "Velo");
        Assert.Equal(("Gina", "Viel Spass!"), (velo.Givers[0].Name, velo.Givers[0].Message));
        Assert.Null(velo.Givers[0].Amount);
    }

    [Fact]
    public async Task Event_dates_cannot_be_moved_into_the_past_and_the_thanks_list_waits_for_the_event()
    {
        var (owner, list) = await ListAsync("2026-12-24");
        object Update(string? date) => new { title = "Fest", currency = "CHF", access = "Link", showGiverNames = true, eventDate = date,
            theme = new { palette = "Classic", layout = "Grid" } };

        await owner.Put($"/api/wishlists/{list.Id}", Update("2025-12-24")).Fails(400, "date-in-past");
        await owner.Post("/api/wishlists", new { title = "Alt", eventDate = "2026-01-01" }).Fails(400, "date-in-past");

        // Moving the date to today doesn't open the Dankesliste: it opens once the occasion is processed.
        await owner.Put($"/api/wishlists/{list.Id}", Update("2026-11-02")).Ok();
        await owner.GetAsync($"/api/wishlists/{list.Id}/thanks").Fails(409, "too-early");
        app.Clock.Advance(TimeSpan.FromDays(1));
        await app.RunJobsAsync();
        await owner.GetAsync($"/api/wishlists/{list.Id}/thanks").Ok();

        // An old date may stay while editing other things.
        await owner.Put($"/api/wishlists/{list.Id}", Update("2026-11-02")).Ok();
    }

    [Fact]
    public async Task A_group_whose_participants_all_expire_does_not_promote_an_expiring_organizer()
    {
        var (owner, list) = await ListAsync();
        var wish = await owner.Post($"/api/wishlists/{list.Id}/wishes", new { name = "Velo", groupGiftAllowed = true }).Read<WishDto>();
        var a = await app.GuestAsync("first@example.com", "First");
        var gift = await a.Post($"/api/shared/{list.ShareToken}/wishes/{wish.Id}/gifts", new { isGroup = true }).Read<GiftRefDto>();
        app.Clock.Advance(TimeSpan.FromMinutes(5));
        var b = await app.GuestAsync("second@example.com", "Second");
        await b.Post($"/api/shared/{list.ShareToken}/gifts/{gift.GiftId}/participants", new { }).Ok();

        app.Clock.Advance(TimeSpan.FromDays(8));
        await app.RunJobsAsync();
        Assert.Equal(0, await MailCount("second@example.com", "NowOrganizer"));
        Assert.Equal(1, await MailCount("second@example.com", "Released"));
    }

    [Fact]
    public async Task Deleted_lists_are_purged_after_30_days()
    {
        var (owner, list) = await ListAsync();
        await owner.DeleteAsync($"/api/wishlists/{list.Id}").Ok();
        app.Clock.Advance(TimeSpan.FromDays(29));
        await app.RunJobsAsync();
        await owner.Post($"/api/wishlists/{list.Id}/restore").Ok();
        await owner.DeleteAsync($"/api/wishlists/{list.Id}").Ok();
        app.Clock.Advance(TimeSpan.FromDays(31));
        await app.RunJobsAsync();
        Assert.False(await app.WithDb(db => Task.FromResult(db.Wishlists.Any(l => l.Id == list.Id))));
    }
}
