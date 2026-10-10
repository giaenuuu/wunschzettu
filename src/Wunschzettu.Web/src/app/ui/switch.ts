import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormCheckboxControl } from '@angular/forms/signals';

let nextId = 0;

/**
 * An on/off switch with a label and an optional description; works with `[formField]` or `[(checked)]`.
 * The whole row is the click target, the button carries role="switch" for screen readers.
 */
@Component({
  selector: 'ui-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-3.5 py-1.5">
      <button
        type="button"
        role="switch"
        [id]="id"
        [attr.aria-checked]="checked()"
        [attr.aria-labelledby]="id + '-label'"
        [attr.aria-describedby]="description() ? id + '-desc' : null"
        [disabled]="disabled()"
        (click)="toggle()"
        class="group relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        [class]="checked() ? 'bg-accent' : 'bg-line-strong'"
      >
        <span
          class="pointer-events-none grid size-6 place-items-center rounded-full bg-white shadow-md transition-transform duration-200 ease-[var(--ease-spring)]"
          [class]="checked() ? 'translate-x-5' : 'translate-x-0'"
        >
          @if (checked()) {
            <svg viewBox="0 0 24 24" class="size-3.5 fill-none stroke-accent stroke-[3.5]" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          }
        </span>
      </button>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span [id]="id + '-label'" class="cursor-pointer font-medium leading-snug" (click)="toggle()"><ng-content /></span>
        @if (description()) {
          <span [id]="id + '-desc'" class="text-sm text-ink-muted">{{ description() }}</span>
        }
      </span>
    </div>
  `,
})
export class UiSwitch implements FormCheckboxControl {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly description = input<string>();
  protected readonly id = `ui-switch-${nextId++}`;

  protected toggle() {
    if (!this.disabled()) this.checked.update((c) => !c);
  }
}
