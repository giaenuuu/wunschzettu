import { DatePipe } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Availability, SharedList, WishAvailability } from '../../core/api';
import { Auth } from '../../core/auth';
import { problemMessage } from '../../core/problems';
import { lastValue } from '../../shared/last-value';
import { paletteClass } from '../../shared/palettes';
import { RelativeDayPipe } from '../../shared/relative-day.pipe';
import { WishCard } from '../../shared/wish-card';
import { UiButton } from '../../ui/button';
import { UiEmpty, UiSkeleton } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { GiftStatus } from './gift-status';

/** The page behind the shared link. Visible without login (ARCHITECTURE §5). */
@Component({
  selector: 'app-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, RelativeDayPipe, UiButton, UiIcon, UiEmpty, UiSkeleton, UiSegmented, WishCard, GiftStatus],
  template: `
    @if (list.hasValue()) {
      @let l = list.value();
      <div [class]="paletteClass(l.theme.palette)" class="min-h-[calc(100dvh-4rem)] bg-paper">
        <header class="relative overflow-hidden border-b border-line/60">
          <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_22rem_at_50%_-6rem,var(--color-accent-soft),transparent)]" aria-hidden="true"></div>
          <div class="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--color-accent-line)_1.2px,transparent_1.2px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true"></div>
          <div class="page relative flex flex-col items-center pt-10! pb-10! text-center">
            <span class="stamp size-24 animate-rise text-5xl sm:size-28 sm:text-6xl" aria-hidden="true">{{ l.theme.emoji || '🎁' }}</span>
            @if (l.recipientName) {
              <p class="mt-5 text-sm font-bold tracking-[0.2em] text-accent uppercase" i18n="@@view.for">Wunschliste für {{ l.recipientName }}</p>
            }
            <h1 class="display mt-2 max-w-3xl text-4xl break-words sm:text-6xl">{{ l.title }}</h1>
            @if (l.eventDate) {
              <p class="mt-4 inline-flex items-center gap-2 rounded-full bg-raised px-4 py-1.5 text-sm font-semibold shadow-sm">
                <ui-icon name="event" [size]="18" class="text-accent" />{{ l.eventDate | date: 'longDate' }} · {{ l.eventDate | relativeDay }}
              </p>
            }
            @if (l.description) {
              <p class="mt-5 max-w-[60ch] whitespace-pre-line text-ink-muted">{{ l.description }}</p>
            }
          </div>
        </header>

        <div class="page">
          @switch (l.viewerRole) {
            @case ('Recipient') {
              <div class="notice notice-accent mb-6 flex-wrap items-center">
                <ui-icon name="visibility_off" />
                <span class="min-w-48 flex-1" i18n="@@view.recipientBanner">Das ist deine Liste. Was schon verschenkt ist, siehst du nicht – damit die Überraschung bleibt.</span>
                <a uiButton size="sm" [routerLink]="['/lists', l.id, 'edit']" i18n="@@view.edit">Bearbeiten</a>
              </div>
            }
            @case ('Manager') {
              <div class="notice notice-accent mb-6 flex-wrap items-center">
                <ui-icon name="edit_note" />
                <span class="min-w-48 flex-1" i18n="@@view.managerBanner">Du verwaltest diese Liste. So sehen sie deine Gäste.</span>
                <a uiButton size="sm" [routerLink]="['/lists', l.id, 'edit']" i18n="@@view.edit">Bearbeiten</a>
              </div>
            }
            @default {
              @if (!auth.loggedIn()) {
                <ol class="mb-8 grid gap-3 sm:grid-cols-3" i18n-aria-label="@@view.howTitle" aria-label="So funktioniert's">
                  @for (s of howSteps; track s.icon; let i = $index) {
                    <li class="flex items-center gap-3 rounded-2xl bg-sunken/70 p-3 text-sm">
                      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><ui-icon [name]="s.icon" [size]="18" /></span>
                      <span>{{ s.text }}</span>
                    </li>
                  }
                </ol>
              }
            }
          }

          @if (availability.error() && l.viewerRole !== 'Recipient') {
            <p class="notice notice-warn mb-6 items-center" role="alert">
              <ui-icon name="error" />
              <span class="flex-1"><ng-container i18n="@@view.availabilityFailed">Was schon vergeben ist, konnten wir nicht laden.</ng-container> {{ problemMessage(availability.error()) }}</span>
              <button uiButton variant="ghost" size="sm" (click)="refresh()" i18n="@@common.retry">Nochmals versuchen</button>
            </p>
          }

          @if (l.wishes.length) {
            <div class="mb-5 flex flex-wrap items-center gap-3">
              <h2 class="section-title flex-1" i18n="@@view.wishesTitle">Wünsche</h2>
              @if (isGuestView()) {
                <ui-segmented class="w-full sm:w-auto sm:shrink-0" [wide]="true" [options]="filters()" [(value)]="onlyFree" i18n-label="@@view.filter" label="Filter" />
              }
            </div>
            <div class="grid items-start gap-5" [class]="l.theme.layout === 'List' ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'">
              @for (wish of visibleWishes(); track wish.id; let i = $index) {
                @let a = byWish().get(wish.id);
                <app-wish-card class="animate-rise" [style.animation-delay.ms]="i * 40" [wish]="wish" [currency]="l.currency" [dimmed]="isTakenByOthers(a)" [stamp]="isTakenByOthers(a) ? takenLabel : null" [wide]="l.theme.layout === 'List'">
                  @if (l.viewerRole !== 'Recipient' && a) {
                    <app-gift-status cardStatus [wish]="wish" [availability]="a" [token]="token()" [currency]="l.currency"
                      [recipientName]="l.recipientName" [interactive]="l.viewerRole === 'Guest'" (changed)="refresh()" />
                  }
                </app-wish-card>
              }
            </div>
            @if (visibleWishes().length === 0) {
              <ui-empty emoji="🎉" i18n-title="@@view.allTakenTitle" title="Alles vergeben!">
                <span i18n="@@view.allTaken">Schau ruhig später nochmals vorbei.</span>
              </ui-empty>
            }
          } @else {
            <ui-empty emoji="🌱" i18n-title="@@view.emptyTitle" title="Noch keine Wünsche">
              <span i18n="@@view.empty">Hier gibt es noch nichts zu sehen. Schau bald wieder vorbei.</span>
            </ui-empty>
          }

          @if (current()?.removedWishes?.length) {
            <h2 class="section-title mt-12 mb-1" i18n="@@view.removedTitle">Nicht mehr nötig</h2>
            <p class="mb-4 text-ink-muted" i18n="@@view.removedIntro">Diese Wünsche wurden von der Liste genommen. Du hattest sie gewählt – zieh deine Reservation zurück, wenn du sie nicht mehr brauchst.</p>
            <div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
              @for (r of current()!.removedWishes; track r.wish.id) {
                <app-wish-card [wish]="r.wish" [currency]="l.currency" [dimmed]="true" [stamp]="notNeededLabel" stampIcon="block">
                  <app-gift-status cardStatus [wish]="r.wish" [removedGifts]="r.mine" [token]="token()" [currency]="l.currency" (changed)="refresh()" />
                </app-wish-card>
              }
            </div>
          }

          @if (l.viewerRole === 'Guest' && !auth.loggedIn()) {
            <aside class="mt-16 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-line p-8 text-center">
              <span class="text-4xl" aria-hidden="true">✨</span>
              <strong class="display text-xl" i18n="@@view.ownTitle">Selbst eine Wunschliste?</strong>
              <p class="max-w-md text-ink-muted" i18n="@@view.ownText">Kostenlos, ohne Passwort, in einer Minute erstellt.</p>
              <a uiButton variant="secondary" routerLink="/" i18n="@@view.ownCta">Mehr erfahren</a>
            </aside>
          }
        </div>
      </div>
    } @else if (list.error() && !isNotFound()) {
      <div class="page page-narrow pt-16">
        <ui-empty emoji="📡" i18n-title="@@view.loadFailedTitle" title="Die Liste lädt gerade nicht">
          <span>{{ problemMessage(list.error()) }}</span>
          <button uiEmptyAction uiButton variant="secondary" (click)="list.reload()" i18n="@@common.retry">Nochmals versuchen</button>
        </ui-empty>
      </div>
    } @else if (list.error()) {
      <div class="page page-narrow pt-16">
        <ui-empty emoji="🔍" i18n-title="@@view.notFoundTitle" title="Diese Liste gibt es nicht (mehr)">
          <span i18n="@@view.notFound">Vielleicht wurde der Link erneuert, oder die Liste ist nur für eingeladene Personen. Frag am besten bei der Person nach, die ihn geschickt hat.</span>
          @if (!auth.loggedIn()) {
            <a uiEmptyAction uiButton variant="secondary" routerLink="/login" [queryParams]="{ returnUrl: '/l/' + token() }" i18n="@@view.loginToSee">Anmelden</a>
          }
        </ui-empty>
      </div>
    } @else {
      <div class="page flex flex-col items-center gap-4 pt-12" role="status" i18n-aria-label="@@common.loading" aria-label="Lädt …">
        <ui-skeleton class="size-24 rounded-3xl" />
        <ui-skeleton class="h-10 w-2/3 max-w-md" />
        <div class="mt-8 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ui-skeleton class="h-72" /><ui-skeleton class="hidden h-72 sm:block" /><ui-skeleton class="hidden h-72 lg:block" />
        </div>
      </div>
    }
  `,
})
export class ListView {
  readonly token = input.required<string>();
  protected readonly auth = inject(Auth);
  protected readonly paletteClass = paletteClass;
  protected readonly problemMessage = problemMessage;
  protected readonly onlyFree = signal(false);
  protected readonly takenLabel = $localize`:@@wish.stampTaken:Vergeben`;
  protected readonly notNeededLabel = $localize`:@@gift.notNeeded:nicht mehr nötig`;

