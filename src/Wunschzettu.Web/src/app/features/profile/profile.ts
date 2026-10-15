import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { form, FormField, FormRoot, maxLength, minLength, pattern, required, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { chosenLanguage, Language, languageOptions, switchLanguage } from '../../core/language';
import { problemMessage, problemType } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { Confirmer } from '../../ui/confirm';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { Toaster } from '../../ui/toaster';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, RouterLink, UiButton, UiControl, UiField, UiIcon],
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
          <ui-field i18n-label="@@profile.language" label="Sprache (auch für Mails)">
            <select uiControl [formField]="form.language">
              @for (l of languages; track l.code) {
                <option [value]="l.code">{{ l.label }}</option>
              }
            </select>
          </ui-field>
          <button uiButton type="submit" class="self-start" [busy]="form().submitting()" [disabled]="!auth.confirmed()" i18n="@@common.save">Speichern</button>
        </form>
      </section>

      <section class="card mb-6 p-5 sm:p-6" aria-labelledby="profile-security">
        <h2 id="profile-security" class="section-title mb-5 flex items-center gap-2"><ui-icon name="shield_lock" /><span i18n="@@profile.securityTitle">Sicherheit</span></h2>
        <h3 class="mb-1 flex items-center gap-2 font-bold"><ui-icon name="key" [size]="20" /><span i18n="@@profile.passwordTitle">Passwort</span></h3>
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

        <h3 class="mt-8 mb-1 flex items-center gap-2 border-t border-line pt-6 font-bold"><ui-icon name="devices" [size]="20" /><span i18n="@@profile.devicesTitle">Geräte</span></h3>
        <p class="mb-4 text-ink-muted" i18n="@@profile.devicesText">Handy verloren oder irgendwo angemeldet geblieben? Damit meldest du alle anderen Geräte ab. Dieses Gerät bleibt angemeldet.</p>
        <button uiButton variant="secondary" type="button" [busy]="loggingOut()" [disabled]="!auth.confirmed()" (click)="logoutEverywhere()">
          <ui-icon name="logout" /><span i18n="@@profile.logoutEverywhere">Andere Geräte abmelden</span>
        </button>
      </section>

      <section class="card mb-6 p-5 sm:p-6" aria-labelledby="profile-data">
        <h2 id="profile-data" class="section-title mb-2 flex items-center gap-2"><ui-icon name="download" /><span i18n="@@profile.dataTitle">Deine Daten</span></h2>
        <p class="mb-4 text-ink-muted" i18n="@@profile.dataText">Alles, was Wunschzettu über dich gespeichert hat – Konto, Listen, Wünsche und Geschenke – als Datei zum Herunterladen.</p>
        @if (auth.confirmed()) {
          <a uiButton variant="secondary" href="/api/auth/me/export" download><ui-icon name="download" /><span i18n="@@profile.export">Daten herunterladen</span></a>
        } @else {
          <button uiButton variant="secondary" type="button" [disabled]="true"><ui-icon name="download" /><span i18n="@@profile.export">Daten herunterladen</span></button>
        }
        <p class="mt-4 text-sm text-ink-muted">
          <a routerLink="/datenschutz" class="underline underline-offset-2 hover:text-accent" i18n="@@profile.privacyLink">Wie wir mit deinen Daten umgehen</a>
        </p>
      </section>

      <section class="card border-danger/40! p-5 sm:p-6" aria-labelledby="profile-delete">
        <h2 id="profile-delete" class="section-title mb-2 flex items-center gap-2 text-danger"><ui-icon name="delete_forever" /><span i18n="@@profile.deleteTitle">Konto löschen</span></h2>
        <p class="text-ink-muted" i18n="@@profile.deleteIntro">Das kann nicht rückgängig gemacht werden:</p>
        <ul class="mt-2 mb-5 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li i18n="@@profile.deleteLists">Listen, die nur du verwaltest, werden endgültig gelöscht – mit allen Wünschen, Bildern und den Geschenken, die andere darauf gewählt haben. Ist eine Liste für jemanden mit eigenem Konto, übernimmt diese Person sie stattdessen.</li>
          <li i18n="@@profile.deleteGifts">Deine Geschenke und Beteiligungen enden. Wer mit dir gemeinsam schenkt, wird benachrichtigt.</li>
          <li i18n="@@profile.deleteMemberships">Bei Listen, die andere mitverwalten, wirst du entfernt; die Listen bleiben.</li>
        </ul>
        @if (deleteStep() === 'code') {
          <form [formRoot]="deleteForm" class="flex flex-col gap-4">
            <p class="notice notice-warn" role="status" i18n="@@profile.deleteCodeSent">Wir haben dir einen Code geschickt. Gib ihn ein, um das Löschen zu bestätigen.</p>
            <ui-field i18n-label="@@login.code" label="Code">
              <input #deleteCode uiControl class="control-code" autocomplete="one-time-code" inputmode="numeric" [formField]="deleteForm.code" />
            </ui-field>
            @if (deleteError()) {
              <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ deleteError() }}</p>
            }
            <div class="flex flex-wrap gap-2">
              <button uiButton variant="danger" type="submit" [busy]="deleteForm().submitting()" i18n="@@profile.deleteForever">Konto endgültig löschen</button>
              <button uiButton variant="ghost" type="button" (click)="startDelete(false)" i18n="@@profile.deleteResend">Neuen Code senden</button>
              <button uiButton variant="ghost" type="button" (click)="deleteStep.set('idle')" i18n="@@common.cancel">Abbrechen</button>
            </div>
          </form>
        } @else {
          <button uiButton variant="danger" type="button" [busy]="requesting()" [disabled]="!auth.confirmed()" (click)="startDelete()" i18n="@@profile.deleteStart">Konto löschen …</button>
        }
      </section>
    </div>
  `,
})
export class Profile {
  protected readonly auth = inject(Auth);
  readonly #toaster = inject(Toaster);
  readonly #confirm = inject(Confirmer);
  readonly #router = inject(Router);
  protected readonly loggingOut = signal(false);
  protected readonly requesting = signal(false);
  protected readonly deleteStep = signal<'idle' | 'code'>('idle');
  private readonly deleteCode = viewChild<ElementRef<HTMLInputElement>>('deleteCode');

  protected readonly passwordLabel = $localize`:@@profile.password:Passwort`;
  protected readonly newPasswordLabel = $localize`:@@profile.newPassword:Neues Passwort`;
  protected readonly languages = languageOptions;

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
            // Inline, where the code is typed: a toast would cover the field on phones.
            this.deleteError.set(
              problemType(e) === 'invalid-code'
                ? $localize`:@@profile.deleteWrongCode:Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.`
                : problemMessage(e),
            );
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

  readonly #deleteModel = signal({ code: '' });
  protected readonly deleteError = signal<string | null>(null);
  protected readonly deleteForm = form(
    this.#deleteModel,
    (p) => {
      required(p.code);
      pattern(p.code, /^\s*\d{6}\s*$/);
    },
    {
      submission: {
        action: async (f) => {
          this.deleteError.set(null);
          try {
            await this.auth.deleteAccount(f().value().code.trim());
            await this.#router.navigateByUrl('/');
            this.#toaster.show($localize`:@@profile.deleted:Dein Konto ist gelöscht. Danke, dass du Wunschzettu genutzt hast.`, { tone: 'success', duration: 8000 });
          } catch (e) {
            this.#toaster.show(problemMessage(e), { tone: 'error' });
          }
        },
      },
    },
  );

  protected async startDelete(ask = true) {
    const ok = !ask || await this.#confirm.ask({
      title: $localize`:@@profile.deleteConfirmTitle:Konto wirklich löschen?`,
      message: $localize`:@@profile.deleteConfirmMessage:Zur Sicherheit schicken wir dir einen Code per Mail. Erst mit diesem Code wird das Konto gelöscht.`,
      confirm: $localize`:@@profile.deleteSendCode:Code senden`,
      danger: true,
    });
    if (!ok) return;
    this.requesting.set(true);
    this.deleteError.set(null);
    try {
      await this.auth.requestDeletionCode();
      this.#deleteModel.set({ code: '' });
      this.deleteForm().reset();
      this.deleteStep.set('code');
      setTimeout(() => this.deleteCode()?.nativeElement.focus());
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    } finally {
      this.requesting.set(false);
    }
  }

  protected async logoutEverywhere() {
    this.loggingOut.set(true);
    try {
      await this.auth.logoutEverywhere();
      this.#toaster.show($localize`:@@profile.loggedOutEverywhere:Alle anderen Geräte werden in den nächsten Minuten abgemeldet.`, { tone: 'success' });
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    } finally {
      this.loggingOut.set(false);
    }
  }

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
