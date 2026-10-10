import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Wish } from '../core/api';
import { Dialogs } from '../ui/dialog';
import { UiIcon } from '../ui/icon';
import { ImageViewer, ImageViewerData } from './image-viewer';
import { LinkCard } from './link-card';

/**
 * A wish, styled like a gift tag. Views add their own parts:
 * `<div cardStatus>` below the details (gift state), and default content as the action row.
 * `wide` puts the picture beside the text (list layout on larger screens).
 */
@Component({
  selector: 'app-wish-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon, DecimalPipe, LinkCard],
  host: { class: 'block' },
  template: `
    @let w = wish();
    <article
      class="card relative flex h-full flex-col overflow-hidden transition-opacity"
      [class.opacity-60]="dimmed()"
      [class]="wide() ? 'sm:flex-row' : ''"
      [attr.aria-labelledby]="'wish-' + w.id"
    >
      @if (w.images.length) {
        <button
          type="button"
          class="group/img relative block shrink-0 cursor-zoom-in overflow-hidden bg-sunken"
          [class]="wide() ? 'aspect-[4/3] sm:aspect-auto sm:w-56 md:w-64' : 'aspect-[4/3]'"
          (click)="openImages()"
          i18n-aria-label="@@wish.showImages"
          aria-label="Bilder ansehen"
        >
          <img [src]="w.images[0].thumbUrl" alt="" loading="lazy" decoding="async" class="size-full object-cover transition-transform duration-500 group-hover/img:scale-[1.04]" [class.grayscale]="dimmed()" />
          @if (w.images.length > 1) {
            <span class="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur">
              <ui-icon name="photo_library" [size]="14" />{{ w.images.length }}
            </span>
          }
        </button>
      }

      @if (w.isFavorite) {
        <span class="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-[oklch(0.3_0.06_60)] shadow-md">
          <ui-icon name="favorite-fill" [size]="14" /><span i18n="@@wish.favorite">Herzenswunsch</span>
        </span>
      }

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex flex-1 flex-col gap-3 p-5" [class.pt-11]="w.isFavorite && !w.images.length">
          <!-- the punched hole of a gift tag -->
          @if (!w.images.length) {
            <span class="absolute top-4 right-4 size-3 rounded-full border-2 border-line-strong bg-paper" aria-hidden="true"></span>
          }
          <h3
            [id]="'wish-' + w.id"
            class="display pr-6 text-xl leading-tight break-words"
            [class]="dimmed() ? 'line-through decoration-ink-muted decoration-2' : ''"
          >
            {{ w.name }}
          </h3>
          @if (stamp()) {
            <!-- Struck through and stamped: unmistakable, also for people who skim. -->
            <span class="-mt-1 inline-flex w-fit rotate-[-3deg] items-center gap-1.5 rounded-lg border-2 border-current px-2.5 py-0.5 text-sm font-bold tracking-wide text-ink-muted uppercase">
              <ui-icon [name]="stampIcon()" [size]="16" />{{ stamp() }}
            </span>
          }

          <div class="flex flex-wrap items-center gap-1.5">
            @if (w.price !== null) {
              <span class="mr-1 text-[0.9375rem] font-bold text-accent" [class.line-through]="dimmed()" i18n="@@wish.price">ca. {{ currency() }} {{ w.price | number: '1.0-0' }}</span>
            }
            @if (w.quantity === null) {
              <span class="chip" i18n="@@wish.unlimited">gerne mehrere</span>
            } @else if (w.quantity! > 1) {
              <span class="chip" i18n="@@wish.quantity">{{ w.quantity }} Stück</span>
            }
            @if (w.groupGiftAllowed) {
              <span class="chip chip-accent"><ui-icon name="groups" [size]="15" /><span i18n="@@wish.groupPossible">gemeinsam möglich</span></span>
            }
            @if (w.state === 'Fulfilled' && !stamp()) {
              <span class="chip chip-success"><ui-icon name="check" [size]="15" /><span i18n="@@wish.fulfilled">erfüllt</span></span>
            }
          </div>

          @if (w.description) {
            <p class="line-clamp-5 whitespace-pre-line text-[0.9375rem] text-ink-muted">{{ w.description }}</p>
          }

          @if (w.gtin) {
            <a
              [href]="'https://www.google.com/search?tbm=shop&q=' + w.gtin"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
            >
              <ui-icon name="barcode" [size]="18" /><span i18n="@@wish.comparePrices">Preise vergleichen</span>
              <span class="font-normal text-ink-muted">EAN {{ w.gtin }}</span>
              <span class="sr-only" i18n="@@link.newTab">(öffnet in neuem Tab)</span>
            </a>
          }
          @if (w.links.length) {
            <div class="flex flex-col gap-2">
              <span class="sr-only" i18n="@@wish.whereToGet">Wo es das gibt:</span>
              @for (link of w.links; track $index) {
                <app-link-card [link]="link" />
              }
            </div>
          }
          <ng-content select="[cardStatus]" />
        </div>
        <div class="flex flex-wrap items-center justify-end gap-1.5 px-3 pb-3 empty:hidden"><ng-content /></div>
      </div>
    </article>
  `,
})
export class WishCard {
  readonly wish = input.required<Wish>();
  readonly currency = input('CHF');
  /** Taken, fulfilled or removed: greyed out and struck through. */
  readonly dimmed = input(false);
  /** A word stamped onto the card, e.g. "Vergeben". */
  readonly stamp = input<string | null>(null);
  readonly stampIcon = input('lock');
  readonly wide = input(false);
  readonly #dialogs = inject(Dialogs);

  protected openImages() {
    this.#dialogs.open<ImageViewer, ImageViewerData>(ImageViewer, {
      data: { images: this.wish().images, title: this.wish().name },
      size: 'viewer',
    });
  }
}
