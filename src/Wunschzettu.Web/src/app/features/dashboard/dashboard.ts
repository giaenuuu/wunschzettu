import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dashboard as DashboardDto, MyGiftSummary, WishlistDetail } from '../../core/api';
import { Auth } from '../../core/auth';
import { paletteClass } from '../../shared/palettes';
import { RelativeDayPipe } from '../../shared/relative-day.pipe';
import { UiButton } from '../../ui/button';
import { Dialogs } from '../../ui/dialog';
import { UiEmpty, UiSkeleton } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { CreateListDialog } from './create-list-dialog';

/**
 * "Übersicht": everything that concerns me in one place. My own lists, what I give to others,
 * and lists others shared with me.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, RelativeDayPipe, UiButton, UiIcon, UiEmpty, UiSkeleton],
  template: `
    <div class="page">
      <header class="mb-8 flex flex-wrap items-end gap-4 pt-2">
        <div class="min-w-0 flex-1">
          <p class="mb-1 text-sm font-semibold tracking-wide text-accent uppercase" i18n="@@nav.overview">Übersicht</p>
          <h1 class="display text-4xl sm:text-5xl">
            @if (firstName(); as name) {
              <ng-container i18n="@@dashboard.hello">Hallo {{ name }}</ng-container> <span class="inline-block origin-[70%_70%] motion-safe:animate-[wave_1.6s_ease-in-out_1]">👋</span>
            } @else {
              <ng-container i18n="@@dashboard.helloAnonymous">Schön, bist du da</ng-container>
            }
          </h1>
          @if (dashboard.value(); as d) {
            <p class="mt-2 text-ink-muted">
              <span i18n="@@dashboard.summaryLists">{d.mine.length, plural, =0 {Noch keine eigene Liste} =1 {1 eigene Liste} other {{{d.mine.length}} eigene Listen}}</span> ·
              <span i18n="@@dashboard.summaryGifts">{d.myGifts.length, plural, =0 {nichts in Planung} =1 {1 Geschenk in Planung} other {{{d.myGifts.length}} Geschenke in Planung}}</span>
            </p>
          }
        </div>
        <button uiButton (click)="create()"><ui-icon name="add" /><span i18n="@@dashboard.newList">Neue Liste</span></button>
      </header>

      @if (!auth.confirmed()) {
        <a class="notice notice-warn mb-8 items-center no-underline" routerLink="/login" [queryParams]="{ returnUrl: '/' }">
          <ui-icon name="mark_email_unread" />
          <span class="flex-1" i18n="@@dashboard.unconfirmed">Bitte bestätige deine E-Mail-Adresse – sonst werden deine Reservationen nach 7 Tagen wieder freigegeben.</span>
          <ui-icon name="chevron_right" />
        </a>
      }

      @if (dashboard.hasValue()) {
        @let d = dashboard.value();

        <section aria-labelledby="mine-title" class="mb-12">
          <h2 id="mine-title" class="section-title mb-4 flex items-center gap-2">
            <span i18n="@@dashboard.myLists">Meine Wunschlisten</span>
            @if (d.mine.length) { <span class="chip">{{ d.mine.length }}</span> }
          </h2>
          @if (d.mine.length === 0) {
            <ui-empty emoji="📝" i18n-title="@@dashboard.emptyTitle" title="Noch keine eigene Wunschliste">
              <span i18n="@@dashboard.empty">Für deinen Geburtstag, Weihnachten oder die Kinder – in einer Minute erstellt.</span>
              <button uiEmptyAction uiButton (click)="create()" i18n="@@dashboard.createFirst">Erste Liste erstellen</button>
            </ui-empty>
          } @else {
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (list of d.mine; track list.id; let i = $index) {
                <a
                  [routerLink]="['/lists', list.id, 'edit']"
                  class="card card-link group flex animate-rise flex-col gap-4 p-5 text-ink no-underline"
                  [class]="paletteClass(list.theme.palette)"
                  [style.animation-delay.ms]="i * 50"
                >
                  <div class="flex items-start gap-4">
                    <span class="stamp size-16 text-3xl transition-transform duration-300 group-hover:-rotate-6" aria-hidden="true">{{ list.theme.emoji || '🎁' }}</span>
                    <span class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                      <strong class="display line-clamp-2 text-xl leading-tight">{{ list.title }}</strong>
                      <span class="text-sm text-ink-muted">
                        @if (list.isRecipient) {
                          <ng-container i18n="@@dashboard.forMe">für mich</ng-container>
                        } @else if (list.recipientName) {
                          <ng-container i18n="@@dashboard.for">für {{ list.recipientName }}</ng-container>
                        }
                      </span>
                    </span>
                  </div>
                  <span class="mt-auto flex items-center gap-2 text-sm">
                    <span class="chip chip-accent"><ui-icon name="redeem" [size]="15" />
                      <span i18n="@@dashboard.wishCount">{list.wishCount, plural, =0 {keine Wünsche} =1 {1 Wunsch} other {{{list.wishCount}} Wünsche}}</span></span>
                    @if (list.eventDate) {
                      <span class="chip" [title]="list.eventDate | date: 'longDate'"><ui-icon name="event" [size]="15" />{{ list.eventDate | relativeDay }}</span>
                    }
                  </span>
                </a>
              }
              <button
                type="button"
                (click)="create()"
                class="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line-strong text-ink-muted transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
              >
                <ui-icon name="add_circle" [size]="32" />
                <span class="font-semibold" i18n="@@dashboard.newList">Neue Liste</span>
              </button>
            </div>
          }
        </section>

        <section aria-labelledby="gifts-title" class="mb-12">
          <h2 id="gifts-title" class="section-title mb-1 flex items-center gap-2">
            <span i18n="@@dashboard.myGifts">Was ich verschenke</span>
            @if (d.myGifts.length) { <span class="chip">{{ d.myGifts.length }}</span> }
          </h2>
          <p class="mb-4 text-sm text-ink-muted" i18n="@@dashboard.myGiftsHint">Wünsche anderer, die du reserviert hast oder bei denen du mitschenkst.</p>
          @if (d.myGifts.length === 0) {
            <p class="notice" i18n="@@dashboard.noGifts">Noch nichts. Sobald du auf einer geteilten Liste «Ich schenke das» wählst, erscheint es hier.</p>
          } @else {
            <ul class="flex flex-col gap-2.5">
              @for (g of d.myGifts; track g.giftId) {
                <li>
                  <a class="card card-link flex items-center gap-4 p-3.5 pr-4 text-ink no-underline" [routerLink]="['/l', g.shareToken]" [class]="paletteClass(g.theme.palette)">
                    <span class="stamp size-12 text-2xl [--stamp-r:4px]" aria-hidden="true">{{ g.theme.emoji || '🎁' }}</span>
                    <span class="flex min-w-0 flex-1 flex-col">
                      <strong class="truncate">{{ g.wishName }}</strong>
                      <span class="truncate text-sm text-ink-muted">
                        {{ g.listTitle }}@if (g.eventDate) { · {{ g.eventDate | relativeDay }} }
                      </span>
                    </span>
                    <span class="flex flex-wrap justify-end gap-1.5">
                      @for (c of giftChips(g); track c.label) {
                        <span class="chip" [class]="c.tone"><ui-icon [name]="c.icon" [size]="15" />{{ c.label }}</span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        @if (d.sharedWithMe.length) {
          <section aria-labelledby="shared-title">
            <h2 id="shared-title" class="section-title mb-4 flex items-center gap-2">
              <span i18n="@@dashboard.shared">Listen von anderen</span>
              <span class="chip">{{ d.sharedWithMe.length }}</span>
            </h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (list of d.sharedWithMe; track list.id) {
                <a [routerLink]="['/l', list.shareToken]" class="card card-link flex items-center gap-4 p-4 text-ink no-underline" [class]="paletteClass(list.theme.palette)">
                  <span class="stamp size-12 text-2xl [--stamp-r:4px]" aria-hidden="true">{{ list.theme.emoji || '🎁' }}</span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <strong class="truncate">{{ list.title }}</strong>
                    <span class="truncate text-sm text-ink-muted">
                      @if (list.recipientName) {
                        <ng-container i18n="@@dashboard.for">für {{ list.recipientName }}</ng-container>
                      }
                      @if (list.eventDate) { · {{ list.eventDate | relativeDay }} }
                    </span>
                  </span>
                  <ui-icon name="chevron_right" class="text-ink-muted" />
                </a>
              }
            </div>
          </section>
        }
      } @else if (dashboard.error()) {
        <ui-empty emoji="📡" i18n-title="@@common.loadErrorTitle" title="Laden fehlgeschlagen">
          <span i18n="@@common.loadError">Prüfe deine Verbindung und versuch es nochmals.</span>
          <button uiEmptyAction uiButton variant="secondary" (click)="dashboard.reload()" i18n="@@common.retry">Nochmals versuchen</button>
        </ui-empty>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" i18n-aria-label="@@common.loading" aria-label="Lädt …">
          <ui-skeleton class="h-40" /><ui-skeleton class="h-40" /><ui-skeleton class="hidden h-40 lg:block" />
        </div>
      }
    </div>
  `,
})
export class Dashboard {
  protected readonly auth = inject(Auth);
  readonly #dialogs = inject(Dialogs);
  readonly #router = inject(Router);
  protected readonly dashboard = httpResource<DashboardDto>(() => '/api/wishlists');
  protected readonly paletteClass = paletteClass;
  protected readonly firstName = computed(() => this.auth.user()?.displayName?.split(' ')[0] ?? '');

  protected giftChips(g: MyGiftSummary): { label: string; icon: string; tone: string }[] {
    const chips: { label: string; icon: string; tone: string }[] = [];
    if (g.wishState === 'Removed') chips.push({ label: $localize`:@@gift.notNeeded:nicht mehr nötig`, icon: 'block', tone: '' });
    else if (g.wishState === 'Fulfilled') chips.push({ label: $localize`:@@gift.alreadyFulfilled:schon erfüllt`, icon: 'task_alt', tone: '' });
    if (g.unconfirmed) chips.push({ label: $localize`:@@gift.unconfirmed:unbestätigt`, icon: 'schedule', tone: 'chip-warn' });
    if (g.isGroup) chips.push({ label: `${g.participantCount}`, icon: 'groups', tone: 'chip-accent' });
    if (g.status === 'Bought') chips.push({ label: $localize`:@@gift.bought:gekauft`, icon: 'check', tone: 'chip-success' });
    return chips;
  }

  protected create() {
    // Creating lists needs a confirmed email (§5.6): confirm first, then come back.
    if (!this.auth.confirmed()) {
      this.#router.navigate(['/login'], { queryParams: { returnUrl: '/' } });
      return;
    }
    this.#dialogs
      .open<CreateListDialog, void, WishlistDetail>(CreateListDialog)
      .closed.subscribe((list) => list && this.#router.navigate(['/lists', list.id, 'edit']));
  }
}
