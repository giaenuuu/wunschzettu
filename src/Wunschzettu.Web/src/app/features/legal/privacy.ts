// Template text, not legal advice; see legal-page.ts. Written for the Swiss revDSG/nDSG and the EU GDPR.
// Keep it in sync with what the app really does: retention periods live in the API (Jobs.cs, ARCHITECTURE §9).
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalPage, Operator, OperatorEmail, isEnglish } from './legal-page';

@Component({
  selector: 'app-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage, Operator, OperatorEmail, RouterLink],
  template: `
    @if (en) {
      <app-legal-page heading="Privacy policy">
        <p class="lead">
          Wunschzettu collects only what it needs to run wish lists – no tracking, no analytics, no advertising. This policy explains
          which data that is, what it is used for and what rights you have. It follows the Swiss Federal Act on Data Protection (FADP)
          and, where applicable, the EU General Data Protection Regulation (GDPR).
        </p>

        <h2>1. Who is responsible</h2>
        <p>Responsible for the processing (controller) is the operator of this instance:</p>
        <app-operator />

        <h2>2. Which data we process</h2>
        <ul>
          <li><strong>Account:</strong> email address, display name, language, whether the address is confirmed, and – only if you set one – your password, stored exclusively as a salted hash.</li>
          <li><strong>Content you enter:</strong> lists (title, description, date, design), wishes with text, prices, links, shop details, EAN numbers and pictures. Pictures are re-encoded on upload; metadata such as the location of a photo is removed.</li>
          <li><strong>Gifts:</strong> which wishes you give, alone or with others, amounts and messages within a group gift, and whether something is marked as bought.</li>
          <li><strong>Memberships:</strong> which lists you manage, receive or were invited to.</li>
          <li><strong>Data others enter about you:</strong> whoever invites you enters your email address; whoever creates a list for you enters your name.</li>
          <li><strong>Mails:</strong> copies of the mails sent to you (sign-in codes, confirmations, reminders, notifications).</li>
          <li><strong>Technical data:</strong> your IP address is used briefly in memory to limit sign-in attempts and link requests; the server writes technical logs (time, requested address, errors) for operation and security.</li>
        </ul>

        <h2>3. Purposes and legal basis</h2>
        <p>
          We process this data to provide the service you use: lists, sharing, giving and the related mails (GDPR Art. 6(1)(b),
          performance of a contract). Protecting the service against abuse – rate limits, logs, sign-in protection – is based on our
          legitimate interest in a secure service (GDPR Art. 6(1)(f)). There is no other use: no profiling, no sale, no newsletter.
        </p>

        <h2>4. Cookies and local storage</h2>
        <p>
          Wunschzettu sets a single cookie, <code>wz_session</code>, which keeps you signed in. It is strictly necessary, so no consent
          is required. Your browser additionally stores a few settings locally on your device, which never leave it: colour scheme
          (<code>wz.scheme</code>), language (<code>wz.lang</code>), lists you opened as the recipient (<code>wz.myLists</code>, so they
          ask you to sign in before showing what's taken) and lists where you chose to give something (<code>wz.guestOk</code>). The
          installed app stores its own files and pictures in the browser cache.
        </p>

        <h2>5. Who receives data</h2>
        <ul>
          <li><strong>Other users</strong> see what is needed for lists: your name on lists you manage or receive; other guests see that a wish is taken and – only if the list allows it – by whom; group gift partners see each other's names, amounts and messages. Wunschzettu doesn't show recipients what they are given (see the terms of use, section 4).</li>
          <li><strong>Mail provider:</strong> mails are sent through the operator's mail provider (SMTP), which processes the recipient address and content to deliver them. If that provider is located outside Switzerland or the EEA (e.g. in the USA), data is transferred there on the basis of an adequacy decision or the EU standard contractual clauses.</li>
          <li><strong>Hosting:</strong> the service runs on the operator's own server in the operator's country of residence (see section 1). No cloud services, no third-party fonts or content delivery networks are used.</li>
        </ul>

        <h2>6. Links, shops and link previews</h2>
        <ul>
          <li>When a wish is created from a link or a link is saved, <strong>our server</strong> fetches that page to read the title, price and picture. The shop sees the server, not you.</li>
          <li>Picture suggestions in the wish dialog are loaded <strong>directly by your browser</strong> from the shop; the shop sees your IP address, as with any visit.</li>
          <li>Shop links and «Compare prices» (Google Shopping) are ordinary links. Only when you open them does the respective provider's privacy policy apply. We don't pass on anything about you; the address of this site is not sent along.</li>
        </ul>

        <h2>7. How long we keep data</h2>
        <ul>
          <li>Account and content: as long as your account exists. You can delete it at any time in your <a routerLink="/profile">profile</a>.</li>
          <li>Deleted lists: restorable for 30 days, then deleted for good, pictures included.</li>
          <li>Unconfirmed reservations are released after 7 days at the latest.</li>
          <li>Sign-in codes and links: deleted one day after they expire.</li>
          <li>Copies of sent mails: 30 days.</li>
          <li>Accounts that were never confirmed and hold nothing: 30 days.</li>
          <li>Backups of the database: 7 days. Copies made before an update and off-site backups: until the operator deletes them, at most 30 days.</li>
          <li>Server logs (errors and warnings): overwritten continuously, at most 14 days.</li>
        </ul>

        <h2>8. Your rights</h2>
        <p>
          You have the right to access your data, to receive it in a common format, to have it corrected or deleted, to restrict or
          object to its processing and, where processing is based on consent, to withdraw it. In your <a routerLink="/profile">profile</a>
          you can download all your data and delete your account yourself. For everything else, write to <app-operator-email />.
        </p>
        <p>
          You may also lodge a complaint with a supervisory authority – in Switzerland the Federal Data Protection and Information
          Commissioner (FDPIC, <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener noreferrer">edoeb.admin.ch</a>), in the EU
          the authority of your country of residence.
        </p>

        <h2>9. Security</h2>
        <p>
          Connections are encrypted (HTTPS). Passwords, codes and links are stored only as hashes. Access to lists is checked on every
          request, and the server protects itself against fetching internal addresses and against mass requests.
        </p>

        <h2>10. Changes</h2>
        <p>If the service changes, this policy is updated. The current version is always available on this page.</p>
      </app-legal-page>
    } @else {
      <app-legal-page heading="Datenschutzerklärung">
        <p class="lead">
          Wunschzettu erhebt nur, was es für Wunschlisten braucht – kein Tracking, keine Statistik-Dienste, keine Werbung. Hier steht,
          welche Daten das sind, wofür sie verwendet werden und welche Rechte du hast. Die Erklärung richtet sich nach dem
          Schweizer Datenschutzgesetz (DSG) und, soweit anwendbar, nach der EU-Datenschutz-Grundverordnung (DSGVO).
        </p>

        <h2>1. Verantwortlich</h2>
        <p>Verantwortlich für die Bearbeitung ist der Betreiber dieser Instanz:</p>
        <app-operator />

        <h2>2. Welche Daten wir bearbeiten</h2>
        <ul>
          <li><strong>Konto:</strong> E-Mail-Adresse, Anzeigename, Sprache, ob die Adresse bestätigt ist, und – nur wenn du eines setzt – dein Passwort, ausschliesslich als gesalzener Hash gespeichert.</li>
          <li><strong>Was du eingibst:</strong> Listen (Titel, Beschreibung, Datum, Gestaltung), Wünsche mit Text, Preisen, Links, Geschäften, EAN-Nummern und Bildern. Bilder werden beim Hochladen neu kodiert; Metadaten wie der Aufnahmeort eines Fotos werden entfernt.</li>
          <li><strong>Geschenke:</strong> welche Wünsche du allein oder gemeinsam schenkst, Beträge und Nachrichten innerhalb eines gemeinsamen Geschenks, und ob etwas als gekauft markiert ist.</li>
          <li><strong>Mitgliedschaften:</strong> welche Listen du verwaltest, welche für dich sind und zu welchen du eingeladen wurdest.</li>
          <li><strong>Was andere über dich eingeben:</strong> Wer dich einlädt, gibt deine E-Mail-Adresse ein; wer für dich eine Liste erstellt, deinen Namen.</li>
          <li><strong>Mails:</strong> Kopien der Mails, die wir dir schicken (Anmeldecodes, Bestätigungen, Erinnerungen, Benachrichtigungen).</li>
          <li><strong>Technische Daten:</strong> Deine IP-Adresse wird kurz im Arbeitsspeicher verwendet, um Anmeldeversuche und Link-Abfragen zu begrenzen; der Server schreibt technische Protokolle (Zeit, aufgerufene Adresse, Fehler) für Betrieb und Sicherheit.</li>
        </ul>

        <h2>3. Zwecke und Rechtsgrundlage</h2>
        <p>
          Wir bearbeiten diese Daten, um den Dienst zu erbringen, den du nutzt: Listen, Teilen, Schenken und die dazugehörigen Mails
          (DSGVO Art. 6 Abs. 1 lit. b, Vertragserfüllung). Der Schutz vor Missbrauch – Begrenzungen, Protokolle, Anmeldeschutz – beruht auf
          unserem berechtigten Interesse an einem sicheren Dienst (DSGVO Art. 6 Abs. 1 lit. f). Eine andere Verwendung gibt es nicht:
          keine Profile, kein Verkauf, kein Newsletter.
        </p>

        <h2>4. Cookies und lokaler Speicher</h2>
        <p>
          Wunschzettu setzt ein einziges Cookie, <code>wz_session</code>, das dich angemeldet hält. Es ist technisch notwendig, deshalb
          braucht es keine Einwilligung. Zusätzlich speichert dein Browser ein paar Einstellungen lokal auf deinem Gerät, die es nie
          verlassen: Farbschema (<code>wz.scheme</code>), Sprache (<code>wz.lang</code>), Listen, die du als beschenkte Person geöffnet hast
          (<code>wz.myLists</code>, damit sie vor dem Anzeigen des Vergebenen nach einer Anmeldung fragen), und Listen, bei denen du
          etwas schenken wolltest (<code>wz.guestOk</code>). Die installierte App legt ihre eigenen Dateien und Bilder im Browser-Cache ab.
        </p>

        <h2>5. Wer Daten erhält</h2>
        <ul>
          <li><strong>Andere Nutzerinnen und Nutzer</strong> sehen, was für die Listen nötig ist: deinen Namen bei Listen, die du verwaltest oder die für dich sind; andere Gäste sehen, dass ein Wunsch vergeben ist, und – nur wenn die Liste das erlaubt – von wem; wer gemeinsam schenkt, sieht Namen, Beträge und Nachrichten der anderen. Wunschzettu zeigt Beschenkten nicht, was ihnen geschenkt wird (siehe Nutzungsbedingungen, Abschnitt 4).</li>
          <li><strong>Mail-Anbieter:</strong> Mails werden über den Mail-Anbieter des Betreibers (SMTP) verschickt, der Empfängeradresse und Inhalt für die Zustellung bearbeitet. Sitzt dieser Anbieter ausserhalb der Schweiz oder des EWR (z.B. in den USA), werden Daten dorthin übermittelt, gestützt auf einen Angemessenheitsbeschluss oder die Standardvertragsklauseln der EU-Kommission.</li>
          <li><strong>Hosting:</strong> Der Dienst läuft auf einem eigenen Server des Betreibers in dessen Wohnsitzland (siehe Abschnitt 1). Es werden keine Cloud-Dienste, keine fremden Schriften und keine Content-Delivery-Netzwerke verwendet.</li>
        </ul>

        <h2>6. Links, Shops und Link-Vorschauen</h2>
        <ul>
          <li>Erstellst du einen Wunsch aus einem Link oder speicherst einen Link, ruft <strong>unser Server</strong> die Seite ab, um Titel, Preis und Bild zu lesen. Der Shop sieht den Server, nicht dich.</li>
          <li>Bildvorschläge im Wunsch-Dialog lädt <strong>dein Browser direkt</strong> vom Shop; der Shop sieht dabei deine IP-Adresse, wie bei jedem Besuch.</li>
          <li>Shop-Links und «Preise vergleichen» (Google Shopping) sind gewöhnliche Links. Erst wenn du sie öffnest, gilt die Datenschutzerklärung des jeweiligen Anbieters. Wir geben nichts über dich weiter; die Adresse dieser Seite wird nicht mitgeschickt.</li>
        </ul>

        <h2>7. Wie lange wir Daten aufbewahren</h2>
        <ul>
          <li>Konto und Inhalte: solange dein Konto besteht. Du kannst es jederzeit in deinem <a routerLink="/profile">Profil</a> löschen.</li>
          <li>Gelöschte Listen: 30 Tage wiederherstellbar, danach endgültig gelöscht, Bilder inklusive.</li>
          <li>Unbestätigte Reservationen werden spätestens nach 7 Tagen freigegeben.</li>
          <li>Anmeldecodes und -links: einen Tag nach Ablauf gelöscht.</li>
          <li>Kopien verschickter Mails: 30 Tage.</li>
          <li>Nie bestätigte Konten ohne Inhalte: 30 Tage.</li>
          <li>Sicherungen der Datenbank: 7 Tage. Kopien vor Updates und Sicherungen ausser Haus: bis der Betreiber sie löscht, längstens 30 Tage.</li>
          <li>Server-Protokolle (Fehler und Warnungen): werden laufend überschrieben, längstens 14 Tage.</li>
        </ul>

        <h2>8. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft über deine Daten, auf deren Herausgabe in einem gängigen Format, auf Berichtigung und Löschung,
          auf Einschränkung der Bearbeitung und auf Widerspruch, und – wo eine Bearbeitung auf Einwilligung beruht – auf deren Widerruf.
          In deinem <a routerLink="/profile">Profil</a> kannst du alle deine Daten herunterladen und dein Konto selbst löschen. Für alles
          andere schreib an <app-operator-email />.
        </p>
        <p>
          Du kannst dich ausserdem bei einer Aufsichtsbehörde beschweren – in der Schweiz beim Eidgenössischen Datenschutz- und
          Öffentlichkeitsbeauftragten (EDÖB, <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener noreferrer">edoeb.admin.ch</a>), in
          der EU bei der Behörde deines Wohnsitzlandes.
        </p>

        <h2>9. Sicherheit</h2>
        <p>
          Verbindungen sind verschlüsselt (HTTPS). Passwörter, Codes und Links werden nur als Hash gespeichert. Der Zugriff auf Listen
          wird bei jeder Anfrage geprüft, und der Server schützt sich gegen Abfragen interner Adressen und gegen Massenanfragen.
        </p>

        <h2>10. Änderungen</h2>
        <p>Ändert sich der Dienst, wird diese Erklärung angepasst. Die aktuelle Fassung steht immer auf dieser Seite.</p>
      </app-legal-page>
    }
  `,
})
export class Privacy {
  protected readonly en = isEnglish();
}
