using System.Globalization;
using Wunschzettu.Api.Data;

namespace Wunschzettu.Api.Features.Notifications;

public enum WishChange { Changed, Removed, Fulfilled }

/// All mail texts, in the recipient's language (de-CH or en).
public static class Mails
{
    static bool En(AppUser u) => u.Language == "en";
    static string T(AppUser u, string de, string en) => En(u) ? en : de;

    static string Date(AppUser u, DateTime utc) =>
        utc.ToString(En(u) ? "MMMM d" : "d. MMMM", CultureInfo.GetCultureInfo(En(u) ? "en" : "de-CH"));

    static string Date(AppUser u, DateOnly d) =>
        d.ToString(En(u) ? "dddd, MMMM d" : "dddd, d. MMMM", CultureInfo.GetCultureInfo(En(u) ? "en" : "de-CH"));

    static string Hello(AppUser u) => string.IsNullOrWhiteSpace(u.DisplayName) ? T(u, "Hallo", "Hi") : T(u, $"Hallo {u.DisplayName}", $"Hi {u.DisplayName}");

    static string Ignore(AppUser u) => T(u,
        "Du hast nichts angefordert? Dann kannst du diese Mail ignorieren.",
        "Didn't ask for this? Then you can ignore this mail.");

    public static MailContent LoginCode(AppUser u, string code, string link, int minutes) => new(
        "LoginCode",
        T(u, $"Dein Anmeldecode: {code}", $"Your sign-in code: {code}"),
        T(u, "Anmelden bei Wunschzettu", "Sign in to Wunschzettu"),
        [T(u, $"Gib diesen Code ein oder tippe auf den Button. Er ist {minutes} Minuten gültig.",
            $"Enter this code or tap the button. It is valid for {minutes} minutes.")],
        code,
        new(T(u, "Jetzt anmelden", "Sign in now"), link),
        Ignore(u));

    public static MailContent PasswordChanged(AppUser u, bool removed, string profileUrl) => new(
        "PasswordChanged",
        removed ? T(u, "Dein Passwort wurde entfernt", "Your password was removed") : T(u, "Dein Passwort wurde geändert", "Your password was changed"),
        T(u, "Passwort geändert", "Password changed"),
        [
            Hello(u) + ",",
            removed
                ? T(u, "das Passwort für dein Wunschzettu-Konto wurde soeben entfernt. Du meldest dich jetzt wieder mit einem Code per Mail an.",
                    "the password of your Wunschzettu account was just removed. You now sign in with a code by email again.")
                : T(u, "das Passwort für dein Wunschzettu-Konto wurde soeben gesetzt oder geändert. Alle anderen Geräte wurden abgemeldet.",
                    "the password of your Wunschzettu account was just set or changed. All other devices were signed out."),
            T(u, "Warst du das nicht? Melde dich mit einem Code per Mail an und entferne das Passwort im Profil – damit werden alle anderen Geräte abgemeldet.",
                "Wasn't you? Sign in with a code by email and remove the password in your profile – that signs out all other devices."),
        ],
        Button: new(T(u, "Zum Profil", "Open your profile"), profileUrl));

    public static MailContent DeletionCode(AppUser u, string code, int minutes) => new(
        "DeletionCode",
        T(u, $"Code zum Löschen deines Kontos: {code}", $"Code to delete your account: {code}"),
        T(u, "Konto löschen", "Delete your account"),
        [T(u, $"Gib diesen Code im Profil ein, um dein Wunschzettu-Konto endgültig zu löschen. Er ist {minutes} Minuten gültig.",
            $"Enter this code in your profile to delete your Wunschzettu account for good. It is valid for {minutes} minutes.")],
        code,
        Footer: T(u, "Du willst dein Konto gar nicht löschen? Dann ignoriere diese Mail – es passiert nichts.",
            "Don't want to delete your account? Then ignore this mail – nothing happens."));

    public record Confirmation(string Code, string Link, DateTime ExpiresAt);

