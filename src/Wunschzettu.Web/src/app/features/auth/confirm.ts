import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { problemMessage } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { Toaster } from '../../ui/toaster';
import { AuthCard } from './auth-card';
import { safeReturnUrl } from './return-url';

/** Target of every mail link. Posts the token (a GET with side effects would be "clicked" by mail scanners). */
@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, AuthCard],
  template: `
    <app-auth-card [emoji]="error() ? '🙈' : '✨'">
      @if (error(); as message) {
        <h1 class="display text-3xl" i18n="@@confirm.failedTitle">Das hat nicht geklappt</h1>
        <p class="text-ink-muted">{{ message }}</p>
        <a uiButton size="lg" [wide]="true" routerLink="/login" [queryParams]="{ returnUrl: target() }" i18n="@@confirm.loginInstead">Mit Code anmelden</a>
      } @else {
        <span class="size-10 animate-spin rounded-full border-4 border-accent border-r-transparent" aria-hidden="true"></span>
        <p class="text-ink-muted" role="status" i18n="@@confirm.working">Einen Moment …</p>
      }
    </app-auth-card>
  `,
})
export class Confirm implements OnInit {
  readonly token = input<string>();
  readonly returnUrl = input<string>();
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);
  readonly #toaster = inject(Toaster);
  protected readonly error = signal<string | null>(null);

  protected target() {
    return safeReturnUrl(this.returnUrl());
  }

  async ngOnInit() {
    try {
      await this.#auth.confirm(this.token() ?? '');
      this.#toaster.show($localize`:@@confirm.done:Danke! Deine E-Mail-Adresse ist bestätigt.`, { tone: 'success' });
      await this.#router.navigateByUrl(this.target(), { replaceUrl: true });
    } catch (e) {
      this.error.set(problemMessage(e));
    }
  }
}
