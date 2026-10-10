import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThanksEntry, WishlistDetail } from '../../core/api';
import { paletteClass } from '../../shared/palettes';
import { UiEmpty, UiLoadingBar } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';

/** The Dankesliste: who gave what. Only reachable on purpose, from the event date on (ARCHITECTURE §6). */
@Component({
  selector: 'app-thanks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiEmpty, UiIcon, UiLoadingBar],
  template: `
    @let l = list.value();
    <div [class]="l ? paletteClass(l.theme.palette) : ''" class="min-h-[calc(100dvh-4rem)] bg-paper">
      <div class="page page-narrow">
        <a [routerLink]="['/lists', id(), 'edit']" class="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted no-underline hover:text-accent">
          <ui-icon name="arrow_back" [size]="18" /><span i18n="@@thanks.back">Zur Liste</span>
        </a>
        <header class="my-8 flex flex-col items-center text-center">
          <span class="stamp size-24 text-5xl" aria-hidden="true">🎉</span>
          <h1 class="display mt-5 text-4xl" i18n="@@thanks.title">Wer hat was geschenkt?</h1>
          @if (l) { <p class="mt-2 text-ink-muted">{{ l.title }}</p> }
        </header>

        @if (thanks.hasValue()) {
          @if (thanks.value().length === 0) {
            <ui-empty emoji="🕊️"><span i18n="@@thanks.empty">Über Wunschzettu wurde nichts reserviert.</span></ui-empty>
          }
          <ul class="flex flex-col gap-3">
            @for (t of thanks.value(); track t.wishId; let i = $index) {
              <li class="card flex animate-rise flex-col gap-2 p-5" [style.animation-delay.ms]="i * 60">
                <strong class="display text-lg">{{ t.wishName }}</strong>
                <span class="inline-flex items-center gap-1.5 font-semibold text-accent">
                  @if (t.isGroup) { <ui-icon name="groups" [size]="18" /> }
                  {{ names(t) }}
                </span>
                @for (g of t.givers; track $index) {
                  @if (g.message) {
                    <blockquote class="mt-1 rounded-2xl bg-sunken px-4 py-3 italic">«{{ g.message }}» <cite class="text-ink-muted not-italic">– {{ g.name }}</cite></blockquote>
                  }
                }
              </li>
            }
          </ul>
        } @else if (thanks.error()) {
          <ui-empty emoji="⏳"><span i18n="@@thanks.tooEarly">Die Dankesliste öffnet sich am Tag nach dem Anlass.</span></ui-empty>
        } @else {
          <ui-loading-bar />
        }
      </div>
    </div>
  `,
})
export class Thanks {
  readonly id = input.required<string>();
  protected readonly paletteClass = paletteClass;
  protected readonly list = httpResource<WishlistDetail>(() => `/api/wishlists/${this.id()}`);
  protected readonly thanks = httpResource<ThanksEntry[]>(() => `/api/wishlists/${this.id()}/thanks`);

  protected names(t: ThanksEntry) {
    return t.givers.map((g) => g.name).join(', ');
  }
}
