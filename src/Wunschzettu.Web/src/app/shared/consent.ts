import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The line under forms that create an account or identify someone. In dialogs, links open a new tab so nothing typed is lost. */
@Component({
  selector: 'app-consent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block text-xs text-ink-muted [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-accent' },
  template: `
    <ng-container i18n="@@consent.text">Mit dem Fortfahren akzeptierst du die <a routerLink="/nutzungsbedingungen" [attr.target]="newTab() ? '_blank' : null">Nutzungsbedingungen</a>. Wie wir mit Daten umgehen: <a routerLink="/datenschutz" [attr.target]="newTab() ? '_blank' : null">Datenschutzerklärung</a>.</ng-container>
  `,
})
export class Consent {
  readonly newTab = input(false);
}
