// The legal texts are carefully written templates, not legal advice. Whoever runs an instance
// is the operator and should check them for their situation (ARCHITECTURE §11, go-live checklist).
// Long prose lives in one template per language instead of hundreds of i18n units.
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LegalInfo } from '../../core/api';
import { chosenLanguage } from '../../core/language';
import { UiSkeleton } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';

export const isEnglish = () => chosenLanguage() === 'en';

/** Operator details from the server's App:Operator configuration, loaded once and shared by all legal pages. */
@Injectable({ providedIn: 'root' })
export class OperatorInfo {
  readonly info = httpResource<LegalInfo>(() => '/api/legal');
}

/** Page frame shared by Impressum, Datenschutz and Nutzungsbedingungen. */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <article class="page legal">
      <h1 class="display text-3xl break-words hyphens-auto sm:text-4xl">{{ heading() }}</h1>
      <p class="mt-2 text-sm text-ink-muted">{{ en ? 'Last updated: October 2026' : 'Stand: Oktober 2026' }}</p>
      <ng-content />
      <nav class="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm" [attr.aria-label]="en ? 'Other legal pages' : 'Weitere rechtliche Seiten'">
        <a routerLink="/impressum" routerLinkActive="font-semibold" ariaCurrentWhenActive="page">{{ en ? 'Legal notice' : 'Impressum' }}</a>
        <a routerLink="/datenschutz" routerLinkActive="font-semibold" ariaCurrentWhenActive="page">{{ en ? 'Privacy policy' : 'Datenschutzerklärung' }}</a>
        <a routerLink="/nutzungsbedingungen" routerLinkActive="font-semibold" ariaCurrentWhenActive="page">{{ en ? 'Terms of use' : 'Nutzungsbedingungen' }}</a>
      </nav>
    </article>
  `,
})
export class LegalPage {
  readonly heading = input.required<string>();
  protected readonly en = isEnglish();
}

/** Name, address and email of the operator, or a visible hint that the configuration is missing. */
@Component({
  selector: 'app-operator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon, UiSkeleton],
  template: `
    @if (info.hasValue()) {
      @let o = info.value();
      @if (configured()) {
        <address class="not-italic">
          @if (o.operatorName) { <strong>{{ o.operatorName }}</strong><br /> }
          @if (o.operatorAddress) { <span class="whitespace-pre-line">{{ o.operatorAddress }}</span><br /> }
          @if (o.operatorEmail) { <a [href]="'mailto:' + o.operatorEmail">{{ o.operatorEmail }}</a> }
        </address>
      } @else {
        <p class="notice notice-warn" role="alert">
          <ui-icon name="warning" />
          <span>{{ en ? 'Operator details are missing (App:Operator in the configuration).' : 'Betreiberangaben fehlen (App:Operator in der Konfiguration).' }}</span>
        </p>
      }
    } @else if (info.error()) {
      <p class="notice notice-warn" role="alert">
        <ui-icon name="error" /><span>{{ en ? 'Operator details could not be loaded.' : 'Die Betreiberangaben konnten nicht geladen werden.' }}</span>
      </p>
    } @else {
      <ui-skeleton class="h-20" />
    }
  `,
})
export class Operator {
  protected readonly en = isEnglish();
  protected readonly info = inject(OperatorInfo).info;
  protected readonly configured = computed(() => {
    const o = this.info.value();
    return !!o && !!o.operatorName && !!o.operatorEmail;
  });
}

/** The operator's email inline in running text, falling back to a neutral phrase. */
@Component({
  selector: 'app-operator-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (info.value()?.operatorEmail; as mail) {<a [href]="'mailto:' + mail">{{ mail }}</a>} @else {{{ en ? 'the operator' : 'den Betreiber' }}}`,
})
export class OperatorEmail {
  protected readonly en = isEnglish();
  protected readonly info = inject(OperatorInfo).info;
}
