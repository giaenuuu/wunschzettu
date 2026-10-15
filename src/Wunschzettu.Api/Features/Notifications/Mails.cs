using System.Globalization;
using Wunschzettu.Api.Data;
using Wunschzettu.Api.Infrastructure;

namespace Wunschzettu.Api.Features.Notifications;

public enum WishChange { Changed, Removed, Fulfilled }

/// All mail texts, in the recipient's language: German, English, French, Spanish, Portuguese.
/// de-CH, de-DE and de-AT share the German text (only "Reservation" is adapted), pt-BR and pt-PT the Portuguese one
/// (the vocabulary of pt-PT is adapted, see PtPt). Wishes and lists are quoted the way each language does it.
public static class Mails
{
    static string Lang(AppUser u) => Languages.Family(u.Language);

    static string T(AppUser u, string de, string en, string fr, string es, string pt) => Lang(u) switch
    {
        "en" => en,
        "fr" => fr,
        "es" => es,
        "pt" => PortugalPortuguese(u, pt),
        _ => GermanyAustriaGerman(u, de),
    };

    static string GermanyAustriaGerman(AppUser u, string text) =>
        u.Language is "de-DE" or "de-AT" ? text.Replace("Reservation", "Reservierung") : text;

    /// pt-PT: the same text with the words that differ (a short list; the frontend's pt-PT file has the long one).
    static readonly (string From, string To)[] PtPt =
    [
        ("Entrar agora", "Iniciar sessão agora"), ("Entrar no Wunschzettu", "Iniciar sessão no Wunschzettu"),
        ("Entre com", "Inicie sessão com"), ("entra de novo com", "volta a iniciar sessão com"),
        ("desconecta todos os outros dispositivos", "termina a sessão em todos os outros dispositivos"),
        ("Todos os outros dispositivos foram desconectados", "A sessão foi terminada em todos os outros dispositivos"),
        ("senha", "palavra-passe"), ("Senha", "Palavra-passe"),
        ("excluir", "eliminar"), ("Excluir", "Eliminar"), ("compartilha", "partilha"),
    ];

    static string PortugalPortuguese(AppUser u, string text)
    {
        if (u.Language != "pt-PT") return text;
        foreach (var (from, to) in PtPt) text = text.Replace(from, to);
        return text;
    }

    /// «wish» in German and Spanish, “wish” in English and Portuguese, « wish » (with non-breaking spaces) in French.
    static string Q(AppUser u, string s) => Lang(u) switch
    {
        "en" or "pt" => $"“{s}”",
        "fr" => $"« {s} »",
        _ => $"«{s}»",
    };

    static string QuotedList(AppUser u, IEnumerable<string> items) => string.Join(", ", items.Select(i => Q(u, i)));

    static CultureInfo Culture(AppUser u) => CultureInfo.GetCultureInfo(Languages.Normalize(u.Language));

    static string Date(AppUser u, DateTime utc) =>
        utc.ToString(Lang(u) switch { "en" => "MMMM d", "fr" => "d MMMM", "es" or "pt" => "d 'de' MMMM", _ => "d. MMMM" }, Culture(u));

    static string Date(AppUser u, DateOnly d) =>
        d.ToString(Lang(u) switch { "en" => "dddd, MMMM d", "fr" => "dddd d MMMM", "es" or "pt" => "dddd, d 'de' MMMM", _ => "dddd, d. MMMM" }, Culture(u));

    static string Hello(AppUser u) => string.IsNullOrWhiteSpace(u.DisplayName)
        ? T(u, "Hallo", "Hi", "Bonjour", "Hola", "Olá")
        : T(u, "Hallo", "Hi", "Bonjour", "Hola", "Olá") + " " + u.DisplayName;

    static string Ignore(AppUser u) => T(u,
        "Du hast nichts angefordert? Dann kannst du diese Mail ignorieren.",
        "Didn't ask for this? Then you can ignore this mail.",
        "Tu n'as rien demandé ? Alors tu peux ignorer cet e-mail.",
        "¿No has pedido nada? Entonces puedes ignorar este correo.",
        "Você não pediu nada? Então pode ignorar este e-mail.");

    static string OpenList(AppUser u) => T(u, "Zur Liste", "Open the list", "Vers la liste", "Ir a la lista", "Ir para a lista");

    static string OpenGift(AppUser u) => T(u, "Zum Geschenk", "Open the gift", "Voir le cadeau", "Ver el regalo", "Ver o presente");

