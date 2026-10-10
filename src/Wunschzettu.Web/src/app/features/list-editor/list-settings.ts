import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ListAccess, UpdateWishlistRequest, WishlistDetail } from '../../core/api';
import { problemMessage } from '../../core/problems';
import { EmojiPicker, PalettePicker } from '../../shared/theme-pickers';
import { UiButton } from '../../ui/button';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { UiSwitch } from '../../ui/switch';

const currencies = ['CHF', 'EUR', 'USD', 'GBP'];

@Component({
  selector: 'app-list-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, UiButton, UiControl, UiField, UiIcon, UiSegmented, UiSwitch, EmojiPicker, PalettePicker],
  template: `
    <form [formRoot]="form" class="flex flex-col gap-8">
      <fieldset class="flex flex-col gap-4">
        <legend class="mb-3 font-display text-lg font-semibold" i18n="@@settings.basics">Allgemein</legend>
        <ui-field i18n-label="@@list.titleLabel" label="Titel">
          <input uiControl [formField]="form.title" />
        </ui-field>
        <ui-field i18n-label="@@list.description" label="Beschreibung" [optional]="true" i18n-hint="@@list.descriptionHint" hint="Erscheint oben auf der geteilten Liste.">
          <textarea uiControl rows="2" [formField]="form.description"></textarea>
        </ui-field>
        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field i18n-label="@@list.recipient" label="Für wen?" [optional]="true">
            <input uiControl [formField]="form.recipientName" i18n-placeholder="@@list.recipientPlaceholder" placeholder="z.B. Lena" />
          </ui-field>
          <ui-field i18n-label="@@list.eventDateLabel" label="Datum des Anlasses" [optional]="true">
            <input uiControl type="date" [formField]="form.eventDate" />
          </ui-field>
        </div>
        <ui-field i18n-label="@@settings.currency" label="Währung" class="max-w-40">
          <select uiControl [formField]="form.currency">
            @for (c of currencies; track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </ui-field>
      </fieldset>

      <fieldset class="flex flex-col gap-4">
        <legend class="mb-3 font-display text-lg font-semibold" i18n="@@settings.look">Aussehen</legend>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold" i18n="@@settings.emoji">Symbol</span>
          <app-emoji-picker [formField]="form.emoji" i18n-label="@@settings.emoji" label="Symbol" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold" i18n="@@settings.palette">Farben</span>
          <app-palette-picker [formField]="form.palette" i18n-label="@@settings.palette" label="Farben" />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold" i18n="@@settings.layout">Darstellung für Gäste</span>
          <ui-segmented [formField]="form.layout" [options]="layouts" i18n-label="@@settings.layout" label="Darstellung für Gäste" />
        </div>
      </fieldset>

      <fieldset class="flex flex-col gap-4">
        <legend class="mb-3 font-display text-lg font-semibold" i18n="@@settings.sharing">Teilen &amp; Privatsphäre</legend>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold" i18n="@@settings.access">Wer darf die Liste sehen?</span>
          <ui-segmented [formField]="form.access" [options]="accessOptions" i18n-label="@@settings.access" label="Wer darf die Liste sehen?" />
        </div>
        <ui-switch [formField]="form.showGiverNames" i18n-description="@@settings.showGiverNamesHint" description="Wer mitschenkt, sieht sich gegenseitig immer."
          ><span i18n="@@settings.showGiverNames">Gäste sehen, wer was schenkt</span></ui-switch
        >
      </fieldset>

      @if (error()) {
        <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ error() }}</p>
      }
      <div class="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-line pt-5">
        <button uiButton variant="danger-ghost" type="button" (click)="deleteRequested.emit()">
          <ui-icon name="delete" /><span i18n="@@settings.delete">Liste löschen</span>
        </button>
        <button uiButton type="submit" [busy]="form().submitting()" i18n="@@common.saveChanges">Änderungen speichern</button>
      </div>
    </form>
  `,
})
export class ListSettings {
  readonly list = input.required<WishlistDetail>();
  readonly saved = output<void>();
  readonly deleteRequested = output<void>();

  readonly #http = inject(HttpClient);
  protected readonly currencies = currencies;
  protected readonly error = signal<string | null>(null);
  protected readonly layouts: SegmentOption<'Grid' | 'List'>[] = [
    { value: 'Grid', label: $localize`:@@settings.grid:Kacheln`, icon: 'grid_view' },
    { value: 'List', label: $localize`:@@settings.list:Liste`, icon: 'view_agenda' },
  ];
  protected readonly accessOptions: SegmentOption<ListAccess>[] = [
    { value: 'Link', label: $localize`:@@settings.accessLink:Alle mit Link`, icon: 'link' },
    { value: 'Invited', label: $localize`:@@settings.accessInvited:Nur Eingeladene`, icon: 'lock' },
  ];

  readonly #model = linkedSignal(() => {
    const l = this.list();
    return {
      title: l.title,
      description: l.description ?? '',
      recipientName: l.recipientName ?? '',
      eventDate: l.eventDate ?? '',
      currency: l.currency,
      access: l.access,
      showGiverNames: l.showGiverNames,
      palette: l.theme.palette,
      emoji: l.theme.emoji ?? '🎁',
      layout: l.theme.layout,
    };
  });

  protected readonly form = form(
    this.#model,
    (p) => {
      required(p.title);
      maxLength(p.title, 200);
      maxLength(p.description, 4000);
      maxLength(p.recipientName, 100);
    },
    {
      submission: {
        action: async (f) => {
          const v = f().value();
          const body: UpdateWishlistRequest = {
            title: v.title.trim(),
            description: v.description.trim() || null,
            recipientName: v.recipientName.trim() || null,
            eventDate: v.eventDate || null,
            currency: v.currency,
            access: v.access,
            showGiverNames: v.showGiverNames,
            theme: { palette: v.palette, emoji: v.emoji || null, layout: v.layout },
          };
          this.error.set(null);
          try {
            await firstValueFrom(this.#http.put(`/api/wishlists/${this.list().id}`, body));
            this.saved.emit();
          } catch (e) {
            this.error.set(problemMessage(e));
          }
        },
      },
    },
  );
}
