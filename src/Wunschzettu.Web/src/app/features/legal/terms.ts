// Template text, not legal advice; see legal-page.ts.
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LegalPage, OperatorEmail, isEnglish } from './legal-page';

@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage, OperatorEmail, RouterLink],
  template: `
    @if (en) {
      <app-legal-page heading="Terms of use">
        <p class="lead">Short and fair: these terms apply to everyone who uses this Wunschzettu instance – with or without an account.</p>

        <h2>1. The service</h2>
        <p>
          Wunschzettu lets you create wish lists, share them and give gifts together. It is offered free of charge by a private
          operator (see <a routerLink="/impressum">legal notice</a>). There is no claim to availability, to particular features or to the
          service continuing to exist; the operator tries to announce larger changes in good time.
        </p>

        <h2>2. Account</h2>
        <ul>
          <li>You sign in with your email address; a password is optional. Keep access to your mailbox and devices safe – whoever can read your mails can sign in as you.</li>
          <li>You must be at least 16 years old or use the service with the consent of your parents. Lists for children are usually managed by their parents.</li>
          <li>Please give a name others can recognise you by, and only email addresses you are allowed to use – also when inviting others.</li>
        </ul>

        <h2>3. Your content</h2>
        <ul>
          <li>You are responsible for what you enter: texts, links and pictures. Only upload pictures you have the rights to.</li>
          <li>Not allowed: illegal content, content that violates the rights of others, insults, spam, advertising, and anything that harms the service or other users (e.g. mass requests or attempts to bypass protections).</li>
          <li>You allow the operator to store your content and show it to the people you share it with, as far as needed for the service. You can delete it at any time.</li>
        </ul>

        <h2>4. The surprise</h2>
        <p>
          Wunschzettu is built so that recipients don't see what is given to them. This is a best effort, not a guarantee: whoever opens
          their own list signed out, on someone else's device or with another email address may see more than intended.
        </p>

        <h2>5. Gifts and money</h2>
        <p>
          Wunschzettu only helps with coordinating. Purchases, payments and agreements happen between the people involved and the shops,
          not through the service. Prices, pictures and availability taken from shops may be outdated or wrong.
        </p>

        <h2>6. Abuse</h2>
        <p>The operator may remove content and block or delete accounts that violate these terms, if possible after a notice.</p>

        <h2>7. Liability</h2>
        <p>
          The service is provided as it is. As far as the law permits, the operator is not liable for damage from its use, from
          interruptions or from lost data; liability for intent and gross negligence remains. Please keep important things elsewhere too.
        </p>

        <h2>8. Ending</h2>
        <p>You can delete your account at any time in your <a routerLink="/profile">profile</a>. The operator can end the service; in that case it will be announced in good time if possible.</p>

        <h2>9. Changes and law</h2>
        <p>
          Changes to these terms are announced on the site; whoever continues to use the service after that accepts them. Swiss law
          applies; the place of jurisdiction is the operator's place of residence, unless mandatory law provides otherwise. Questions:
          <app-operator-email />.
        </p>
      </app-legal-page>
    } @else {
      <app-legal-page heading="Nutzungsbedingungen">
        <p class="lead">Kurz und fair: Diese Bedingungen gelten für alle, die diese Wunschzettu-Instanz nutzen – mit oder ohne Konto.</p>

        <h2>1. Der Dienst</h2>
        <p>
          Mit Wunschzettu erstellst du Wunschlisten, teilst sie und schenkst gemeinsam. Der Dienst wird von einem privaten Betreiber
          kostenlos angeboten (siehe <a routerLink="/impressum">Impressum</a>). Es besteht kein Anspruch auf Verfügbarkeit, auf bestimmte
          Funktionen oder darauf, dass es den Dienst weiter gibt; grössere Änderungen kündigt der Betreiber nach Möglichkeit rechtzeitig an.
        </p>

        <h2>2. Konto</h2>
        <ul>
          <li>Du meldest dich mit deiner E-Mail-Adresse an; ein Passwort ist freiwillig. Schütze den Zugang zu deinem Postfach und deinen Geräten – wer deine Mails lesen kann, kann sich als du anmelden.</li>
          <li>Du musst mindestens 16 Jahre alt sein oder den Dienst mit Einverständnis deiner Eltern nutzen. Listen für Kinder verwalten in der Regel die Eltern.</li>
          <li>Gib bitte einen Namen an, an dem dich andere erkennen, und nur E-Mail-Adressen, die du verwenden darfst – auch beim Einladen.</li>
        </ul>

        <h2>3. Deine Inhalte</h2>
        <ul>
          <li>Für das, was du eingibst, bist du verantwortlich: Texte, Links und Bilder. Lade nur Bilder hoch, an denen du die Rechte hast.</li>
          <li>Nicht erlaubt sind rechtswidrige Inhalte, Inhalte, die Rechte anderer verletzen, Beleidigungen, Spam, Werbung und alles, was dem Dienst oder anderen schadet (z.B. Massenanfragen oder Versuche, Schutzmassnahmen zu umgehen).</li>
          <li>Du erlaubst dem Betreiber, deine Inhalte zu speichern und den Personen zu zeigen, mit denen du sie teilst, soweit das für den Dienst nötig ist. Du kannst sie jederzeit löschen.</li>
        </ul>

        <h2>4. Die Überraschung</h2>
        <p>
          Wunschzettu ist so gebaut, dass Beschenkte nicht sehen, was ihnen geschenkt wird. Das ist ein bestmöglicher Schutz, keine
          Garantie: Wer die eigene Liste abgemeldet, auf einem fremden Gerät oder mit einer anderen E-Mail-Adresse öffnet, sieht unter
          Umständen mehr als gedacht.
        </p>

        <h2>5. Geschenke und Geld</h2>
        <p>
          Wunschzettu hilft nur beim Absprechen. Käufe, Zahlungen und Abmachungen finden zwischen den Beteiligten und den Shops statt,
          nicht über den Dienst. Aus Shops übernommene Preise, Bilder und Verfügbarkeiten können veraltet oder falsch sein.
        </p>

        <h2>6. Missbrauch</h2>
        <p>Der Betreiber darf Inhalte entfernen und Konten sperren oder löschen, die gegen diese Bedingungen verstossen, wenn möglich nach einem Hinweis.</p>

        <h2>7. Haftung</h2>
        <p>
          Der Dienst wird so angeboten, wie er ist. Soweit gesetzlich zulässig, haftet der Betreiber nicht für Schäden aus der Nutzung,
          aus Unterbrüchen oder aus verlorenen Daten; die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt bestehen. Bewahre Wichtiges
          bitte auch anderswo auf.
        </p>

        <h2>8. Beenden</h2>
        <p>Du kannst dein Konto jederzeit in deinem <a routerLink="/profile">Profil</a> löschen. Der Betreiber kann den Dienst einstellen; das wird nach Möglichkeit rechtzeitig angekündigt.</p>

        <h2>9. Änderungen und Recht</h2>
        <p>
          Änderungen dieser Bedingungen werden auf der Website bekannt gegeben; wer den Dienst danach weiter nutzt, akzeptiert sie. Es
          gilt Schweizer Recht; Gerichtsstand ist der Wohnsitz des Betreibers, soweit zwingendes Recht nichts anderes vorsieht. Fragen:
          <app-operator-email />.
        </p>
      </app-legal-page>
    }
  `,
})
export class Terms {
  protected readonly en = isEnglish();
}