  protected readonly howSteps = [
    { icon: 'touch_app', text: $localize`:@@view.how1:Wunsch aussuchen und «Ich schenke das» tippen.` },
    { icon: 'badge', text: $localize`:@@view.how2:Name und E-Mail angeben – kein Konto, kein Passwort.` },
    { icon: 'visibility_off', text: $localize`:@@view.how3:Alle sehen, dass er vergeben ist – nur die beschenkte Person nicht.` },
  ];

  protected readonly list = httpResource<SharedList>(() => `/api/shared/${this.token()}`);
  /**
   * Bumped after every gift action. Unlike `reload()`, which does nothing while a request is in flight,
   * a new request replaces the running one, so a stale answer (e.g. from signing in) never wins.
   */
  readonly #version = signal(0);
  /** Never requested for recipients: they must not learn anything about gifts (§6). */
  protected readonly availability = httpResource<Availability>(() => {
    if (!this.list.hasValue() || this.list.value().viewerRole === 'Recipient') return undefined;
    this.auth.user(); // re-fetch when the signed-in user changes, e.g. right after identifying
    this.#version();
    return { url: `/api/shared/${this.token()}/availability` };
  });

  protected refresh() {
    this.#version.update((v) => v + 1);
  }

  /** The last loaded availability, kept while a reload is in flight: cards (and their open dialogs) must not vanish. */
  protected readonly current = lastValue(this.availability);
  protected readonly byWish = computed(() => new Map((this.current()?.wishes ?? []).map((a) => [a.wishId, a])));
  protected readonly isGuestView = computed(() => this.list.value()?.viewerRole === 'Guest' && !!this.current());
  protected readonly freeCount = computed(() => (this.list.value()?.wishes ?? []).filter((w) => this.#isFree(w.id)).length);
  /** Free wishes first, so guests don't scroll past taken ones. Recipients get no availability, so their order never changes. */
  protected readonly visibleWishes = computed(() => {
    const wishes = this.list.value()?.wishes ?? [];
    if (this.onlyFree()) return wishes.filter((w) => this.#isFree(w.id));
    const taken = (id: string) => (this.isTakenByOthers(this.byWish().get(id)) ? 1 : 0);
    return [...wishes].sort((a, b) => taken(a.id) - taken(b.id));
  });
  protected readonly isNotFound = computed(() => {
    const error = this.list.error();
    return error instanceof HttpErrorResponse ? error.status === 404 || error.status === 403 : false;
  });
  protected readonly filters = computed<SegmentOption<boolean>[]>(() => [
    { value: false, label: $localize`:@@view.all:Alle (${this.list.value()?.wishes.length ?? 0}:count:)` },
    { value: true, label: $localize`:@@view.free:Noch frei (${this.freeCount()}:count:)` },
  ]);

  protected isTakenByOthers(a: WishAvailability | undefined) {
    return !!a && a.available === 0 && !a.openGroup && a.mine.length === 0;
  }

  #isFree(wishId: string) {
    const a = this.byWish().get(wishId);
    return !a || a.mine.length > 0 || a.available !== 0 || !!a.openGroup;
  }
}
