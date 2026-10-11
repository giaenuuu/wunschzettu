// Template text, not legal advice; see legal-page.ts.
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LegalPage, Operator, isEnglish } from './legal-page';

@Component({
  selector: 'app-imprint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalPage, Operator],
  template: `
    @if (en) {
      <app-legal-page heading="Legal notice">
        <h2>Operator</h2>
        <app-operator />
        <h2>About this service</h2>
        <p>
          Wunschzettu is a private, non-commercial service for wish lists among family and friends. It is run on the operator's own
          server, contains no advertising and sells nothing.
        </p>
        <h2>Contact</h2>
        <p>For questions, problems or reports of abuse, please write to the email address above.</p>
        <h2>Links to other websites</h2>
        <p>
          Wishes may link to shops and other websites. Their content is the responsibility of their operators; the operator of
          Wunschzettu has no influence on it and accepts no liability for it.
        </p>
      </app-legal-page>
    } @else {
      <app-legal-page heading="Impressum">
        <h2>Betreiber</h2>
        <app-operator />
        <h2>Über diesen Dienst</h2>
        <p>
          Wunschzettu ist ein privater, nicht kommerzieller Dienst für Wunschlisten unter Familie und Freunden. Er läuft auf einem
          eigenen Server des Betreibers, enthält keine Werbung und verkauft nichts.
        </p>
        <h2>Kontakt</h2>
        <p>Für Fragen, Probleme oder Hinweise auf Missbrauch schreib bitte an die E-Mail-Adresse oben.</p>
        <h2>Links auf andere Websites</h2>
        <p>
          Wünsche können auf Shops und andere Websites verlinken. Für deren Inhalte sind ausschliesslich deren Betreiber
          verantwortlich; der Betreiber von Wunschzettu hat darauf keinen Einfluss und übernimmt dafür keine Haftung.
        </p>
      </app-legal-page>
    }
  `,
})
export class Imprint {
  protected readonly en = isEnglish();
}
