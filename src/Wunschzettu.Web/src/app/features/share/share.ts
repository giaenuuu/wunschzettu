import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dashboard, WishlistDetail } from '../../core/api';
import { Auth } from '../../core/auth';
import { hostOf, sharedLink } from '../../shared/links';
import { paletteClass } from '../../shared/palettes';
import { UiButton } from '../../ui/button';
import { Dialogs } from '../../ui/dialog';
import { UiEmpty, UiSkeleton } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { CreateListDialog } from '../dashboard/create-list-dialog';

/**
 * Target of "Teilen → Wunschzettu" (Web Share Target, manifest.webmanifest): picks the list,
 * then the editor opens the wish dialog with the shared link (ARCHITECTURE §10).
 */
@Component({
  selector: 'app-share',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiEmpty, UiIcon, UiSkeleton],
  template: `
    <div class="page page-narrow">
      @if (!shared().url) {
        <ui-empty emoji="🤔" i18n-title="@@share.noLinkTitle" title="Kein Link dabei">
          <span i18n="@@share.noLink">Teile eine Produktseite aus dem Browser oder einer Shop-App, dann machen wir einen Wunsch daraus.</span>
          <a uiEmptyAction uiButton variant="secondary" routerLink="/" i18n="@@common.toOverview">Zur Übersicht</a>
        </ui-empty>
      } @else if (!auth.confirmed()) {
        <p class="notice notice-warn" i18n="@@share.confirmFirst">Bestätige zuerst deine E-Mail-Adresse, dann kannst du Wünsche erfassen.</p>
      } @else {
        <header class="mb-6 flex flex-col items-center pt-4 text-center">
          <span class="stamp size-20 text-4xl" aria-hidden="true">🔗</span>
          <h1 class="display mt-4 text-3xl" i18n="@@share.title">Auf welche Liste?</h1>
          <p class="mt-2 max-w-sm break-words text-ink-muted">{{ shared().title || host() }}</p>
        </header>
        @if (lists.hasValue()) {
          <div class="flex flex-col gap-3">
            @for (list of mine(); track list.id) {
              <button type="button" class="card card-link flex cursor-pointer items-center gap-4 p-4 text-left" [class]="paletteClass(list.theme.palette)" (click)="open(list.id)">
                <span class="stamp size-12 text-2xl [--stamp-r:4px]" aria-hidden="true">{{ list.theme.emoji || '🎁' }}</span>
                <strong class="min-w-0 flex-1 truncate">{{ list.title }}</strong>
                <ui-icon name="chevron_right" class="text-ink-muted" />
              </button>
            }
            <button uiButton variant="outline" (click)="createList()"><ui-icon name="add" /><span i18n="@@share.newList">Neue Liste</span></button>
          </div>
        } @else {
          <div class="flex flex-col gap-3" role="status" i18n-aria-label="@@common.loading" aria-label="Lädt …">
            <ui-skeleton class="h-20" /><ui-skeleton class="h-20" />
          </div>
        }
      }
    </div>
  `,
})
export class Share {
  readonly url = input<string>();
  readonly text = input<string>();
  readonly title = input<string>();

  protected readonly auth = inject(Auth);
  readonly #router = inject(Router);
  readonly #dialogs = inject(Dialogs);
  protected readonly paletteClass = paletteClass;

  protected readonly shared = computed(() => sharedLink({ url: this.url(), text: this.text(), title: this.title() }));
  protected readonly host = computed(() => hostOf(this.shared().url ?? ''));
  protected readonly lists = httpResource<Dashboard>(() => (this.shared().url && this.auth.confirmed() ? '/api/wishlists' : undefined));
  /** Lists where I may add wishes: the ones I manage or receive. */
  protected readonly mine = computed(() => this.lists.value()?.mine ?? []);

  constructor() {
    // With a single list there is nothing to choose.
    effect(() => {
      const mine = this.mine();
      if (this.lists.hasValue() && mine.length === 1) this.open(mine[0].id, true);
    });
  }

  protected open(listId: string, replaceUrl = false) {
    const { url, title } = this.shared();
    this.#router.navigate(['/lists', listId, 'edit'], { queryParams: { share: url, shareTitle: title }, replaceUrl });
  }

  protected createList() {
    this.#dialogs.open<CreateListDialog, void, WishlistDetail>(CreateListDialog).closed.subscribe((list) => list && this.open(list.id, true));
  }
}
