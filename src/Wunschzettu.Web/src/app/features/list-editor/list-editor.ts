import { Clipboard } from '@angular/cdk/clipboard';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ShareToken, Wish, WishGifts, WishlistDetail } from '../../core/api';
import { problemMessage } from '../../core/problems';
import { lastValue } from '../../shared/last-value';
import { paletteClass } from '../../shared/palettes';
import { RelativeDayPipe } from '../../shared/relative-day.pipe';
import { ShareButton } from '../../shared/share-button';
import { WishCard } from '../../shared/wish-card';
import { UiButton } from '../../ui/button';
import { Confirmer } from '../../ui/confirm';
import { Dialogs } from '../../ui/dialog';
import { UiEmpty, UiLoadingBar } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { Toaster } from '../../ui/toaster';
import { WishDialog, WishDialogData } from '../wish/wish-dialog';
import { GiftSummary } from './gift-summary';
import { ListSettings } from './list-settings';
import { MembersPanel } from './members-panel';

@Component({
  selector: 'app-list-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, DatePipe, RelativeDayPipe, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkMenu, CdkMenuItem, CdkMenuTrigger,
    UiButton, UiIcon, UiEmpty, UiLoadingBar, ShareButton, WishCard, ListSettings, MembersPanel, GiftSummary,
  ],
  template: `
    @if (current(); as l) {
      <div [class]="paletteClass(l.theme.palette)" class="min-h-[calc(100dvh-4rem)] bg-paper">
        <div class="relative overflow-hidden">
          <div class="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(closest-side,var(--color-accent-soft),transparent)]" aria-hidden="true"></div>
          <div class="page relative pb-0!">
            <a routerLink="/" class="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted no-underline hover:text-accent">
              <ui-icon name="arrow_back" [size]="18" /><span i18n="@@nav.backToOverview">Übersicht</span>
            </a>
            <header class="flex flex-wrap items-center gap-5">
              <span class="stamp size-20 rotate-[-4deg] text-4xl sm:size-24 sm:text-5xl" aria-hidden="true">{{ l.theme.emoji || '🎁' }}</span>
              <div class="min-w-0 flex-1 basis-60">
                <h1 class="display text-3xl break-words sm:text-4xl">{{ l.title }}</h1>
                <p class="mt-2 flex flex-wrap gap-2 text-sm">
                  @if (l.isRecipient) {
                    <span class="chip chip-gold" i18n="@@editor.forYou">für dich</span>
                  } @else if (l.recipientName) {
                    <span class="chip chip-gold" i18n="@@dashboard.for">für {{ l.recipientName }}</span>
                  }
                  @if (l.eventDate) {
                    <span class="chip" [title]="l.eventDate | date: 'longDate'"><ui-icon name="event" [size]="15" />{{ l.eventDate | date: 'mediumDate' }} · {{ l.eventDate | relativeDay }}</span>
                  }
                  @if (l.access === 'Invited') {
                    <span class="chip"><ui-icon name="lock" [size]="15" /><span i18n="@@editor.invitedOnly">nur Eingeladene</span></span>
                  }
                </p>
              </div>
              <a uiButton variant="outline" [routerLink]="['/l', l.shareToken]"><ui-icon name="visibility" [size]="18" /><span i18n="@@editor.preview">Wie Gäste sehen</span></a>
            </header>

            <section class="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-accent p-4 pl-5 text-on-accent shadow-[0_12px_30px_-14px_var(--color-accent)]" aria-labelledby="share-title">
              <ui-icon name="ios_share" [size]="28" class="hidden sm:block" />
              <div class="flex min-w-0 flex-1 basis-48 flex-col">
                <strong id="share-title" i18n="@@editor.shareTitle">Link teilen</strong>
                <span class="truncate text-sm opacity-85">{{ shareUrl() }}</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <app-share-button variant="on-accent" size="sm" [url]="shareUrl()" [title]="l.title" [text]="shareText(l)" />
                <button uiButton variant="on-accent" size="sm" (click)="copyLink()"><ui-icon name="content_copy" [size]="18" /><span i18n="@@editor.copy">Kopieren</span></button>
                @if (l.isManager) {
                  <button uiButton variant="on-accent" size="sm" [iconOnly]="true" [cdkMenuTriggerFor]="shareMenu" i18n-aria-label="@@editor.moreShare" aria-label="Weitere Optionen zum Link">
                    <ui-icon name="more_vert" />
                  </button>
                  <ng-template #shareMenu>
                    <div cdkMenu class="menu">
                      <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="regenerateLink()"><ui-icon name="autorenew" /><span i18n="@@editor.newLink">Neuen Link erstellen</span></button>
                    </div>
                  </ng-template>
                }
              </div>
            </section>

            @if (l.canShowThanks) {
              <a class="card card-link mt-4 flex items-center gap-4 p-4 text-ink no-underline" [routerLink]="['/lists', l.id, 'thanks']">
                <span class="text-4xl" aria-hidden="true">🎉</span>
                <span class="flex-1"><strong class="block" i18n="@@editor.thanksTitle">Das Fest ist vorbei!</strong>
                  <span class="text-ink-muted" i18n="@@editor.thanksText">Möchtest du sehen, wer was geschenkt hat?</span></span>
                <ui-icon name="chevron_right" />
              </a>
            }
            @if (l.isRecipient) {
              <p class="notice mt-4 items-center">
                <ui-icon name="visibility_off" />
                <span i18n="@@editor.recipientNote">Damit die Überraschung bleibt, siehst du hier nie, was schon reserviert oder verschenkt ist.</span>
              </p>
            }
          </div>
        </div>

        <div class="page">
          @if (list.error(); as error) {
            <p class="notice notice-warn mb-6 items-center" role="alert">
              <ui-icon name="error" />
              <span class="flex-1">{{ problemMessage(error) }}</span>
              <button uiButton variant="ghost" size="sm" (click)="refresh()" i18n="@@common.retry">Nochmals versuchen</button>
            </p>
          }
          @if (gifts.error(); as error) {
            <p class="notice notice-warn mb-6 items-center" role="alert">
              <ui-icon name="error" />
              <span class="flex-1"><ng-container i18n="@@editor.giftsFailed">Die Geschenke konnten nicht geladen werden.</ng-container> {{ problemMessage(error) }}</span>
              <button uiButton variant="ghost" size="sm" (click)="gifts.reload()" i18n="@@common.retry">Nochmals versuchen</button>
            </p>
          }
          <div class="mb-4 flex items-center gap-3">
            <h2 class="section-title flex-1">
              <span i18n="@@editor.wishes">Wünsche</span>
              @if (wishes().length) { <span class="chip ml-2 align-middle font-sans">{{ wishes().length }}</span> }
            </h2>
            <button uiButton (click)="openWish()"><ui-icon name="add" /><span i18n="@@editor.addWish">Wunsch hinzufügen</span></button>
          </div>

          @if (wishes().length === 0) {
            <ui-empty emoji="✍️" i18n-title="@@editor.emptyTitle" title="Noch keine Wünsche">
              <span i18n="@@editor.empty">Füg einen Link aus einem Online-Shop ein oder schreib einfach auf, was du dir wünschst.</span>
              <button uiEmptyAction uiButton (click)="openWish()" i18n="@@editor.addFirst">Ersten Wunsch hinzufügen</button>
            </ui-empty>
          }

          <ol cdkDropList (cdkDropListDropped)="reorder($event)" class="flex flex-col gap-4" i18n-aria-label="@@editor.wishes" aria-label="Wünsche">
            @for (wish of wishes(); track wish.id; let i = $index, first = $first, last = $last) {
              <li cdkDrag [cdkDragData]="wish" class="flex items-start gap-1.5">
                <div *cdkDragPlaceholder class="h-32 flex-1 rounded-[var(--radius-card)] border-2 border-dashed border-accent bg-accent-soft/30"></div>
                <button cdkDragHandle type="button" class="mt-4 hidden size-9 shrink-0 cursor-grab place-items-center rounded-full text-ink-muted hover:bg-sunken sm:grid" i18n-aria-label="@@editor.drag" aria-label="Ziehen zum Verschieben">
                  <ui-icon name="drag_indicator" />
                </button>
                <app-wish-card class="min-w-0 flex-1" [wish]="wish" [currency]="l.currency" [dimmed]="wish.state === 'Fulfilled'" [stamp]="wish.state === 'Fulfilled' ? fulfilledLabel : null" stampIcon="task_alt" [wide]="true">
                  @if (l.canSeeGifts) {
                    <app-gift-summary cardStatus [wish]="wish" [gifts]="giftsByWish().get(wish.id)" [currency]="l.currency" />
                  }
                  @if (wish.state === 'Fulfilled') {
                    <button uiButton variant="ghost" size="sm" (click)="setFulfilled(wish, false)"><ui-icon name="undo" [size]="18" /><span i18n="@@editor.unfulfil">Wieder wünschen</span></button>
                  } @else {
                    <button uiButton variant="ghost" size="sm" (click)="setFulfilled(wish, true)" i18n-title="@@editor.fulfilTooltip" title="Schon bekommen? Dann verschwindet der Wunsch für Gäste.">
                      <ui-icon name="task_alt" [size]="18" /><span i18n="@@editor.fulfil">Erfüllt</span>
                    </button>
                  }
                  <button uiButton variant="secondary" size="sm" (click)="openWish(wish)"><ui-icon name="edit" [size]="18" /><span i18n="@@common.edit">Bearbeiten</span></button>
                  <button uiButton variant="ghost" size="sm" [iconOnly]="true" [cdkMenuTriggerFor]="wishMenu" i18n-aria-label="@@editor.moreForWish" aria-label="Weitere Aktionen">
                    <ui-icon name="more_vert" />
                  </button>
                  <ng-template #wishMenu>
                    <div cdkMenu class="menu">
                      @if (!first) {
                        <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="move(i, -1)"><ui-icon name="arrow_upward" /><span i18n="@@editor.moveUp">Nach oben</span></button>
                      }
                      @if (!last) {
                        <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="move(i, 1)"><ui-icon name="arrow_downward" /><span i18n="@@editor.moveDown">Nach unten</span></button>
                      }
                      <div class="menu-separator"></div>
                      <button cdkMenuItem class="menu-item text-danger!" (cdkMenuItemTriggered)="deleteWish(wish)"><ui-icon name="delete" /><span i18n="@@common.delete">Löschen</span></button>
                    </div>
                  </ng-template>
                </app-wish-card>
              </li>
            }
          </ol>

          @if (removedWithGifts().length) {
            <h2 class="section-title mt-12 mb-1" i18n="@@editor.removedTitle">Entfernt, aber noch reserviert</h2>
            <p class="mb-4 text-ink-muted" i18n="@@editor.removedIntro">Die Schenkenden wurden informiert. Sobald sie zurückziehen, verschwinden diese Wünsche ganz.</p>
            @for (g of removedWithGifts(); track g.wishId) {
              <div class="notice mb-2 flex-wrap"><strong class="text-ink">{{ g.wishName }}</strong><span>{{ participantNames(g) }}</span></div>
            }
          }

          @if (l.isManager) {
            <div class="mt-14 flex flex-col gap-3">
              <details class="card group overflow-hidden" name="list-panels">
                <summary class="flex cursor-pointer list-none items-center gap-3 p-5 select-none [&::-webkit-details-marker]:hidden">
                  <span class="grid size-10 place-items-center rounded-xl bg-sunken"><ui-icon name="settings" /></span>
                  <span class="flex-1"><strong class="block" i18n="@@editor.settings">Einstellungen</strong>
                    <span class="text-sm text-ink-muted" i18n="@@editor.settingsHint">Titel, Datum, Farben, wer die Liste sieht</span></span>
                  <ui-icon name="keyboard_arrow_down" class="transition-transform group-open:rotate-180" />
                </summary>
                <div class="border-t border-line p-5"><app-list-settings [list]="l" (saved)="onSaved()" (deleteRequested)="deleteList()" /></div>
              </details>
              <details class="card group overflow-hidden" name="list-panels">
                <summary class="flex cursor-pointer list-none items-center gap-3 p-5 select-none [&::-webkit-details-marker]:hidden">
                  <span class="grid size-10 place-items-center rounded-xl bg-sunken"><ui-icon name="group" /></span>
                  <span class="flex-1"><strong class="block" i18n="@@editor.people">Personen</strong>
                    <span class="text-sm text-ink-muted" i18n="@@editor.peopleHint">Gemeinsam verwalten, Beschenkte einladen</span></span>
                  <ui-icon name="keyboard_arrow_down" class="transition-transform group-open:rotate-180" />
                </summary>
                <div class="border-t border-line p-5"><app-members-panel [list]="l" /></div>
              </details>
            </div>
          }
        </div>
      </div>
    } @else if (list.error()) {
      <div class="page page-narrow">
        <ui-empty emoji="🔍" i18n-title="@@editor.notFoundTitle" title="Liste nicht gefunden">
          <span i18n="@@editor.notFound">Diese Liste gibt es nicht oder du darfst sie nicht bearbeiten.</span>
          <a uiEmptyAction uiButton variant="secondary" routerLink="/" i18n="@@common.toOverview">Zur Übersicht</a>
        </ui-empty>
      </div>
    } @else {
      <ui-loading-bar />
    }
  `,
})
export class ListEditor {
  readonly id = input.required<string>();
  /** A link shared from another app (see /share): opens the wish dialog with it once the list is loaded. */
  readonly share = input<string>();
  readonly shareTitle = input<string>();

