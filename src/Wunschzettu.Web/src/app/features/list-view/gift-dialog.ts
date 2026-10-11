import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { applyWhen, email, form, FormField, FormRoot, max, maxLength, min, pattern, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { Wish } from '../../core/api';
import { Auth } from '../../core/auth';
import { problemMessage, problemType } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { DIALOG_DATA, DialogRef, UiDialog, UiDialogActions } from '../../ui/dialog';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { Consent } from '../../shared/consent';

export type GiftMode = 'reserve' | 'group' | 'join' | 'edit';

export interface GiftDialogData {
  mode: GiftMode;
  token: string;
  wish: Wish;
  currency: string;
  recipientName: string | null;
  /** Units still free, null = unlimited (reserve only). */
  available?: number | null;
  /** The group gift to join, or the gift whose own participation is edited. */
  giftId?: string;
  initial?: { amount: number | null; message: string | null };
}

export type GiftDialogResult = 'done' | 'taken';

/** Reserve, start or join a group gift, or change one's contribution. Guests identify inline (§5). */
@Component({
  selector: 'app-gift-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, UiDialog, UiDialogActions, UiButton, UiControl, UiField, UiIcon, Consent],
  template: `
    <form [formRoot]="form" class="contents">
      <ui-dialog [title]="title()" [subtitle]="data.wish.name">
        <div class="flex flex-col gap-4">
          @if (step() === 'code') {
            <p class="notice notice-accent">
              <ui-icon name="mark_email_read" />
              <span i18n="@@gift.codeSent">Diese E-Mail-Adresse ist schon bestätigt. Wir haben dir einen Code geschickt – gib ihn hier ein.</span>
            </p>
            <ui-field i18n-label="@@login.code" label="Code">
              <input #codeInput uiControl class="control-code" autocomplete="one-time-code" inputmode="numeric" [formField]="form.code" />
            </ui-field>
            <div class="flex flex-wrap gap-1.5">
              <button uiButton variant="ghost" size="sm" type="button" [busy]="resending()" (click)="resendCode()">
                <ui-icon name="refresh" [size]="18" /><span i18n="@@gift.resendCode">Code nochmals senden</span>
              </button>
              <button uiButton variant="ghost" size="sm" type="button" (click)="otherEmail()">
                <ui-icon name="arrow_back" [size]="18" /><span i18n="@@gift.otherEmail">Andere E-Mail</span>
              </button>
            </div>
            @if (resent()) {
              <p class="text-sm text-ink-muted" role="status" i18n="@@gift.codeResent">Ein neuer Code ist unterwegs. Schau auch im Spam-Ordner nach.</p>
            }
          } @else {
            @if (intro()) {
              <p class="text-ink-muted">{{ intro() }}</p>
            }
            @if (auth.user(); as user) {
              <p class="flex items-center gap-3 rounded-2xl bg-sunken p-3">
                <span class="grid size-9 place-items-center rounded-full bg-accent-soft font-bold text-on-accent-soft" aria-hidden="true">{{ (user.displayName || user.email).charAt(0).toUpperCase() }}</span>
                <span class="min-w-0 flex-1 truncate" i18n="@@gift.asUser">Als <strong>{{ user.displayName || user.email }}</strong></span>
                <button uiButton variant="ghost" size="sm" type="button" (click)="switchUser()" i18n="@@gift.notYou">Nicht du?</button>
              </p>
            } @else {
              <ui-field i18n-label="@@gift.yourName" label="Dein Name" i18n-hint="@@gift.nameHint" hint="Damit die anderen wissen, wer schenkt.">
                <input uiControl autocomplete="name" [formField]="form.displayName" />
              </ui-field>
              <ui-field i18n-label="@@gift.yourEmail" label="Deine E-Mail" i18n-hint="@@gift.emailHint" hint="Für die Bestätigung und eine Erinnerung. Kein Konto, kein Passwort.">
                <input uiControl type="email" autocomplete="email" inputmode="email" [formField]="form.email" />
              </ui-field>
              <app-consent [newTab]="true" />
            }

            @if (showUnits()) {
              <ui-field i18n-label="@@gift.units" label="Anzahl" [hint]="unitsHint()" class="max-w-40">
                <input uiControl type="number" inputmode="numeric" [formField]="form.units" />
              </ui-field>
            }
            @if (showAmount()) {
              <ui-field i18n-label="@@gift.amount" label="Dein Beitrag" [optional]="true" [prefix]="data.currency" i18n-hint="@@gift.amountHint" hint="Sehen nur die, die mitmachen. Bezahlt wird unter euch.">
                <input uiControl type="number" inputmode="decimal" [formField]="form.amount" />
              </ui-field>
            }
            <ui-field i18n-label="@@gift.message" label="Nachricht" [optional]="true" [hint]="messageHint()">
              <textarea uiControl rows="2" [formField]="form.message"></textarea>
            </ui-field>
          }

          @if (error()) {
            <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ error() }}</p>
          }
        </div>
        <footer uiDialogActions>
          <button uiButton variant="ghost" type="button" (click)="ref.close()" i18n="@@common.cancel">Abbrechen</button>
          <button uiButton type="submit" [busy]="form().submitting()">{{ submitLabel() }}</button>
        </footer>
      </ui-dialog>
    </form>
  `,
})
export class GiftDialog {
  protected readonly data = inject<GiftDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<GiftDialogResult>>(DialogRef);
  protected readonly auth = inject(Auth);
  readonly #http = inject(HttpClient);
  readonly #injector = inject(Injector);
  private readonly codeInput = viewChild('codeInput', { read: ElementRef<HTMLInputElement> });

  protected readonly resending = signal(false);
  protected readonly resent = signal(false);
  protected readonly step = signal<'details' | 'code'>('details');
  protected readonly error = signal<string | null>(null);

  protected readonly showUnits = computed(() => this.data.mode === 'reserve' && this.data.available !== 1);
  protected readonly showAmount = computed(() => this.data.mode !== 'reserve');
  protected readonly unitsHint = computed(() =>
    this.data.available !== null && this.data.available !== undefined ? $localize`:@@gift.unitsHint:noch ${this.data.available}:count: frei` : '',
  );

  protected readonly title = computed(() => {
    switch (this.data.mode) {
      case 'reserve':
        return $localize`:@@gift.reserveTitle:Ich schenke das`;
      case 'group':
        return $localize`:@@gift.groupTitle:Gemeinsam schenken`;
      case 'join':
        return $localize`:@@gift.joinTitle:Beim gemeinsamen Geschenk mitmachen`;
      default:
        return $localize`:@@gift.editTitle:Deinen Beitrag ändern`;
    }
  });

  /** The wish's name is the dialog's subtitle, so the sentences don't repeat it. */
  protected readonly intro = computed(() => {
    const recipient = this.data.recipientName;
    switch (this.data.mode) {
      case 'reserve':
        return recipient
          ? $localize`:@@gift.reserveIntroFor:Alle anderen sehen danach, dass der Wunsch vergeben ist. ${recipient}:recipient: sieht es nicht.`
          : $localize`:@@gift.reserveIntro:Alle anderen sehen danach, dass der Wunsch vergeben ist – nur die beschenkte Person nicht.`;
      case 'group':
        return $localize`:@@gift.groupIntro:Du startest ein gemeinsames Geschenk. Andere können mitmachen und ihren Beitrag angeben.`;
      case 'join':
        return $localize`:@@gift.joinIntro:Du legst mit den anderen zusammen.`;
      default:
        return '';
    }
  });

  protected readonly submitLabel = computed(() => {
    if (this.step() === 'code') return $localize`:@@gift.confirmAndSave:Bestätigen`;
    switch (this.data.mode) {
      case 'reserve':
        return $localize`:@@gift.reserveSubmit:Reservieren`;
      case 'group':
        return $localize`:@@gift.groupSubmit:Starten`;
      case 'join':
        return $localize`:@@gift.joinSubmit:Mitmachen`;
      default:
        return $localize`:@@common.save:Speichern`;
    }
  });

  protected readonly messageHint = computed(() =>
    this.data.mode === 'reserve'
      ? $localize`:@@gift.messageHintSolo:Ein Gruss für die Dankesliste nach dem Fest.`
      : $localize`:@@gift.messageHintGroup:Sehen alle, die mitmachen – z.B. «Ich kaufe es» oder eine TWINT-Nummer.`,
  );

  protected readonly form = form(
    signal({
      displayName: '',
      email: '',
      code: '',
      units: 1,
      amount: this.data.initial?.amount ?? (null as number | null),
      message: this.data.initial?.message ?? '',
    }),
    (p) => {
      applyWhen(p, () => !this.auth.loggedIn() && this.step() === 'details', (q) => {
        required(q.displayName);
        maxLength(q.displayName, 100);
        required(q.email);
        email(q.email);
      });
      applyWhen(p, () => this.step() === 'code', (q) => {
        required(q.code);
        maxLength(q.code, 8);
        pattern(q.code, /^\s*\d{6}\s*$/);
      });
      // Only what the dialog shows may block it: a hidden field can't be corrected.
      applyWhen(p, () => this.showUnits(), (q) => {
        min(q.units, 1);
        max(q.units, () => this.data.available ?? 999);
      });
      min(p.amount, 0);
      maxLength(p.message, 500);
    },
    { submission: { action: async (f) => this.#submit(f().value()) } },
  );

  protected async resendCode() {
    this.resending.set(true);
    this.error.set(null);
    try {
      await this.auth.requestCode(this.form.email().value().trim(), `/l/${this.data.token}`);
      this.resent.set(true);
    } catch (e) {
      this.error.set(problemMessage(e));
    } finally {
      this.resending.set(false);
    }
  }

  protected otherEmail() {
    this.form.code().value.set('');
    this.resent.set(false);
    this.error.set(null);
    this.step.set('details');
  }

  protected async switchUser() {
    await this.auth.logout();
  }

  async #submit(v: { displayName: string; email: string; code: string; units: number; amount: number | null; message: string }) {
    this.error.set(null);
    try {
      if (this.step() === 'code') {
        await this.auth.verifyCode(v.email.trim(), v.code.trim());
        this.step.set('details');
      } else if (!this.auth.loggedIn()) {
        const res = await this.auth.identify(v.email.trim(), v.displayName.trim(), `/l/${this.data.token}`);
        if (res.status === 'CodeSent') {
          this.step.set('code');
          afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.#injector });
          return;
        }
      }
      await this.#save(v);
      this.ref.close('done');
    } catch (e) {
      // A lost race (§6.8) is a plain 409: for the guest it means the same as "taken".
      const type = problemType(e);
      if (type === 'not-available' || (type === 'conflict' && this.data.mode !== 'edit')) {
        this.ref.close('taken');
        return;
      }
      this.error.set(problemMessage(e));
    }
  }

  #save(v: { units: number; amount: number | null; message: string }) {
    const message = v.message.trim() || null;
    const t = this.data.token;
    switch (this.data.mode) {
      case 'reserve':
        return firstValueFrom(this.#http.post(`/api/shared/${t}/wishes/${this.data.wish.id}/gifts`, { isGroup: false, units: v.units, message }));
      case 'group':
        return firstValueFrom(this.#http.post(`/api/shared/${t}/wishes/${this.data.wish.id}/gifts`, { isGroup: true, amount: v.amount, message }));
      case 'join':
        return firstValueFrom(this.#http.post(`/api/shared/${t}/gifts/${this.data.giftId}/participants`, { amount: v.amount, message }));
      default:
        return firstValueFrom(this.#http.put(`/api/gifts/${this.data.giftId}/participants/me`, { amount: v.amount, message }));
    }
  }
}
