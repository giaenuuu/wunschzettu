import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { UiIcon } from './icon';

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: string;
}

/**
 * Pick one of a few options, as a row of pills (an ARIA radio group with arrow-key navigation).
 * Works with `[formField]` or `[(value)]`. Use `stacked` for options that need room, e.g. on narrow screens.
 */
@Component({
  selector: 'ui-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  host: { class: 'block', '[class.self-stretch]': 'wide()', '[class.w-full]': 'wide()' },
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label()"
      class="inline-flex max-w-full gap-1 rounded-full bg-sunken p-1"
      [class.w-full]="wide()"
      (keydown)="onKeydown($event)"
    >
      @for (o of options(); track o.value; let i = $index) {
        <button
          #option
          type="button"
          role="radio"
          [attr.aria-checked]="o.value === value()"
          [tabindex]="o.value === value() || (i === 0 && !hasSelection()) ? 0 : -1"
          [disabled]="disabled()"
          (click)="value.set(o.value)"
          class="flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
          [class]="(o.value === value() ? 'bg-raised text-ink shadow-sm ' : 'text-ink-muted hover:text-ink ') + (wide() ? 'flex-1' : 'flex-auto')"
        >
          @if (o.icon) {
            <ui-icon [name]="o.icon" [size]="18" />
          }
          <span class="truncate">{{ o.label }}</span>
        </button>
      }
    </div>
  `,
})
export class UiSegmented<T> implements FormValueControl<T> {
  readonly value = model.required<T>();
  readonly options = input.required<SegmentOption<T>[]>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly wide = input(false);

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  protected hasSelection() {
    return this.options().some((o) => o.value === this.value());
  }

  protected onKeydown(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const options = this.options();
    const current = Math.max(0, options.findIndex((o) => o.value === this.value()));
    const next = (current + step + options.length) % options.length;
    this.value.set(options[next].value);
    this.buttons()[next]?.nativeElement.focus();
  }
}
