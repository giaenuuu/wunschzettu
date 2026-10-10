import { ChangeDetectionStrategy, Component, Directive, computed, contentChild, inject, input } from '@angular/core';
import { FormField, ValidationError } from '@angular/forms/signals';

let nextId = 0;

/**
 * Marks the native input, textarea or select inside a <ui-field>. Styles it, links it to the label,
 * hint and error text, and reads validation state from a `[formField]` on the same element.
 */
@Directive({
  selector: 'input[uiControl], textarea[uiControl], select[uiControl]',
  host: {
    class: 'control',
    '[id]': 'id',
    '[attr.aria-invalid]': 'showError() ? "true" : null',
    '[attr.aria-describedby]': 'describedBy()',
    '[style.padding-left]': 'field?.prefix() ? "calc(1.25rem + " + field.prefix()!.length * 0.6 + "em)" : null',
  },
})
export class UiControl {
  readonly id = `ui-control-${nextId++}`;
  readonly #formField = inject(FormField, { self: true, optional: true });
  protected readonly field = inject(UiField, { optional: true });

  readonly showError = computed(() => {
    const state = this.#formField?.state();
    return !!state && state.touched() && state.invalid();
  });

  readonly errorText = computed(() => (this.showError() ? errorMessage(this.#formField!.errors()[0]) : null));

  protected readonly describedBy = computed(() => {
    if (!this.field) return null;
    const ids = [this.showError() && `${this.id}-error`, this.field.hint() && `${this.id}-hint`].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });
}

/** Label, optional prefix, hint and validation message around one control. */
@Component({
  selector: 'ui-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1.5' },
  template: `
    @if (label()) {
      <label [for]="control()?.id" class="text-sm font-semibold text-ink">
        {{ label() }}
        @if (optional()) {
          <span class="font-normal text-ink-muted" i18n="@@field.optional">(optional)</span>
        }
      </label>
    }
    <div class="relative">
      @if (prefix()) {
        <span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted" aria-hidden="true">{{ prefix() }}</span>
      }
      <ng-content />
    </div>
    @if (control()?.errorText(); as error) {
      <p [id]="control()!.id + '-error'" class="text-sm font-medium text-danger">{{ error }}</p>
    }
    @if (hint()) {
      <p [id]="control()?.id + '-hint'" class="text-sm text-ink-muted">{{ hint() }}</p>
    }
  `,
})
export class UiField {
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly prefix = input<string>();
  readonly optional = input(false);
  protected readonly control = contentChild(UiControl);
}

/** A short, localized sentence for a signal-forms validation error. */
export function errorMessage(error: ValidationError | undefined): string | null {
  if (!error) return null;
  const e = error as ValidationError & { min?: number; max?: number; minLength?: number; maxLength?: number };
  switch (error.kind) {
    case 'required':
      return $localize`:@@validation.required:Bitte ausfüllen.`;
    case 'email':
      return $localize`:@@validation.email:Bitte gib eine gültige E-Mail-Adresse ein.`;
    case 'min':
      return $localize`:@@validation.min:Mindestens ${e.min}:min:.`;
    case 'max':
      return $localize`:@@validation.max:Höchstens ${e.max}:max:.`;
    case 'minLength':
      return $localize`:@@validation.minLength:Mindestens ${e.minLength}:count: Zeichen.`;
    case 'maxLength':
      return $localize`:@@validation.maxLength:Höchstens ${e.maxLength}:count: Zeichen.`;
    case 'url':
      return $localize`:@@validation.url:Bitte gib einen Link ein, der mit https:// beginnt.`;
    default:
      return error.message ?? $localize`:@@validation.pattern:Das Format stimmt nicht.`;
  }
}
