import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, FormRoot, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { problemMessage, problemType } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { AuthCard } from './auth-card';
import { safeReturnUrl } from './return-url';

type Method = 'code' | 'password';

/** Email → 6-digit code (the mail also has a one-tap link), or email + password for those who set one (ARCHITECTURE §5). */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, UiButton, UiControl, UiField, UiIcon, UiSegmented, AuthCard],
  template: `
    <app-auth-card [emoji]="step() === 'code' ? '📬' : '👋'">
      @if (step() === 'start') {
        <h1 class="display text-3xl" i18n="@@login.title">Willkommen!</h1>
        <p class="text-ink-muted" i18n="@@login.intro">Melde dich mit deiner E-Mail-Adresse an. Neu hier? Dann legen wir dein Konto gleich an.</p>

        <ui-segmented class="mt-2" [options]="methods" [(value)]="method" [wide]="true" i18n-label="@@login.method" label="Anmeldeart" />

        @if (method() === 'code') {
          <form [formRoot]="emailForm" class="flex flex-col gap-4 text-left">
            <ui-field i18n-label="@@login.email" label="E-Mail">
              <input uiControl type="email" autocomplete="email" inputmode="email" [formField]="emailForm.email" />
            </ui-field>
            <button uiButton type="submit" size="lg" [wide]="true" [busy]="emailForm().submitting()">
              <span i18n="@@login.sendCode">Code senden</span><ui-icon name="arrow_forward" />
            </button>
            <p class="text-center text-sm text-ink-muted" i18n="@@login.codeExplain">Wir schicken dir einen 6-stelligen Code. Kein Passwort nötig.</p>
          </form>
        } @else {
          <form [formRoot]="passwordForm" class="flex flex-col gap-4 text-left">
            <ui-field i18n-label="@@login.email" label="E-Mail">
              <input uiControl type="email" autocomplete="username" inputmode="email" [formField]="passwordForm.email" />
            </ui-field>
            <ui-field i18n-label="@@login.password" label="Passwort">
              <input uiControl [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" [formField]="passwordForm.password" />
              <button
                type="button"
                class="absolute inset-y-0 right-1.5 my-auto grid size-9 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-sunken"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-pressed]="showPassword()"
                i18n-aria-label="@@login.showPassword"
                aria-label="Passwort anzeigen"
              >
                <ui-icon [name]="showPassword() ? 'visibility_off' : 'visibility'" />
              </button>
            </ui-field>
            <button uiButton type="submit" size="lg" [wide]="true" [busy]="passwordForm().submitting()" i18n="@@login.submit">Anmelden</button>
            <p class="text-center text-sm text-ink-muted">
              <ng-container i18n="@@login.noPassword">Kein Passwort gesetzt oder vergessen?</ng-container>
              <button type="button" class="cursor-pointer font-semibold text-accent underline-offset-4 hover:underline" (click)="method.set('code')" i18n="@@login.useCode">Mit Code anmelden</button>
            </p>
          </form>
        }
      } @else {
        <h1 class="display text-3xl" i18n="@@login.codeTitle">Schau in deine Mailbox</h1>
        <p class="text-ink-muted" i18n="@@login.codeIntro">Wir haben einen Code an <strong class="text-ink">{{ emailModel().email }}</strong> geschickt. Gib ihn hier ein oder tippe in der Mail auf «Jetzt anmelden».</p>
        <form [formRoot]="codeForm" class="flex flex-col gap-4 text-left">
          <ui-field i18n-label="@@login.code" label="Code">
            <input uiControl class="control-code" autocomplete="one-time-code" inputmode="numeric" [formField]="codeForm.code" (input)="autoSubmit()" />
          </ui-field>
          <button uiButton type="submit" size="lg" [wide]="true" [busy]="codeForm().submitting()" i18n="@@login.submit">Anmelden</button>
        </form>
        <div class="flex flex-wrap justify-center gap-1">
          <button uiButton variant="ghost" size="sm" (click)="resend()" [disabled]="resent()">
            <ui-icon name="refresh" [size]="18" /><span i18n="@@login.resend">Code nochmals senden</span>
          </button>
          <button uiButton variant="ghost" size="sm" (click)="step.set('start')">
            <ui-icon name="edit" [size]="18" /><span i18n="@@login.otherEmail">Andere E-Mail</span>
          </button>
        </div>
      }
      @if (error()) {
        <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ error() }}</p>
      }
    </app-auth-card>
  `,
})
export class Login {
  readonly returnUrl = input<string>();
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);

  protected readonly step = signal<'start' | 'code'>('start');
  protected readonly method = signal<Method>('code');
  protected readonly error = signal<string | null>(null);
  protected readonly resent = signal(false);
  protected readonly showPassword = signal(false);

  protected readonly methods: SegmentOption<Method>[] = [
    { value: 'code', label: $localize`:@@login.methodCode:Code per Mail`, icon: 'mail' },
    { value: 'password', label: $localize`:@@login.methodPassword:Passwort`, icon: 'key' },
  ];

  /** Shared by both methods, so switching keeps the typed address. */
  protected readonly emailModel = signal({ email: '', password: '' });
  protected readonly emailForm = form(
    this.emailModel,
    (p) => {
      required(p.email);
      email(p.email);
    },
    {
      submission: {
        action: async (f) => {
          this.error.set(null);
          try {
            await this.#auth.requestCode(f().value().email.trim(), this.#target());
            this.step.set('code');
          } catch (e) {
            this.error.set(problemMessage(e));
          }
        },
      },
    },
  );

  protected readonly passwordForm = form(
    this.emailModel,
    (p) => {
      required(p.email);
      email(p.email);
      required(p.password);
    },
    {
      submission: {
        action: async (f) => {
          this.error.set(null);
          const { email, password } = f().value();
          try {
            await this.#auth.loginWithPassword(email.trim(), password);
            await this.#router.navigateByUrl(this.#target());
          } catch (e) {
            this.error.set(
              problemType(e) === 'invalid-login'
                ? $localize`:@@login.invalid:E-Mail oder Passwort stimmen nicht. Du kannst dich auch mit einem Code anmelden.`
                : problemMessage(e),
            );
          }
        },
      },
    },
  );

  protected readonly codeForm = form(
    signal({ code: '' }),
    (p) => {
      required(p.code);
      maxLength(p.code, 8);
      pattern(p.code, /^\s*\d{6}\s*$/);
    },
    {
      submission: {
        action: async (f) => {
          this.error.set(null);
          try {
            await this.#auth.verifyCode(this.emailModel().email.trim(), f().value().code.trim());
            await this.#router.navigateByUrl(this.#target());
          } catch (e) {
            this.error.set(problemMessage(e));
          }
        },
      },
    },
  );

  protected autoSubmit() {
    if (/^\d{6}$/.test(this.codeForm.code().value().trim()) && !this.codeForm().submitting()) submit(this.codeForm);
  }

  protected async resend() {
    this.resent.set(true);
    await this.#auth.requestCode(this.emailModel().email.trim(), this.#target()).catch((e) => this.error.set(problemMessage(e)));
  }

  #target() {
    return safeReturnUrl(this.returnUrl());
  }
}
