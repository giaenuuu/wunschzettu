import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UiButton } from './button';
import { DIALOG_DATA, DialogRef, Dialogs, UiDialog, UiDialogActions } from './dialog';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirm: string;
  danger?: boolean;
}

@Component({
  selector: 'ui-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiDialog, UiDialogActions, UiButton],
  template: `
    <ui-dialog [title]="data.title">
      @if (data.message) {
        <p class="text-ink-muted">{{ data.message }}</p>
      }
      <footer uiDialogActions>
        <button uiButton variant="ghost" (click)="ref.close(false)" i18n="@@common.cancel">Abbrechen</button>
        <button uiButton [variant]="data.danger ? 'danger' : 'primary'" (click)="ref.close(true)">{{ data.confirm }}</button>
      </footer>
    </ui-dialog>
  `,
})
class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

/** A friendly replacement for window.confirm(). */
@Injectable({ providedIn: 'root' })
export class Confirmer {
  readonly #dialogs = inject(Dialogs);

  async ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.#dialogs.open<ConfirmDialog, ConfirmOptions, boolean>(ConfirmDialog, { data: options, size: 'sm' });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