  readonly #http = inject(HttpClient);
  readonly #dialogs = inject(Dialogs);
  readonly #toaster = inject(Toaster);
  readonly #clipboard = inject(Clipboard);
  readonly #router = inject(Router);
  readonly #confirm = inject(Confirmer);

  protected readonly paletteClass = paletteClass;
  protected readonly problemMessage = problemMessage;
  protected readonly fulfilledLabel = $localize`:@@wish.stampFulfilled:Erfüllt`;
  /** Bumped after every change; a new request replaces one in flight (`reload()` would be ignored then). */
  readonly #version = signal(0);
  protected readonly list = httpResource<WishlistDetail>(() => {
    this.#version();
    return { url: `/api/wishlists/${this.id()}` };
  });
  /** The last loaded list, kept during reloads: no skeleton flash, open panels and the scroll position stay. */
  protected readonly current = lastValue(this.list);
  /** Only for managers who aren't the recipient. Recipients never request it (§6). */
  protected readonly gifts = httpResource<WishGifts[]>(() =>
    // A new request object per list value: reloading the list reloads the gifts too.
    this.current()?.canSeeGifts ? { url: `/api/wishlists/${this.id()}/gifts` } : undefined,
  );

  /** Local copy so reordering is instant; resets whenever the list reloads. */
  protected readonly wishes = linkedSignal(() => this.current()?.wishes ?? []);
  readonly #gifts = lastValue(this.gifts);
  protected readonly giftsByWish = computed(() => new Map((this.#gifts() ?? []).map((g) => [g.wishId, g])));
  protected readonly removedWithGifts = computed(() => (this.#gifts() ?? []).filter((g) => g.wishState === 'Removed'));
  protected readonly shareUrl = computed(() => (this.current() ? `${location.origin}/l/${this.current()!.shareToken}` : ''));

  constructor() {
    effect(() => {
      const url = this.share();
      if (!url || !this.current()) return;
      untracked(() => {
        // Drop the parameters first, so going back or reloading doesn't open the dialog again.
        this.#router.navigate([], { queryParams: { share: null, shareTitle: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.openWish(undefined, { url, title: this.shareTitle() ?? null });
      });
    });
  }

  protected participantNames(g: WishGifts) {
    return g.gifts.flatMap((x) => x.participants.map((p) => p.name)).join(', ');
  }

  protected shareText(l: WishlistDetail) {
    return `${l.theme.emoji || '🎁'} ${l.title}`;
  }

  protected copyLink() {
    this.#clipboard.copy(this.shareUrl());
    this.#toaster.show($localize`:@@editor.copied:Link kopiert – jetzt z.B. per WhatsApp teilen.`, { tone: 'success' });
  }

  protected async regenerateLink() {
    const ok = await this.#confirm.ask({
      title: $localize`:@@editor.newLinkTitle:Neuen Link erstellen?`,
      message: $localize`:@@editor.confirmNewLink:Der bisherige Link funktioniert dann nicht mehr. Wer schon etwas gewählt hat, findet die Liste weiterhin in der Übersicht.`,
      confirm: $localize`:@@editor.newLink:Neuen Link erstellen`,
    });
    if (!ok) return;
    await this.#run(firstValueFrom(this.#http.post<ShareToken>(`/api/wishlists/${this.id()}/share-token`, null)));
  }

  protected onSaved() {
    this.#toaster.show($localize`:@@common.saved:Gespeichert`, { tone: 'success' });
    this.#refresh();
  }

  protected async deleteList() {
    const ok = await this.#confirm.ask({
      title: $localize`:@@editor.confirmDeleteList:Liste wirklich löschen?`,
      message: $localize`:@@editor.deleteListMessage:Du kannst sie während 30 Tagen wiederherstellen.`,
      confirm: $localize`:@@common.delete:Löschen`,
      danger: true,
    });
    if (!ok) return;
    const id = this.id();
    try {
      await firstValueFrom(this.#http.delete(`/api/wishlists/${id}`));
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
      return;
    }
    await this.#router.navigateByUrl('/');
    this.#toaster.show($localize`:@@editor.listDeleted:Liste gelöscht`, {
      action: {
        label: $localize`:@@common.undo:Rückgängig`,
        run: async () => {
          try {
            await firstValueFrom(this.#http.post(`/api/wishlists/${id}/restore`, null));
            await this.#router.navigate(['/lists', id, 'edit']);
          } catch (e) {
            this.#toaster.show(problemMessage(e), { tone: 'error' });
          }
        },
      },
      duration: 10_000,
    });
  }

  protected openWish(wish?: Wish, shared?: WishDialogData['shared']) {
    const l = this.current()!;
    const ref = this.#dialogs.open<WishDialog, WishDialogData, Wish>(WishDialog, { data: { listId: l.id, currency: l.currency, wish, shared }, size: 'lg' });
    // Also after "cancel" once the wish itself was saved (e.g. only a picture failed).
    ref.closed.subscribe((saved) => (saved || ref.componentInstance?.saved()) && this.#refresh());
  }

  protected async setFulfilled(wish: Wish, fulfilled: boolean) {
    const url = `/api/wishes/${wish.id}/fulfil`;
    await this.#run(firstValueFrom(fulfilled ? this.#http.post(url, null) : this.#http.delete(url)));
  }

  protected async deleteWish(wish: Wish) {
    const ok = await this.#confirm.ask({ title: $localize`:@@editor.confirmDeleteWish:«${wish.name}:name:» löschen?`, confirm: $localize`:@@common.delete:Löschen`, danger: true });
    if (ok) await this.#run(firstValueFrom(this.#http.delete(`/api/wishes/${wish.id}`)));
  }

  protected reorder(event: CdkDragDrop<Wish[]>) {
    if (event.previousIndex !== event.currentIndex) this.#saveOrder(event.previousIndex, event.currentIndex);
  }

  /** Keyboard and screen-reader friendly alternative to dragging. */
  protected move(index: number, delta: number) {
    this.#saveOrder(index, index + delta);
  }

  async #saveOrder(from: number, to: number) {
    const reordered = [...this.wishes()];
    moveItemInArray(reordered, from, to);
    this.wishes.set(reordered);
    try {
      await firstValueFrom(this.#http.put(`/api/wishlists/${this.id()}/wishes/order`, reordered.map((w) => w.id)));
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
      this.#refresh();
    }
  }

  protected refresh() {
    this.#refresh();
  }

  #refresh() {
    this.#version.update((v) => v + 1);
  }

  async #run(request: Promise<unknown>) {
    try {
      await request;
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    }
    this.#refresh();
  }
}