    public static MailContent GiftChosen(AppUser u, string wish, string list, bool isGroup, string listUrl, Confirmation? confirm)
    {
        List<string> p =
        [
            Hello(u) + ",",
            isGroup
                ? T(u, $"du machst beim gemeinsamen Geschenk «{wish}» auf der Liste «{list}» mit. Danke!",
                    $"you're chipping in on the group gift “{wish}” on the list “{list}”. Thank you!")
                : T(u, $"du schenkst «{wish}» von der Liste «{list}». Danke! Die anderen sehen jetzt, dass der Wunsch vergeben ist.",
                    $"you're giving “{wish}” from the list “{list}”. Thank you! Everyone else now sees that it's taken."),
        ];
        if (confirm is null)
            return new("GiftChosen", isGroup ? T(u, $"Du machst mit bei «{wish}»", $"You're chipping in on “{wish}”") : T(u, $"Du schenkst «{wish}»", $"You're giving “{wish}”"),
                T(u, "Super, das ist notiert!", "Great, that's noted!"), p,
                Button: new(T(u, "Zur Liste", "Open the list"), listUrl));

        p.Add(T(u, $"Bitte bestätige noch kurz deine E-Mail-Adresse. Ohne Bestätigung wird der Wunsch am {Date(u, confirm.ExpiresAt)} wieder freigegeben.",
            $"Please confirm your email address. Without confirmation the wish becomes available again on {Date(u, confirm.ExpiresAt)}."));
        return new("GiftChosen", T(u, $"Bitte bestätigen: «{wish}»", $"Please confirm: “{wish}”"),
            T(u, "Fast geschafft!", "Almost done!"), p, confirm.Code,
            new(T(u, "E-Mail bestätigen", "Confirm email"), confirm.Link), Ignore(u));
    }

    public static MailContent ConfirmReminder(AppUser u, IReadOnlyList<string> wishes, Confirmation confirm) => new(
        "ConfirmReminder",
        T(u, "Erinnerung: Bitte bestätige deine Reservation", "Reminder: please confirm your reservation"),
        T(u, "Noch nicht bestätigt", "Not confirmed yet"),
        [
            Hello(u) + ",",
            T(u, $"du hast {string.Join(", ", wishes.Select(w => $"«{w}»"))} gewählt, aber deine E-Mail-Adresse ist noch nicht bestätigt.",
                $"you chose {string.Join(", ", wishes.Select(w => $"“{w}”"))}, but your email address isn't confirmed yet."),
            T(u, $"Ohne Bestätigung wird alles am {Date(u, confirm.ExpiresAt)} wieder freigegeben.",
                $"Without confirmation everything becomes available again on {Date(u, confirm.ExpiresAt)}."),
        ],
        confirm.Code,
        new(T(u, "E-Mail bestätigen", "Confirm email"), confirm.Link),
        Ignore(u));

    public static MailContent Released(AppUser u, string wish, string listUrl) => new(
        "Released",
        T(u, $"Reservation aufgehoben: «{wish}»", $"Reservation released: “{wish}”"),
        T(u, "Reservation aufgehoben", "Reservation released"),
        [
            Hello(u) + ",",
            T(u, $"weil deine E-Mail-Adresse nicht bestätigt wurde, ist «{wish}» wieder für alle frei. Du kannst den Wunsch jederzeit erneut wählen.",
                $"because your email address wasn't confirmed, “{wish}” is available to everyone again. You can choose it again any time."),
        ],
        Button: new(T(u, "Zur Liste", "Open the list"), listUrl));

    public enum InviteRole { Manager, Recipient, Guest }

    public static MailContent Invitation(AppUser u, string inviter, string list, InviteRole role, string link) => new(
        "Invitation",
        T(u, $"{inviter} hat dich zu «{list}» eingeladen", $"{inviter} invited you to “{list}”"),
        T(u, "Du bist eingeladen", "You're invited"),
        [
            Hello(u) + ",",
            role switch
            {
                InviteRole.Manager => T(u, $"{inviter} möchte die Wunschliste «{list}» gemeinsam mit dir verwalten.",
                    $"{inviter} would like to manage the wishlist “{list}” together with you."),
                InviteRole.Recipient => T(u, $"{inviter} hat die Wunschliste «{list}» für dich angelegt. Du kannst eigene Wünsche ergänzen – was schon verschenkt ist, bleibt eine Überraschung.",
                    $"{inviter} created the wishlist “{list}” for you. You can add your own wishes – what's already taken stays a surprise."),
                _ => T(u, $"{inviter} teilt die Wunschliste «{list}» mit dir.", $"{inviter} is sharing the wishlist “{list}” with you."),
            },
        ],
        Button: new(T(u, "Liste öffnen", "Open the list"), link),
        Footer: T(u, "Der Link meldet dich direkt an und ist 7 Tage gültig.", "The link signs you in directly and is valid for 7 days."));