    static string ConfirmEmail(AppUser u) => T(u, "E-Mail bestätigen", "Confirm email", "Confirmer l'e-mail", "Confirmar correo", "Confirmar e-mail");

    public static MailContent LoginCode(AppUser u, string code, string link, int minutes) => new(
        "LoginCode",
        T(u, $"Dein Anmeldecode: {code}", $"Your sign-in code: {code}", $"Ton code de connexion : {code}",
            $"Tu código de inicio de sesión: {code}", $"Seu código de acesso: {code}"),
        T(u, "Anmelden bei Wunschzettu", "Sign in to Wunschzettu", "Se connecter à Wunschzettu", "Inicia sesión en Wunschzettu", "Entrar no Wunschzettu"),
        [T(u, $"Gib diesen Code ein oder tippe auf den Button. Er ist {minutes} Minuten gültig.",
            $"Enter this code or tap the button. It is valid for {minutes} minutes.",
            $"Saisis ce code ou appuie sur le bouton. Il est valable {minutes} minutes.",
            $"Escribe este código o pulsa el botón. Es válido durante {minutes} minutos.",
            $"Digite este código ou toque no botão. Ele vale por {minutes} minutos.")],
        code,
        new(T(u, "Jetzt anmelden", "Sign in now", "Se connecter maintenant", "Iniciar sesión ahora", "Entrar agora"), link),
        Ignore(u));

    public static MailContent PasswordChanged(AppUser u, bool removed, string profileUrl) => new(
        "PasswordChanged",
        removed
            ? T(u, "Dein Passwort wurde entfernt", "Your password was removed", "Ton mot de passe a été supprimé", "Se ha eliminado tu contraseña", "Sua senha foi removida")
            : T(u, "Dein Passwort wurde geändert", "Your password was changed", "Ton mot de passe a été modifié", "Se ha cambiado tu contraseña", "Sua senha foi alterada"),
        T(u, "Passwort geändert", "Password changed", "Mot de passe modifié", "Contraseña cambiada", "Senha alterada"),
        [
            Hello(u) + ",",
            removed
                ? T(u, "das Passwort für dein Wunschzettu-Konto wurde soeben entfernt. Du meldest dich jetzt wieder mit einem Code per Mail an.",
                    "the password of your Wunschzettu account was just removed. You now sign in with a code by email again.",
                    "le mot de passe de ton compte Wunschzettu vient d'être supprimé. Tu te connectes de nouveau avec un code par e-mail.",
                    "la contraseña de tu cuenta de Wunschzettu se acaba de eliminar. Ahora vuelves a iniciar sesión con un código por correo.",
                    "a senha da sua conta do Wunschzettu acabou de ser removida. Agora você entra de novo com um código por e-mail.")
                : T(u, "das Passwort für dein Wunschzettu-Konto wurde soeben gesetzt oder geändert. Alle anderen Geräte wurden abgemeldet.",
                    "the password of your Wunschzettu account was just set or changed. All other devices were signed out.",
                    "le mot de passe de ton compte Wunschzettu vient d'être défini ou modifié. Tous les autres appareils ont été déconnectés.",
                    "la contraseña de tu cuenta de Wunschzettu se acaba de definir o cambiar. Se ha cerrado la sesión en todos los demás dispositivos.",
                    "a senha da sua conta do Wunschzettu acabou de ser definida ou alterada. Todos os outros dispositivos foram desconectados."),
            T(u, "Warst du das nicht? Melde dich mit einem Code per Mail an und entferne das Passwort im Profil – damit werden alle anderen Geräte abgemeldet.",
                "Wasn't you? Sign in with a code by email and remove the password in your profile – that signs out all other devices.",
                "Ce n'était pas toi ? Connecte-toi avec un code par e-mail et supprime le mot de passe dans ton profil – cela déconnecte tous les autres appareils.",
                "¿No fuiste tú? Inicia sesión con un código por correo y quita la contraseña en tu perfil: así se cierra la sesión en todos los demás dispositivos.",
                "Não foi você? Entre com um código por e-mail e remova a senha no perfil – isso desconecta todos os outros dispositivos."),
        ],
        Button: new(T(u, "Zum Profil", "Open your profile", "Ouvrir ton profil", "Abrir tu perfil", "Abrir seu perfil"), profileUrl));

