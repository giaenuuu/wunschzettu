import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { UiIcon } from './icon';

export interface ToastOptions {
  /** A button in the toast, e.g. "Rückgängig". */
  action?: { label: string; run: () => void };
  duration?: number;
  tone?: 'default' | 'success' | 'error';
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

let nextId = 0;

/** Short messages at the bottom of the screen, announced politely to screen readers. */
@Injectable({ providedIn: 'root' })
export class Toaster {
  readonly #toasts = signal<Toast[]>([]);
  readonly toasts = this.#toasts.asReadonly();
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, options: ToastOptions = {}): void {
    const toast: Toast = { id: nextId++, message, ...options };
    // At most three at a time; the oldest goes first.
    this.#toasts.update((list) => [...list.slice(-2), toast]);
    this.#schedule(toast);
  }

  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.#toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Hovering or focusing a toast keeps it, so there is time to read it or reach its action. */
  pause(id: number): void {
    clearTimeout(this.#timers.get(id));
  }

  resume(id: number): void {
    const toast = this.#toasts().find((t) => t.id === id);
    if (toast) this.#schedule(toast);
  }

  #schedule(toast: Toast) {
    const duration = toast.duration ?? (toast.action ? 8000 : 4500);
    this.#timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), duration));
  }
}

@Component({
  selector: 'ui-toaster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  host: {
    class: 'pointer-events-none fixed inset-x-0 bottom-0 z-[1100] flex flex-col items-center gap-2 px-4 pb-safe',
    role: 'status',
    'aria-live': 'polite',
  },
  template: `
    @for (t of toaster.toasts(); track t.id) {
      <div
        class="pointer-events-auto flex w-full max-w-md animate-rise items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-paper shadow-[var(--shadow-lift)]"
        (mouseenter)="toaster.pause(t.id)"
        (mouseleave)="toaster.resume(t.id)"
        (focusin)="toaster.pause(t.id)"
        (focusout)="toaster.resume(t.id)"
      >
        @if (t.tone === 'success') {
          <ui-icon name="check_circle" class="text-[var(--color-success)]" />
        } @else if (t.tone === 'error') {
          <ui-icon name="error" class="text-[var(--color-danger)]" />
        }
        <p class="min-w-0 flex-1 py-1.5 text-[0.9375rem]">{{ t.message }}</p>
        @if (t.action; as action) {
          <button type="button" class="h-9 cursor-pointer rounded-full px-3 font-semibold text-brand-300 hover:bg-white/10" (click)="action.run(); toaster.dismiss(t.id)">
            {{ action.label }}
          </button>
        }
        <button type="button" class="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-white/10" (click)="toaster.dismiss(t.id)" i18n-aria-label="@@common.close" aria-label="Schliessen">
          <ui-icon name="close" [size]="18" />
        </button>
      </div>
    }
  `,
})
export class UiToaster {
  protected readonly toaster = inject(Toaster);
}
