import { Clipboard } from '@angular/cdk/clipboard';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ButtonSize, ButtonVariant, UiButton } from '../ui/button';
import { UiIcon } from '../ui/icon';
import { Toaster } from '../ui/toaster';

interface Channel {
  label: string;
  icon: string;
  /** Background of the icon bubble, roughly the service's colour, so it's recognised at a glance. */
  color: string;
  href: (url: string, text: string) => string;
}

/**
 * "Teilen": on phones the system share sheet (every installed messenger, AirDrop, …);
 * on computers a menu with the usual channels, since desktop share sheets are rare and sparse.
 */
@Component({
  selector: 'app-share-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, UiButton, UiIcon],
  template: `
    @if (useSystemSheet) {
      <button uiButton [variant]="variant()" [size]="size()" (click)="shareNatively()">
        <ui-icon name="share" [size]="18" /><span i18n="@@share.button">Teilen</span>
      </button>
    } @else {
      <button uiButton [variant]="variant()" [size]="size()" [cdkMenuTriggerFor]="menu">
        <ui-icon name="share" [size]="18" /><span i18n="@@share.button">Teilen</span><ui-icon name="keyboard_arrow_down" [size]="18" />
      </button>
      <ng-template #menu>
        <div cdkMenu class="menu">
          <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="copy()">
            <span class="grid size-8 place-items-center rounded-full bg-sunken"><ui-icon name="content_copy" [size]="18" /></span>
            <span i18n="@@share.copy">Link kopieren</span>
          </button>
          <div class="menu-separator"></div>
          @for (c of channels; track c.label) {
            <a cdkMenuItem class="menu-item no-underline" [href]="c.href(url(), message())" target="_blank" rel="noopener noreferrer">
              <span class="grid size-8 place-items-center rounded-full text-white" [style.background]="c.color"><ui-icon [name]="c.icon" [size]="18" /></span>
              <span>{{ c.label }}</span>
            </a>
          }
          @if (canShareNatively) {
            <div class="menu-separator"></div>
            <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="shareNatively()">
              <span class="grid size-8 place-items-center rounded-full bg-sunken"><ui-icon name="more_horiz" [size]="18" /></span>
              <span i18n="@@share.more">Weitere Apps …</span>
            </button>
          }
        </div>
      </ng-template>
    }
  `,
})
export class ShareButton {
  readonly url = input.required<string>();
  readonly title = input.required<string>();
  /** Sentence placed before the link in messages. */
  readonly text = input<string>();
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');

  readonly #clipboard = inject(Clipboard);
  readonly #toaster = inject(Toaster);

  protected readonly canShareNatively = typeof navigator.share === 'function';
  /** Touch devices have a proper share sheet; desktop browsers mostly don't (or only a thin one). */
  protected readonly useSystemSheet = this.canShareNatively && matchMedia('(pointer: coarse)').matches;
  protected readonly message = computed(() => this.text() || this.title());

  protected readonly channels: Channel[] = [
    { label: $localize`:@@share.email:E-Mail`, icon: 'mail', color: '#6b7280', href: (u, t) => `mailto:?subject=${enc(t)}&body=${enc(`${t}\n${u}`)}` },
    { label: 'WhatsApp', icon: 'chat', color: '#25d366', href: (u, t) => `https://wa.me/?text=${enc(`${t}\n${u}`)}` },
    { label: 'Threema', icon: 'lock', color: '#1d1d1b', href: (u, t) => `https://threema.id/compose?text=${enc(`${t}\n${u}`)}` },
    { label: 'Telegram', icon: 'send', color: '#229ed9', href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
    { label: 'Facebook', icon: 'thumb_up', color: '#1877f2', href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  ];

  protected copy() {
    this.#clipboard.copy(this.url());
    this.#toaster.show($localize`:@@editor.copied:Link kopiert – jetzt z.B. per WhatsApp teilen.`, { tone: 'success' });
  }

  protected async shareNatively() {
    try {
      await navigator.share({ title: this.title(), text: this.message(), url: this.url() });
    } catch (e) {
      // Cancelled by the user, or the browser refused: offer the link instead.
      if ((e as DOMException)?.name !== 'AbortError') this.copy();
    }
  }
}

const enc = encodeURIComponent;
