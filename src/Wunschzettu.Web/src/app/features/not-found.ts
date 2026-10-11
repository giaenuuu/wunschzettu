import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton } from '../ui/button';
import { UiEmpty } from '../ui/feedback';

/** Any address the app doesn't know, e.g. a mistyped or shortened link. */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiEmpty],
  template: `
    <div class="page page-narrow pt-16">
      <ui-empty emoji="🧭" pageHeading i18n-title="@@notFound.title" title="Diese Seite gibt es nicht">
        <span i18n="@@notFound.text">Vielleicht wurde der Link beim Kopieren abgeschnitten. Prüf ihn nochmals oder frag bei der Person nach, die ihn geschickt hat.</span>
        <a uiEmptyAction uiButton variant="secondary" routerLink="/" i18n="@@common.toStart">Zur Startseite</a>
      </ui-empty>
    </div>
  `,
})
export class NotFound {}