    public static MailContent GroupJoined(AppUser u, string who, string wish, string listUrl) => new(
        "GroupJoined",
        T(u, $"{who} macht mit bei «{wish}»", $"{who} is chipping in on “{wish}”"),
        T(u, "Verstärkung!", "Reinforcements!"),
        [T(u, $"{who} beteiligt sich jetzt am gemeinsamen Geschenk «{wish}».", $"{who} has joined the group gift “{wish}”.")],
        Button: new(T(u, "Zum Geschenk", "Open the gift"), listUrl));

    public static MailContent GroupLeft(AppUser u, string who, string wish, string listUrl) => new(
        "GroupLeft",
        T(u, $"{who} macht nicht mehr mit bei «{wish}»", $"{who} left the group gift “{wish}”"),
        T(u, "Jemand ist ausgestiegen", "Someone left"),
        [T(u, $"{who} beteiligt sich nicht mehr am gemeinsamen Geschenk «{wish}».", $"{who} is no longer part of the group gift “{wish}”.")],
        Button: new(T(u, "Zum Geschenk", "Open the gift"), listUrl));

    public static MailContent NowOrganizer(AppUser u, string wish, string listUrl) => new(
        "NowOrganizer",
        T(u, $"Du organisierst jetzt «{wish}»", $"You're now organising “{wish}”"),
        T(u, "Du bist jetzt Organisator:in", "You're the organiser now"),
        [T(u, $"Die bisherige Organisatorin oder der bisherige Organisator ist ausgestiegen. Du koordinierst jetzt das gemeinsame Geschenk «{wish}» und kannst es als gekauft markieren.",
            $"The previous organiser left. You now coordinate the group gift “{wish}” and can mark it as bought.")],
        Button: new(T(u, "Zum Geschenk", "Open the gift"), listUrl));

    public static MailContent WishChanged(AppUser u, string wish, WishChange change, string listUrl) => new(
        "WishChanged",
        change switch
        {
            WishChange.Removed => T(u, $"«{wish}» wird nicht mehr gebraucht", $"“{wish}” is no longer needed"),
            WishChange.Fulfilled => T(u, $"«{wish}» ist schon erfüllt", $"“{wish}” has already been fulfilled"),
            _ => T(u, $"«{wish}» wurde geändert", $"“{wish}” was changed"),
        },
        T(u, "Der Wunsch, den du schenkst, hat sich geändert", "The wish you're giving has changed"),
        [
            change switch
            {
                WishChange.Removed => T(u, $"«{wish}» wurde von der Liste genommen. Deine Reservation bleibt sichtbar, bis du sie zurückziehst.",
                    $"“{wish}” was taken off the list. Your reservation stays visible until you withdraw it."),
                WishChange.Fulfilled => T(u, $"«{wish}» wurde als erfüllt markiert. Vielleicht lohnt sich ein kurzer Blick, bevor du etwas kaufst.",
                    $"“{wish}” was marked as fulfilled. It might be worth a quick look before you buy anything."),
                _ => T(u, $"Bei «{wish}» hat sich etwas geändert, zum Beispiel der Preis oder die Anzahl. Schau kurz nach, ob deine Wahl noch passt.",
                    $"Something about “{wish}” changed, for example the price or quantity. Have a quick look whether your choice still fits."),
            },
        ],
        Button: new(T(u, "Zur Liste", "Open the list"), listUrl));

    public static MailContent EventReminder(AppUser u, string list, DateOnly date, IReadOnlyList<string> wishes, string listUrl) => new(
        "EventReminder",
        T(u, $"Bald ist es so weit: «{list}»", $"Coming up soon: “{list}”"),
        T(u, "Noch eine Woche", "One week to go"),
        [
            Hello(u) + ",",
            T(u, $"am {Date(u, date)} ist es so weit. Du hast {string.Join(", ", wishes.Select(w => $"«{w}»"))} noch nicht als gekauft markiert.",
                $"the big day is {Date(u, date)}. You haven't marked {string.Join(", ", wishes.Select(w => $"“{w}”"))} as bought yet."),
        ],
        Button: new(T(u, "Zur Liste", "Open the list"), listUrl));
}
