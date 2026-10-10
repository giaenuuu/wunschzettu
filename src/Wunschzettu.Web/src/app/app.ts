import { CdkMenu, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { ColorScheme, Scheme } from './core/color-scheme';
import { Language, chosenLanguage, switchLanguage } from './core/language';
import { Pwa } from './core/pwa';
import { Logo } from './shared/logo';
import { UiButton } from './ui/button';
import { UiIcon } from './ui/icon';
import { UiToaster } from './ui/toaster';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:submit)': 'focusFirstInvalid($event)' },
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CdkMenu, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger, UiButton, UiIcon, UiToaster, Logo],
  template: `
    <a href="#main" class="sr-only z-50 rounded-full bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3" i18n="@@app.skip">
      Zum Inhalt springen
    </a>
    <header class="sticky top-0 z-40 border-b border-line/70 bg-paper/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div class="mx-auto flex h-16 max-w-[68rem] items-center gap-2 px-4 sm:px-6">
        <a routerLink="/" class="mr-auto flex items-center gap-2.5 rounded-xl text-ink no-underline" aria-label="Wunschzettu – Start">
          <app-logo class="size-9" />
          <span class="display text-[1.375rem]">Wunschzettu</span>
        </a>

        @if (auth.user(); as user) {
          <a
            uiButton
            variant="ghost"
            size="sm"
            routerLink="/"
            routerLinkActive="bg-sunken"
            [routerLinkActiveOptions]="{ exact: true }"
            class="max-sm:hidden!"
          >
            <ui-icon name="dashboard" [size]="18" /><span i18n="@@nav.overview">Übersicht</span>
          </a>
          <button
            type="button"
            [cdkMenuTriggerFor]="menu"
            class="grid size-10 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[0.9375rem] font-bold text-white shadow-sm ring-2 ring-paper transition-transform hover:scale-105"
            i18n-aria-label="@@app.account"
            aria-label="Konto und Einstellungen"
          >
            {{ initial() }}
          </button>
        } @else {
          <button uiButton variant="ghost" size="sm" [iconOnly]="true" [cdkMenuTriggerFor]="menu" i18n-aria-label="@@app.settings" aria-label="Einstellungen">
            <ui-icon name="tune" />
          </button>
          <a uiButton variant="secondary" size="sm" routerLink="/login" i18n="@@app.login">Anmelden</a>
        }
      </div>
    </header>

    <ng-template #menu>
      <div cdkMenu class="menu">
        @if (auth.user(); as user) {
          <div class="flex flex-col px-3 pt-2 pb-2.5">
            <strong class="truncate">{{ user.displayName || user.email }}</strong>
            <span class="truncate text-sm text-ink-muted">{{ user.email }}</span>
          </div>
          <div class="menu-separator"></div>
          <a cdkMenuItem class="menu-item" routerLink="/"><ui-icon name="dashboard" /><span i18n="@@nav.overview">Übersicht</span></a>
          <a cdkMenuItem class="menu-item" routerLink="/profile"><ui-icon name="person" /><span i18n="@@app.profile">Profil &amp; Sicherheit</span></a>
        }
        @if (!pwa.installed()) {
          <a cdkMenuItem class="menu-item" routerLink="/app"><ui-icon name="mobile_arrow_down" /><span i18n="@@app.install">App installieren</span></a>
        }
        <button cdkMenuItem class="menu-item" [cdkMenuTriggerFor]="schemeMenu">
          <ui-icon name="contrast" /><span class="flex-1" i18n="@@app.appearance">Darstellung</span><ui-icon name="chevron_right" [size]="18" />
        </button>
        <button cdkMenuItem class="menu-item" [cdkMenuTriggerFor]="languageMenu">
          <ui-icon name="translate" /><span class="flex-1" i18n="@@app.language">Sprache</span><ui-icon name="chevron_right" [size]="18" />
        </button>
        @if (auth.loggedIn()) {
          <div class="menu-separator"></div>
          <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="logout()"><ui-icon name="logout" /><span i18n="@@app.logout">Abmelden</span></button>
        }
      </div>
    </ng-template>

    <ng-template #schemeMenu>
      <div cdkMenu class="menu min-w-48">
        @for (s of schemes; track s.value) {
          <button cdkMenuItemRadio class="menu-item" [cdkMenuItemChecked]="colorScheme.scheme() === s.value" (cdkMenuItemTriggered)="colorScheme.set(s.value)">
            <ui-icon [name]="s.icon" /><span class="flex-1">{{ s.label }}</span>
            @if (colorScheme.scheme() === s.value) { <ui-icon name="check" [size]="18" /> }
          </button>
        }
      </div>
    </ng-template>

    <ng-template #languageMenu>
      <div cdkMenu class="menu min-w-48">
        @for (l of languages; track l.code) {
          <button cdkMenuItemRadio class="menu-item" [cdkMenuItemChecked]="language === l.code" (cdkMenuItemTriggered)="setLanguage(l.code)" [attr.lang]="l.code">
            <span class="w-5 text-center text-lg" aria-hidden="true">{{ l.flag }}</span><span class="flex-1">{{ l.label }}</span>
            @if (language === l.code) { <ui-icon name="check" [size]="18" /> }
          </button>
        }
      </div>
    </ng-template>

    <main id="main" tabindex="-1" class="outline-none"><router-outlet /></main>

    <footer class="border-t border-line/70 pb-safe">
      <div class="mx-auto flex max-w-[68rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-sm text-ink-muted sm:px-6">
        <span class="flex items-center gap-2"><app-logo class="size-5" /> Wunschzettu</span>
        <span class="mr-auto" i18n="@@footer.tagline">Wünsche teilen, Überraschungen bewahren.</span>
        @if (!pwa.installed()) {
          <a routerLink="/app" class="font-medium text-ink-muted underline-offset-4 hover:text-accent hover:underline" i18n="@@app.install">App installieren</a>
        }
        <a routerLink="/" fragment="faq" class="font-medium text-ink-muted underline-offset-4 hover:text-accent hover:underline" i18n="@@footer.faq">Fragen &amp; Antworten</a>
      </div>
    </footer>

    <ui-toaster />
  `,
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly colorScheme = inject(ColorScheme);
  protected readonly pwa = inject(Pwa);
  readonly #router = inject(Router);

  protected readonly initial = computed(() => {
    const u = this.auth.user();
    return (u?.displayName || u?.email || '?').trim().charAt(0).toUpperCase();
  });
  protected readonly language = chosenLanguage();
  protected readonly languages: { code: Language; label: string; flag: string }[] = [
    { code: 'de-CH', label: 'Deutsch', flag: '🇨🇭' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];
  protected readonly schemes: { value: Scheme; label: string; icon: string }[] = [
    { value: 'system', label: $localize`:@@scheme.system:Wie das Gerät`, icon: 'routine' },
    { value: 'light', label: $localize`:@@scheme.light:Hell`, icon: 'light_mode' },
    { value: 'dark', label: $localize`:@@scheme.dark:Dunkel`, icon: 'dark_mode' },
  ];

  constructor() {
    this.pwa.watchForUpdates();
  }

  /** After a submit with errors, move to the first one: in long forms and dialogs it may be out of view. */
  protected focusFirstInvalid(event: Event) {
    const form = event.target as HTMLFormElement;
    // Wait until the form has marked its fields as touched and rendered the messages.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
        invalid?.focus({ preventScroll: true });
        invalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }),
    );
  }

  protected async setLanguage(lang: Language) {
    if (lang === this.language) return;
    // Mails follow the account's language, so keep it in sync with the UI.
    const user = this.auth.user();
    if (user?.emailConfirmed) await this.auth.updateProfile(user.displayName || user.email.split('@')[0], lang).catch(() => undefined);
    switchLanguage(lang);
  }

  protected async logout() {
    await this.auth.logout();
    await this.#router.navigateByUrl('/');
  }
}