    public static MailContent DeletionCode(AppUser u, string code, int minutes) => new(
        "DeletionCode",
        T(u, $"Code zum Löschen deines Kontos: {code}", $"Code to delete your account: {code}", $"Code pour supprimer ton compte : {code}",
            $"Código para eliminar tu cuenta: {code}", $"Código para excluir sua conta: {code}"),
        T(u, "Konto löschen", "Delete your account", "Supprimer le compte", "Eliminar cuenta", "Excluir conta"),
        [T(u, $"Gib diesen Code im Profil ein, um dein Wunschzettu-Konto endgültig zu löschen. Er ist {minutes} Minuten gültig.",
            $"Enter this code in your profile to delete your Wunschzettu account for good. It is valid for {minutes} minutes.",
            $"Saisis ce code dans ton profil pour supprimer définitivement ton compte Wunschzettu. Il est valable {minutes} minutes.",
            $"Escribe este código en tu perfil para eliminar definitivamente tu cuenta de Wunschzettu. Es válido durante {minutes} minutos.",
            $"Digite este código no seu perfil para excluir de vez sua conta do Wunschzettu. Ele vale por {minutes} minutos.")],
        code,
        Footer: T(u, "Du willst dein Konto gar nicht löschen? Dann ignoriere diese Mail – es passiert nichts.",
            "Don't want to delete your account? Then ignore this mail – nothing happens.",
            "Tu ne veux pas supprimer ton compte ? Ignore alors cet e-mail – il ne se passe rien.",
            "¿No quieres eliminar tu cuenta? Entonces ignora este correo: no pasa nada.",
            "Não quer excluir sua conta? Então ignore este e-mail – nada acontece."));

    public record Confirmation(string Code, string Link, DateTime ExpiresAt);

    public static MailContent GiftChosen(AppUser u, string wish, string list, bool isGroup, string listUrl, Confirmation? confirm)
    {
        var w = Q(u, wish);
        var l = Q(u, list);
        List<string> p =
        [
            Hello(u) + ",",
            isGroup
                ? T(u, $"du machst beim gemeinsamen Geschenk {w} auf der Liste {l} mit. Danke!",
                    $"you're chipping in on the group gift {w} on the list {l}. Thank you!",
                    $"tu participes au cadeau commun {w} sur la liste {l}. Merci !",
                    $"participas en el regalo conjunto {w} de la lista {l}. ¡Gracias!",
                    $"você está participando do presente em grupo {w} da lista {l}. Obrigado!")
                : T(u, $"du schenkst {w} von der Liste {l}. Danke! Die anderen sehen jetzt, dass der Wunsch vergeben ist.",
                    $"you're giving {w} from the list {l}. Thank you! Everyone else now sees that it's taken.",
                    $"tu offres {w} de la liste {l}. Merci ! Les autres voient maintenant que le souhait est pris.",
                    $"regalas {w} de la lista {l}. ¡Gracias! Los demás ven ahora que el deseo está cogido.",
                    $"você vai dar {w} da lista {l}. Obrigado! Os outros agora veem que o desejo foi escolhido."),
        ];
        if (confirm is null)
            return new("GiftChosen",
                isGroup
                    ? T(u, $"Du machst mit bei {w}", $"You're chipping in on {w}", $"Tu participes à {w}", $"Participas en {w}", $"Você participa de {w}")
                    : T(u, $"Du schenkst {w}", $"You're giving {w}", $"Tu offres {w}", $"Regalas {w}", $"Você vai dar {w}"),
                T(u, "Super, das ist notiert!", "Great, that's noted!", "Super, c'est noté !", "¡Genial, queda anotado!", "Ótimo, anotado!"), p,
                Button: new(OpenList(u), listUrl));

        p.Add(T(u, $"Bitte bestätige noch kurz deine E-Mail-Adresse. Ohne Bestätigung wird der Wunsch am {Date(u, confirm.ExpiresAt)} wieder freigegeben.",
            $"Please confirm your email address. Without confirmation the wish becomes available again on {Date(u, confirm.ExpiresAt)}.",
            $"Confirme encore brièvement ton adresse e-mail. Sans confirmation, le souhait sera libéré à nouveau le {Date(u, confirm.ExpiresAt)}.",
            $"Confirma brevemente tu dirección de correo. Sin confirmación, el deseo volverá a quedar libre el {Date(u, confirm.ExpiresAt)}.",
            $"Confirme rapidinho seu endereço de e-mail. Sem confirmação, o desejo volta a ficar livre em {Date(u, confirm.ExpiresAt)}."));
        return new("GiftChosen",
            T(u, $"Bitte bestätigen: {w}", $"Please confirm: {w}", $"À confirmer : {w}", $"Por favor, confirma: {w}", $"Confirme, por favor: {w}"),
            T(u, "Fast geschafft!", "Almost done!", "Presque fini !", "¡Casi listo!", "Quase pronto!"), p, confirm.Code,
            new(ConfirmEmail(u), confirm.Link), Ignore(u));
    }

