using Wunschzettu.Api.Data;
using Wunschzettu.Api.Features.Notifications;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Tests;

public class LanguageTests(AppFactory app) : IClassFixture<AppFactory>
{
    [Theory]
    [InlineData("de-CH", "de-CH")]
    [InlineData("de-de", "de-DE")]
    [InlineData("de-AT", "de-AT")]
    [InlineData("de", "de-CH")]
    [InlineData("en-GB", "en")]
    [InlineData("fr-CH", "fr")]
    [InlineData("es-MX", "es")]
    [InlineData("pt", "pt-BR")]
    [InlineData("pt-PT", "pt-PT")]
    [InlineData("it", "de-CH")]
    [InlineData("", "de-CH")]
    [InlineData(null, "de-CH")]
    public void Languages_are_normalized_to_one_we_have(string? input, string expected) =>
        Assert.Equal(expected, Languages.Normalize(input));

    [Fact]
    public async Task The_profile_accepts_every_language_and_refuses_others()
    {
        var c = await app.UserAsync("lang@example.com", "Lang");
        foreach (var language in Languages.All)
        {
            await c.Put("/api/auth/me", new { displayName = "Lang", language }).Ok();
            Assert.Equal(language, (await c.GetAsync("/api/auth/me").Read<Wunschzettu.Api.Features.Auth.MeDto>()).Language);
        }
        await c.Put("/api/auth/me", new { displayName = "Lang", language = "it" }).Fails(400);
    }

    [Fact]
    public async Task A_new_account_gets_the_language_of_the_request()
    {
        var guest = app.Anonymous();
        await guest.Post("/api/auth/request-code", new { email = "fr-new@example.com", language = "fr" }).Ok();
        Assert.Equal("fr", await app.WithDb(db => Task.FromResult(db.Users.Single(u => u.Email == "fr-new@example.com").Language)));
        Assert.StartsWith("Ton code de connexion", Assert.Single(await app.MailsToAsync("fr-new@example.com")).Subject);
    }

    static AppUser User(string language) => new() { Language = language, DisplayName = "Alex", UserName = "a@example.com", Email = "a@example.com" };

    static IEnumerable<MailContent> AllMails(AppUser u)
    {
        var confirm = new Mails.Confirmation("123456", "https://x/confirm", new DateTime(2026, 12, 20, 0, 0, 0, DateTimeKind.Utc));
        yield return Mails.LoginCode(u, "123456", "https://x", 15);
        yield return Mails.PasswordChanged(u, true, "https://x");
        yield return Mails.PasswordChanged(u, false, "https://x");
        yield return Mails.DeletionCode(u, "123456", 15);
        yield return Mails.GiftChosen(u, "Velo", "Lena", false, "https://x", confirm);
        yield return Mails.GiftChosen(u, "Velo", "Lena", true, "https://x", null);
        yield return Mails.ConfirmReminder(u, ["Velo", "Buch"], confirm);
        yield return Mails.Released(u, "Velo", "https://x");
        foreach (var role in Enum.GetValues<Mails.InviteRole>()) yield return Mails.Invitation(u, "Mama", "Lena", role, "https://x");
        yield return Mails.GroupJoined(u, "Oma", "Velo", "https://x");
        yield return Mails.GroupLeft(u, "Oma", "Velo", "https://x");
        yield return Mails.NowOrganizer(u, "Velo", "https://x");
        foreach (var change in Enum.GetValues<WishChange>()) yield return Mails.WishChanged(u, "Velo", change, "https://x");
        yield return Mails.EventReminder(u, "Lena", new DateOnly(2026, 12, 24), ["Velo"], "https://x");
    }

    [Theory]
    [InlineData("en"), InlineData("fr"), InlineData("es"), InlineData("pt-BR"), InlineData("pt-PT")]
    public void Every_mail_is_translated(string language)
    {
        var german = AllMails(User("de-CH")).ToList();
        var translated = AllMails(User(language)).ToList();
        Assert.Equal(german.Count, translated.Count);
        for (var i = 0; i < german.Count; i++)
        {
            Assert.NotEqual(german[i].Subject, translated[i].Subject);
            Assert.NotEqual(german[i].Heading, translated[i].Heading);
            Assert.All(translated[i].Paragraphs, p => Assert.DoesNotContain("{", p));
        }
    }

    [Fact]
    public void Language_variants_adapt_words_and_formats()
    {
        var confirm = new Mails.Confirmation("123456", "https://x/confirm", new DateTime(2026, 12, 20, 0, 0, 0, DateTimeKind.Utc));
        Assert.Contains("Reservation", Mails.Released(User("de-CH"), "Velo", "u").Subject);
        Assert.Contains("Reservierung", Mails.Released(User("de-DE"), "Velo", "u").Subject);
        Assert.Contains("Reservierung", Mails.Released(User("de-AT"), "Velo", "u").Subject);

        Assert.Equal("Entrar agora", Mails.LoginCode(User("pt-BR"), "1", "u", 15).Button!.Label);
        Assert.Equal("Iniciar sessão agora", Mails.LoginCode(User("pt-PT"), "1", "u", 15).Button!.Label);
        Assert.Contains("palavra-passe", Mails.PasswordChanged(User("pt-PT"), true, "u").Subject);
        Assert.Contains("senha", Mails.PasswordChanged(User("pt-BR"), true, "u").Subject);

        // Quotes and dates follow the language.
        Assert.Contains("« Velo »", Mails.Released(User("fr"), "Velo", "u").Subject);
        Assert.Contains("“Velo”", Mails.Released(User("en"), "Velo", "u").Subject);
        Assert.Contains("20 diciembre", string.Join(" ", Mails.ConfirmReminder(User("es"), ["Velo"], confirm).Paragraphs).Replace(" de ", " "));
        Assert.Contains("20. Dezember", string.Join(" ", Mails.ConfirmReminder(User("de-DE"), ["Velo"], confirm).Paragraphs));
        Assert.Contains("December 20", string.Join(" ", Mails.ConfirmReminder(User("en"), ["Velo"], confirm).Paragraphs));
    }
}
