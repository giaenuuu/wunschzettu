import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { Palette } from '../core/api';
import { palettes } from './palettes';

export const listEmojis = ['🎁', '🎂', '🎄', '🎉', '👶', '💍', '🏠', '🎓', '🐣', '✨', '🧸', '📚'];

/** Arrow-key navigation inside a radiogroup made of buttons. */
function moveFocus(event: KeyboardEvent, buttons: readonly ElementRef<HTMLButtonElement>[], select: (index: number) => void) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const current = buttons.findIndex((b) => b.nativeElement === document.activeElement);
  const next = (Math.max(0, current) + step + buttons.length) % buttons.length;
  select(next);
  buttons[next].nativeElement.focus();
}

/** The list's emoji, shown on its stamp. Works with `[formField]`. */
@Component({
  selector: 'app-emoji-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="flex flex-wrap gap-2" (keydown)="onKeydown($event)">
      @for (e of emojis; track e; let i = $index) {
        <button
          #option
          type="button"
          role="radio"
          [attr.aria-checked]="value() === e"
          [tabindex]="value() === e || (i === 0 && !emojis.includes(value())) ? 0 : -1"
          (click)="value.set(e)"
          class="grid size-12 cursor-pointer place-items-center rounded-2xl border-2 text-2xl transition-all duration-150 hover:scale-110"
          [class]="value() === e ? 'border-accent bg-accent-soft scale-110' : 'border-line bg-raised'"
        >
          {{ e }}
        </button>
      }
    </div>
  `,
})
export class EmojiPicker implements FormValueControl<string> {
  readonly value = model('');
  readonly label = input.required<string>();
  protected readonly emojis = listEmojis;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  protected onKeydown(event: KeyboardEvent) {
    moveFocus(event, this.buttons(), (i) => this.value.set(this.emojis[i]));
  }
}

/** The list's colour preset. Works with `[formField]`. */
@Component({
  selector: 'app-palette-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="grid grid-cols-3 gap-2 sm:grid-cols-6" (keydown)="onKeydown($event)">
      @for (p of palettes; track p.value) {
        <button
          #option
          type="button"
          role="radio"
          [attr.aria-checked]="value() === p.value"
          [tabindex]="value() === p.value ? 0 : -1"
          (click)="value.set(p.value)"
          class="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 p-2 text-xs font-semibold transition-all duration-150"
          [class]="value() === p.value ? 'border-accent bg-accent-soft text-ink' : 'border-transparent text-ink-muted hover:bg-sunken'"
        >
          <span class="relative size-9 overflow-hidden rounded-full shadow-inner ring-2 ring-white/60" aria-hidden="true">
            <span class="absolute inset-0" [style.background]="p.swatch[0]"></span>
            <span class="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]" [style.background]="p.swatch[1]"></span>
          </span>
          {{ p.label }}
        </button>
      }
    </div>
  `,
})
export class PalettePicker implements FormValueControl<Palette> {
  readonly value = model<Palette>('Classic');
  readonly label = input.required<string>();
  protected readonly palettes = palettes;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  protected onKeydown(event: KeyboardEvent) {
    moveFocus(event, this.buttons(), (i) => this.value.set(this.palettes[i].value));
  }
}