    public static MailContent ConfirmReminder(AppUser u, IReadOnlyList<string> wishes, Confirmation confirm)
    {
        var list = QuotedList(u, wishes);
        return new(
            "ConfirmReminder",
            T(u, "Erinnerung: Bitte bestätige deine Reservation", "Reminder: please confirm your reservation", "Rappel : confirme ta réservation",
                "Recordatorio: confirma tu reserva", "Lembrete: confirme sua reserva"),
            T(u, "Noch nicht bestätigt", "Not confirmed yet", "Pas encore confirmé", "Aún sin confirmar", "Ainda não confirmado"),
            [
                Hello(u) + ",",
                T(u, $"du hast {list} gewählt, aber deine E-Mail-Adresse ist noch nicht bestätigt.",
                    $"you chose {list}, but your email address isn't confirmed yet.",
                    $"tu as choisi {list}, mais ton adresse e-mail n'est pas encore confirmée.",
                    $"has elegido {list}, pero tu dirección de correo aún no está confirmada.",
                    $"você escolheu {list}, mas seu endereço de e-mail ainda não foi confirmado."),
                T(u, $"Ohne Bestätigung wird alles am {Date(u, confirm.ExpiresAt)} wieder freigegeben.",
                    $"Without confirmation everything becomes available again on {Date(u, confirm.ExpiresAt)}.",
                    $"Sans confirmation, tout sera libéré à nouveau le {Date(u, confirm.ExpiresAt)}.",
                    $"Sin confirmación, todo volverá a quedar libre el {Date(u, confirm.ExpiresAt)}.",
                    $"Sem confirmação, tudo volta a ficar livre em {Date(u, confirm.ExpiresAt)}."),
            ],
            confirm.Code,
            new(ConfirmEmail(u), confirm.Link),
            Ignore(u));
    }

    public static MailContent Released(AppUser u, string wish, string listUrl)
    {
        var w = Q(u, wish);
        return new(
            "Released",
            T(u, $"Reservation aufgehoben: {w}", $"Reservation released: {w}", $"Réservation annulée : {w}", $"Reserva liberada: {w}", $"Reserva cancelada: {w}"),
            T(u, "Reservation aufgehoben", "Reservation released", "Réservation annulée", "Reserva liberada", "Reserva cancelada"),
            [
                Hello(u) + ",",
                T(u, $"weil deine E-Mail-Adresse nicht bestätigt wurde, ist {w} wieder für alle frei. Du kannst den Wunsch jederzeit erneut wählen.",
                    $"because your email address wasn't confirmed, {w} is available to everyone again. You can choose it again any time.",
                    $"comme ton adresse e-mail n'a pas été confirmée, {w} est de nouveau libre pour tout le monde. Tu peux le choisir à nouveau à tout moment.",
                    $"como tu dirección de correo no se confirmó, {w} vuelve a estar libre para todos. Puedes volver a elegirlo cuando quieras.",
                    $"como seu endereço de e-mail não foi confirmado, {w} voltou a ficar livre para todos. Você pode escolhê-lo de novo quando quiser."),
            ],
            Button: new(OpenList(u), listUrl));
    }

    public enum InviteRole { Manager, Recipient, Guest }

