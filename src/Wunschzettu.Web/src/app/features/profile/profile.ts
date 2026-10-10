import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, minLength, required, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { chosenLanguage, Language, switchLanguage } from '../../core/language';
import { problemMessage } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { Confirmer } from '../../ui/confirm';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { Toaster } from '../../ui/toaster';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, RouterLink, UiButton, UiControl, UiField, UiIcon, UiSegmented],
  template: `
    <div class="page page-narrow">
      <h1 class="display mb-6 text-4xl" i18n="@@profile.title">Profil &amp; Sicherheit</h1>

      @if (auth.user(); as user) {
        <section class="card mb-6 flex items-center gap-4 p-5">
          <span class="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-2xl font-bold text-white" aria-hidden="true">
            {{ (user.displayName || user.email).charAt(0).toUpperCase() }}
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <strong class="truncate">{{ user.displayName || user.email }}</strong>
            <span class="truncate text-sm text-ink-muted">{{ user.email }}</span>
          </div>
          @if (user.emailConfirmed) {
            <span class="chip chip-success"><ui-icon name="verified" [size]="15" /><span i18n="@@profile.confirmed">bestätigt</span></span>
          } @else {
            <a class="chip chip-warn no-underline" routerLink="/login" [queryParams]="{ returnUrl: '/profile' }" i18n="@@profile.confirmNow">jetzt bestätigen</a>
          }
        </section>
      }
      @if (!auth.confirmed()) {
        <p class="notice notice-warn mb-6" i18n="@@profile.confirmFirst">Bestätige zuerst deine E-Mail-Adresse, dann kannst du Name, Sprache und Passwort ändern.</p>
      }

      <section class="card mb-6 p-5 sm:p-6" aria-labelledby="profile-about">
        <h2 id="profile-about" class="section-title mb-5" i18n="@@profile.about">Über dich</h2>
        <form [formRoot]="form" class="flex flex-col gap-5">
          <ui-field i18n-label="@@profile.name" label="Name" i18n-hint="@@profile.nameHint" hint="So sehen dich die anderen, wenn ihr gemeinsam schenkt.">
            <input uiControl autocomplete="name" [formField]="form.displayName" />
          </ui-field>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-semibold" i18n="@@profile.language">Sprache (auch für Mails)</span>
            <ui-segmented [formField]="form.language" [options]="languages" i18n-label="@@profile.language" label="Sprache (auch für Mails)" />
          </div>
          <button uiButton type="submit" class="self-start" [busy]="form().submitting()" [disabled]="!auth.confirmed()" i18n="@@common.save">Speichern</button>
        </form>
      </section>

      <section class="card p-5 sm:p-6" aria-labelledby="profile-password">
        <h2 id="profile-password" class="section-title mb-2 flex items-center gap-2"><ui-icon name="key" /><span i18n="@@profile.passwordTitle">Passwort</span></h2>
        @if (auth.user()?.hasPassword) {
          <p class="mb-5 text-ink-muted" i18n="@@profile.passwordSet">Du kannst dich mit Passwort oder mit einem Code per Mail anmelden.</p>
        } @else {
          <p class="mb-5 text-ink-muted" i18n="@@profile.passwordNone">Freiwillig: Mit einem Passwort meldest du dich ohne Mail an. Der Code per Mail funktioniert immer weiter.</p>
        }
        <form [formRoot]="passwordForm" class="flex flex-col gap-4">
          <!-- lets password managers save the pair -->
          <input type="email" autocomplete="username" [value]="auth.user()?.email ?? ''" class="hidden" aria-hidden="true" tabindex="-1" readonly />
          <ui-field [label]="auth.user()?.hasPassword ? newPasswordLabel : passwordLabel" i18n-hint="@@profile.passwordHint" hint="Mindestens 8 Zeichen. Ein ganzer Satz ist am sichersten.">
            <input uiControl type="password" autocomplete="new-password" [formField]="passwordForm.password" />
          </ui-field>
          <ui-field i18n-label="@@profile.passwordRepeat" label="Passwort wiederholen">
            <input uiControl type="password" autocomplete="new-password" [formField]="passwordForm.repeat" />
          </ui-field>
          <div class="flex flex-wrap items-center gap-2">
            <button uiButton type="submit" [busy]="passwordForm().submitting()" [disabled]="!auth.confirmed()">
              @if (auth.user()?.hasPassword) { <span i18n="@@profile.changePassword">Passwort ändern</span> } @else { <span i18n="@@profile.setPassword">Passwort setzen</span> }
            </button>
            @if (auth.user()?.hasPassword) {
              <button uiButton variant="danger-ghost" type="button" (click)="removePassword()" i18n="@@profile.removePassword">Passwort entfernen</button>
            }
          </div>
        </form>
      </section>
    </div>
  `,
})
export class Profile {
  protected readonly auth = inject(Auth);
  readonly #toaster = inject(Toaster);
  readonly #confirm = inject(Confirmer);

  protected readonly passwordLabel = $localize`:@@profile.password:Passwort`;
  protected readonly newPasswordLabel = $localize`:@@profile.newPassword:Neues Passwort`;
  protected readonly languages: SegmentOption<Language>[] = [
    { value: 'de-CH', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];

  protected readonly form = form(
    signal({ displayName: this.auth.user()?.displayName ?? '', language: (this.auth.user()?.language ?? 'de-CH') as Language }),
    (p) => {
      required(p.displayName);
      maxLength(p.displayName, 100);
    },
    {
      submission: {
        action: async (f) => {
          const { displayName, language } = f().value();
          try {
            await this.auth.updateProfile(displayName.trim(), language);
            if (language !== chosenLanguage()) switchLanguage(language);
            else this.#toaster.show($localize`:@@common.saved:Gespeichert`, { tone: 'success' });
          } catch (e) {
            this.#toaster.show(problemMessage(e), { tone: 'error' });
          }
        },
      },
    },
  );

  readonly #passwordModel = signal({ password: '', repeat: '' });
  protected readonly passwordForm = form(
    this.#passwordModel,
    (p) => {
      required(p.password);
      minLength(p.password, 8);
      maxLength(p.password, 128);
      required(p.repeat);
      validate(p.repeat, ({ value, valueOf }) =>
        value() && value() !== valueOf(p.password) ? { kind: 'mismatch', message: $localize`:@@profile.passwordMismatch:Die Passwörter stimmen nicht überein.` } : null,
      );
    },
    {
      submission: {
        action: async (f) => {
          const had = this.auth.user()?.hasPassword;
          try {
            await this.auth.setPassword(f().value().password);
            this.#passwordModel.set({ password: '', repeat: '' });
            this.passwordForm().reset();
            this.#toaster.show(had ? $localize`:@@profile.passwordChanged:Passwort geändert` : $localize`:@@profile.passwordSaved:Passwort gesetzt`, { tone: 'success' });
          } catch (e) {
            this.#toaster.show(problemMessage(e), { tone: 'error' });
          }
        },
      },
    },
  );

  protected async removePassword() {
    const ok = await this.#confirm.ask({
      title: $localize`:@@profile.removePasswordTitle:Passwort entfernen?`,
      message: $localize`:@@profile.removePasswordMessage:Du meldest dich danach wieder mit einem Code per Mail an.`,
      confirm: $localize`:@@profile.removePassword:Passwort entfernen`,
      danger: true,
    });
    if (!ok) return;
    try {
      await this.auth.removePassword();
      this.#toaster.show($localize`:@@profile.passwordRemoved:Passwort entfernt`, { tone: 'success' });
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    }
  }
}
