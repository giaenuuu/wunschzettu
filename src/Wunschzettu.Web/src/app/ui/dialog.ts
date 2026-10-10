import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, Directive, Injectable, InjectionToken, inject, input } from '@angular/core';
import { UiButton } from './button';
import { UiIcon } from './icon';

export { DIALOG_DATA, DialogRef };

export type DialogSize = 'sm' | 'md' | 'lg' | 'viewer';

const widths: Record<DialogSize, string> = { sm: '26rem', md: '34rem', lg: '42rem', viewer: '96vw' };

let nextId = 0;

/** The id the dialog container is labelled by; <ui-dialog> puts it on its title. */
const DIALOG_TITLE_ID = new InjectionToken<string>('DIALOG_TITLE_ID');

/**
 * Opens dialogs: a centered card on wide screens, a bottom sheet on phones (in thumb reach).
 * The CDK traps focus, restores it on close, closes on Escape and labels the dialog by its <ui-dialog> title.
 */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  readonly #dialog = inject(Dialog);
  readonly #overlay = inject(Overlay);
  readonly #breakpoints = inject(BreakpointObserver);

  open<C, D = unknown, R = unknown>(component: ComponentType<C>, options: { data?: D; size?: DialogSize } = {}): DialogRef<R, C> {
    const size = options.size ?? 'md';
    const sheet = size !== 'viewer' && !this.#breakpoints.isMatched('(min-width: 40rem)');
    const titleId = `ui-dialog-title-${nextId++}`;
    return this.#dialog.open<R, D, C>(component, {
      data: options.data,
      ariaLabelledBy: titleId,
      providers: [{ provide: DIALOG_TITLE_ID, useValue: titleId }],
      backdropClass: 'ui-backdrop',
      panelClass: 'ui-dialog-pane',
      width: sheet ? '100%' : widths[size],
      maxWidth: sheet ? '100%' : 'calc(100vw - 2rem)',
      positionStrategy: sheet ? this.#overlay.position().global().bottom('0').centerHorizontally() : undefined,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}

/**
 * The frame of every dialog: title, close button, scrollable body and an optional footer.
 *
 *   <ui-dialog [title]="…"> body … <footer uiDialogActions> buttons </footer> </ui-dialog>
 */
@Component({
  selector: 'ui-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiIcon],
  host: {
    class:
      'flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[1.75rem] bg-card text-ink shadow-[var(--shadow-lift)] ' +
      'animate-sheet sm:max-h-[min(88dvh,54rem)] sm:animate-pop sm:rounded-[1.75rem]',
  },
  template: `
    <div class="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true"></div>
    <header class="flex shrink-0 items-start gap-3 px-5 pt-3 pb-2 sm:px-7 sm:pt-6">
      <div class="min-w-0 flex-1">
        <h2 class="display text-[1.625rem]" [id]="titleId">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="mt-1 text-ink-muted">{{ subtitle() }}</p>
        }
      </div>
      <button uiButton variant="ghost" size="sm" [iconOnly]="true" class="-mr-2" (click)="ref.close()" i18n-aria-label="@@common.close" aria-label="Schliessen">
        <ui-icon name="close" />
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5 sm:px-7">
      <ng-content />
    </div>
    <ng-content select="[uiDialogActions]" />
  `,
})
export class UiDialog {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  protected readonly ref = inject(DialogRef);
  protected readonly titleId = inject(DIALOG_TITLE_ID, { optional: true }) ?? `ui-dialog-title-${nextId++}`;
}

/** Footer row of a <ui-dialog>: sticks to the bottom, clears the iPhone home indicator. */
@Directive({
  selector: '[uiDialogActions]',
  host: {
    class: 'flex shrink-0 flex-wrap-reverse items-center justify-end gap-2 border-t border-line bg-card px-5 pt-3 pb-safe sm:px-7 sm:pb-5',
  },
})
export class UiDialogActions {}