    public static MailContent Invitation(AppUser u, string inviter, string list, InviteRole role, string link)
    {
        var l = Q(u, list);
        return new(
            "Invitation",
            T(u, $"{inviter} hat dich zu {l} eingeladen", $"{inviter} invited you to {l}", $"{inviter} t'a invité(e) à {l}",
                $"{inviter} te ha invitado a {l}", $"{inviter} convidou você para {l}"),
            T(u, "Du bist eingeladen", "You're invited", "Tu es invité(e)", "Estás invitado", "Você está convidado"),
            [
                Hello(u) + ",",
                role switch
                {
                    InviteRole.Manager => T(u, $"{inviter} möchte die Wunschliste {l} gemeinsam mit dir verwalten.",
                        $"{inviter} would like to manage the wishlist {l} together with you.",
                        $"{inviter} souhaite gérer la liste de souhaits {l} avec toi.",
                        $"{inviter} quiere gestionar contigo la lista de deseos {l}.",
                        $"{inviter} quer administrar a lista de desejos {l} junto com você."),
                    InviteRole.Recipient => T(u, $"{inviter} hat die Wunschliste {l} für dich angelegt. Du kannst eigene Wünsche ergänzen – was schon verschenkt ist, bleibt eine Überraschung.",
                        $"{inviter} created the wishlist {l} for you. You can add your own wishes – what's already taken stays a surprise.",
                        $"{inviter} a créé la liste de souhaits {l} pour toi. Tu peux ajouter tes propres souhaits – ce qui est déjà offert reste une surprise.",
                        $"{inviter} ha creado la lista de deseos {l} para ti. Puedes añadir tus propios deseos; lo que ya se ha regalado sigue siendo una sorpresa.",
                        $"{inviter} criou a lista de desejos {l} para você. Você pode acrescentar seus próprios desejos – o que já foi dado continua sendo surpresa."),
                    _ => T(u, $"{inviter} teilt die Wunschliste {l} mit dir.", $"{inviter} is sharing the wishlist {l} with you.",
                        $"{inviter} partage la liste de souhaits {l} avec toi.", $"{inviter} comparte contigo la lista de deseos {l}.",
                        $"{inviter} compartilha a lista de desejos {l} com você."),
                },
            ],
            Button: new(T(u, "Liste öffnen", "Open the list", "Ouvrir la liste", "Abrir la lista", "Abrir a lista"), link),
            Footer: T(u, "Der Link meldet dich direkt an und ist 7 Tage gültig.", "The link signs you in directly and is valid for 7 days.",
                "Le lien te connecte directement et est valable 7 jours.", "El enlace inicia tu sesión directamente y es válido durante 7 días.",
                "O link faz você entrar direto e vale por 7 dias."));
    }

    public static MailContent GroupJoined(AppUser u, string who, string wish, string listUrl)
    {
        var w = Q(u, wish);
        return new(
            "GroupJoined",
            T(u, $"{who} macht mit bei {w}", $"{who} is chipping in on {w}", $"{who} participe à {w}", $"{who} participa en {w}", $"{who} participa de {w}"),
            T(u, "Verstärkung!", "Reinforcements!", "Du renfort !", "¡Refuerzos!", "Reforços!"),
            [T(u, $"{who} beteiligt sich jetzt am gemeinsamen Geschenk {w}.", $"{who} has joined the group gift {w}.",
                $"{who} participe maintenant au cadeau commun {w}.", $"{who} se suma ahora al regalo conjunto {w}.",
                $"{who} agora participa do presente em grupo {w}.")],
            Button: new(OpenGift(u), listUrl));
    }

    public static MailContent GroupLeft(AppUser u, string who, string wish, string listUrl)
    {
        var w = Q(u, wish);
        return new(
            "GroupLeft",
            T(u, $"{who} macht nicht mehr mit bei {w}", $"{who} left the group gift {w}", $"{who} ne participe plus à {w}",
                $"{who} ya no participa en {w}", $"{who} deixou de participar de {w}"),
            T(u, "Jemand ist ausgestiegen", "Someone left", "Quelqu'un s'est retiré", "Alguien se ha retirado", "Alguém saiu"),
            [T(u, $"{who} beteiligt sich nicht mehr am gemeinsamen Geschenk {w}.", $"{who} is no longer part of the group gift {w}.",
                $"{who} ne participe plus au cadeau commun {w}.", $"{who} ya no participa en el regalo conjunto {w}.",
                $"{who} não participa mais do presente em grupo {w}.")],
            Button: new(OpenGift(u), listUrl));
    }

    public static MailContent NowOrganizer(AppUser u, string wish, string listUrl)
    {
        var w = Q(u, wish);
        return new(
            "NowOrganizer",
            T(u, $"Du organisierst jetzt {w}", $"You're now organising {w}", $"Tu organises maintenant {w}", $"Ahora organizas {w}", $"Agora você organiza {w}"),
            T(u, "Du bist jetzt Organisator:in", "You're the organiser now", "Tu es maintenant l'organisateur ou l'organisatrice",
                "Ahora eres quien organiza", "Agora você é quem organiza"),
            [T(u, $"Die bisherige Organisatorin oder der bisherige Organisator ist ausgestiegen. Du koordinierst jetzt das gemeinsame Geschenk {w} und kannst es als gekauft markieren.",
                $"The previous organiser left. You now coordinate the group gift {w} and can mark it as bought.",
                $"La personne qui organisait s'est retirée. Tu coordonnes maintenant le cadeau commun {w} et peux le marquer comme acheté.",
                $"La persona que organizaba se ha retirado. Ahora coordinas el regalo conjunto {w} y puedes marcarlo como comprado.",
                $"Quem organizava saiu. Agora você coordena o presente em grupo {w} e pode marcá-lo como comprado.")],
            Button: new(OpenGift(u), listUrl));
    }

