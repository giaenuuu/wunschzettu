import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { CreateWishlistRequest, Palette, WishlistDetail } from '../../core/api';
import { problemMessage } from '../../core/problems';
import { EmojiPicker, PalettePicker } from '../../shared/theme-pickers';
import { UiButton } from '../../ui/button';
import { DialogRef, UiDialog, UiDialogActions } from '../../ui/dialog';
import { UiControl, UiField } from '../../ui/field';
import { UiSwitch } from '../../ui/switch';

@Component({
  selector: 'app-create-list-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, UiDialog, UiDialogActions, UiButton, UiField, UiControl, UiSwitch, EmojiPicker, PalettePicker],
  template: `
    <form [formRoot]="form" class="contents">
      <ui-dialog i18n-title="@@createList.title" title="Neue Wunschliste" i18n-subtitle="@@createList.subtitle" subtitle="Alles lässt sich später noch ändern.">
        <div class="flex flex-col gap-5">
          <ui-field i18n-label="@@list.titleLabel" label="Titel">
            <input uiControl [formField]="form.title" i18n-placeholder="@@list.titlePlaceholder" placeholder="z.B. Geburtstag 2026" />
          </ui-field>
          <ui-switch [formField]="form.forMe" i18n-description="@@createList.forMeHint" description="Dann siehst du nie, was schon reserviert ist."
            ><span i18n="@@createList.forMe">Die Liste ist für mich</span></ui-switch
          >
          @if (!form.forMe().value()) {
            <ui-field i18n-label="@@list.recipient" label="Für wen?">
              <input uiControl [formField]="form.recipientName" i18n-placeholder="@@list.recipientPlaceholder" placeholder="z.B. Lena" />
            </ui-field>
          }
          <ui-field i18n-label="@@list.eventDateLabel" label="Datum des Anlasses" [optional]="true" i18n-hint="@@list.eventDateHint" hint="Nach dem Fest öffnet sich die Dankesliste.">
            <input uiControl type="date" [formField]="form.eventDate" />
          </ui-field>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-semibold" i18n="@@settings.emoji">Symbol</legend>
            <app-emoji-picker [formField]="form.emoji" i18n-label="@@settings.emoji" label="Symbol" />
          </fieldset>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-semibold" i18n="@@settings.palette">Farben</legend>
            <app-palette-picker [formField]="form.palette" i18n-label="@@settings.palette" label="Farben" />
          </fieldset>
          @if (error()) {
            <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ error() }}</p>
          }
        </div>
        <footer uiDialogActions>
          <button uiButton variant="ghost" type="button" (click)="ref.close()" i18n="@@common.cancel">Abbrechen</button>
          <button uiButton type="submit" [busy]="form().submitting()" i18n="@@common.create">Erstellen</button>
        </footer>
      </ui-dialog>
    </form>
  `,
})
export class CreateListDialog {
  readonly #http = inject(HttpClient);
  protected readonly ref = inject<DialogRef<WishlistDetail>>(DialogRef);
  protected readonly error = signal<string | null>(null);

  protected readonly form = form(
    signal({ title: '', forMe: true, recipientName: '', eventDate: '', emoji: '🎁', palette: 'Classic' as Palette }),
    (p) => {
      required(p.title);
      maxLength(p.title, 200);
      maxLength(p.recipientName, 100);
    },
    {
      submission: {
        action: async (f) => {
          const v = f().value();
          const body: CreateWishlistRequest = {
            title: v.title.trim(),
            forMe: v.forMe,
            recipientName: v.forMe ? null : v.recipientName.trim() || null,
            eventDate: v.eventDate || null,
            description: null,
            currency: null,
            theme: { emoji: v.emoji, palette: v.palette, layout: 'Grid' },
          };
          try {
            this.ref.close(await firstValueFrom(this.#http.post<WishlistDetail>('/api/wishlists', body)));
          } catch (e) {
            this.error.set(problemMessage(e));
          }
        },
      },
    },
  );
}
