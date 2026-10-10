import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WishImage } from '../core/api';
import { DIALOG_DATA, DialogRef } from '../ui/dialog';
import { UiIcon } from '../ui/icon';

export interface ImageViewerData {
  images: WishImage[];
  title: string;
}

/** Full-size pictures of a wish. Arrow keys and swiping move between them. */
@Component({
  selector: 'app-image-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  host: {
    class: 'relative grid animate-pop place-items-center overflow-hidden rounded-3xl bg-black',
    role: 'group',
    '[attr.aria-label]': 'data.title',
    '(keydown.arrowLeft)': 'step(-1)',
    '(keydown.arrowRight)': 'step(1)',
    '(pointerdown)': 'swipeStart = $event.clientX',
    '(pointerup)': 'swipeEnd($event.clientX)',
  },
  template: `
    <img [src]="data.images[index()].url" [alt]="data.title" class="block max-h-[86dvh] max-w-full touch-pan-y object-contain select-none" draggable="false" />
    @if (data.images.length > 1) {
      <button type="button" class="round nav left-2" (click)="step(-1)" i18n-aria-label="@@viewer.previous" aria-label="Vorheriges Bild"><ui-icon name="chevron_left" [size]="28" /></button>
      <button type="button" class="round nav right-2" (click)="step(1)" i18n-aria-label="@@viewer.next" aria-label="Nächstes Bild"><ui-icon name="chevron_right" [size]="28" /></button>
      <span class="absolute bottom-3 rounded-full bg-black/60 px-3 py-0.5 text-sm text-white" aria-live="polite">{{ index() + 1 }} / {{ data.images.length }}</span>
    }
    <button type="button" class="round absolute top-2 right-2" (click)="ref.close()" i18n-aria-label="@@common.close" aria-label="Schliessen"><ui-icon name="close" /></button>
  `,
  styles: `
    .nav { position: absolute; top: 50%; transform: translateY(-50%); }
    .round {
      display: grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; cursor: pointer;
      background: rgb(0 0 0 / 0.5); color: white; backdrop-filter: blur(6px);
    }
    .round:hover { background: rgb(0 0 0 / 0.7); }
  `,
})
export class ImageViewer {
  protected readonly data = inject<ImageViewerData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly index = signal(0);
  protected swipeStart: number | null = null;

  protected step(delta: number) {
    const n = this.data.images.length;
    this.index.update((i) => (i + delta + n) % n);
  }

  protected swipeEnd(x: number) {
    if (this.swipeStart !== null && Math.abs(x - this.swipeStart) > 50) this.step(x < this.swipeStart ? 1 : -1);
    this.swipeStart = null;
  }
}