    public static MailContent WishChanged(AppUser u, string wish, WishChange change, string listUrl)
    {
        var w = Q(u, wish);
        return new(
            "WishChanged",
            change switch
            {
                WishChange.Removed => T(u, $"{w} wird nicht mehr gebraucht", $"{w} is no longer needed", $"{w} n'est plus nécessaire",
                    $"{w} ya no hace falta", $"{w} não é mais necessário"),
                WishChange.Fulfilled => T(u, $"{w} ist schon erfüllt", $"{w} has already been fulfilled", $"{w} est déjà exaucé",
                    $"{w} ya está cumplido", $"{w} já foi realizado"),
                _ => T(u, $"{w} wurde geändert", $"{w} was changed", $"{w} a été modifié", $"{w} ha cambiado", $"{w} foi alterado"),
            },
            T(u, "Der Wunsch, den du schenkst, hat sich geändert", "The wish you're giving has changed", "Le souhait que tu offres a changé",
                "El deseo que regalas ha cambiado", "O desejo que você dá mudou"),
            [
                change switch
                {
                    WishChange.Removed => T(u, $"{w} wurde von der Liste genommen. Deine Reservation bleibt sichtbar, bis du sie zurückziehst.",
                        $"{w} was taken off the list. Your reservation stays visible until you withdraw it.",
                        $"{w} a été retiré de la liste. Ta réservation reste visible jusqu'à ce que tu l'annules.",
                        $"{w} se ha quitado de la lista. Tu reserva sigue visible hasta que la retires.",
                        $"{w} foi retirado da lista. Sua reserva continua visível até você desistir."),
                    WishChange.Fulfilled => T(u, $"{w} wurde als erfüllt markiert. Vielleicht lohnt sich ein kurzer Blick, bevor du etwas kaufst.",
                        $"{w} was marked as fulfilled. It might be worth a quick look before you buy anything.",
                        $"{w} a été marqué comme exaucé. Un petit coup d'œil peut valoir la peine avant d'acheter quoi que ce soit.",
                        $"{w} se ha marcado como cumplido. Quizá merezca la pena echar un vistazo antes de comprar nada.",
                        $"{w} foi marcado como realizado. Talvez valha dar uma olhada antes de comprar qualquer coisa."),
                    _ => T(u, $"Bei {w} hat sich etwas geändert, zum Beispiel der Preis oder die Anzahl. Schau kurz nach, ob deine Wahl noch passt.",
                        $"Something about {w} changed, for example the price or quantity. Have a quick look whether your choice still fits.",
                        $"Quelque chose a changé pour {w}, par exemple le prix ou la quantité. Vérifie rapidement si ton choix convient toujours.",
                        $"Algo ha cambiado en {w}, por ejemplo el precio o la cantidad. Comprueba si tu elección sigue valiendo.",
                        $"Algo mudou em {w}, por exemplo o preço ou a quantidade. Confira se sua escolha ainda serve."),
                },
            ],
            Button: new(OpenList(u), listUrl));
    }

    public static MailContent EventReminder(AppUser u, string list, DateOnly date, IReadOnlyList<string> wishes, string listUrl)
    {
        var l = Q(u, list);
        var items = QuotedList(u, wishes);
        return new(
            "EventReminder",
            T(u, $"Bald ist es so weit: {l}", $"Coming up soon: {l}", $"Bientôt le grand jour : {l}", $"Ya falta poco: {l}", $"Falta pouco: {l}"),
            T(u, "Noch eine Woche", "One week to go", "Plus qu'une semaine", "Falta una semana", "Falta uma semana"),
            [
                Hello(u) + ",",
                T(u, $"am {Date(u, date)} ist es so weit. Du hast {items} noch nicht als gekauft markiert.",
                    $"the big day is {Date(u, date)}. You haven't marked {items} as bought yet.",
                    $"le grand jour est le {Date(u, date)}. Tu n'as pas encore marqué {items} comme acheté.",
                    $"el gran día es el {Date(u, date)}. Aún no has marcado {items} como comprado.",
                    $"o grande dia é {Date(u, date)}. Você ainda não marcou {items} como comprado."),
            ],
            Button: new(OpenList(u), listUrl));
    }
}
