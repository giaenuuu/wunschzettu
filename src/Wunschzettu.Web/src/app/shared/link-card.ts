import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WishLink } from '../core/api';
import { UiIcon } from '../ui/icon';
import { hostOf } from './links';

/**
 * Where to get a wish. Online shops show a preview (title and picture from the shop page, fetched by the server);
 * stores show their name and location.
 */
@Component({
  selector: 'app-link-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  host: { class: 'block' },
  template: `
    @let l = link();
    @if (l.kind === 'Online' && l.url) {
      <a
        [href]="l.url"
        target="_blank"
        rel="noopener noreferrer nofollow"
        class="group/link flex items-center gap-3 rounded-2xl border border-line bg-raised p-2 pr-3 text-ink no-underline transition-colors hover:border-accent-line hover:bg-accent-soft/40"
      >
        @if (picture(); as pic) {
          <img
            [src]="pic.url"
            alt=""
            loading="lazy"
            decoding="async"
            class="size-14 shrink-0 rounded-xl"
            [class]="pic.logo ? 'bg-white object-contain p-1.5' : 'bg-sunken object-cover'"
          />
        } @else {
          <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-sunken text-ink-muted"><ui-icon name="language" [size]="24" /></span>
        }
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="line-clamp-2 text-sm leading-snug font-semibold">{{ title() }}</span>
          <span class="truncate text-xs text-ink-muted">
            {{ site() }}@if (l.note) { · {{ l.note }} }
          </span>
        </span>
        <ui-icon name="open_in_new" [size]="18" class="text-ink-muted transition-colors group-hover/link:text-accent" />
        <span class="sr-only" i18n="@@link.newTab">(öffnet in neuem Tab)</span>
      </a>
    } @else {
      <div class="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-2 pr-3">
        <span class="grid size-14 shrink-0 place-items-center rounded-xl bg-gold-soft text-on-gold-soft"><ui-icon name="storefront" [size]="24" /></span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-sm font-semibold">{{ l.label }}</span>
          @if (l.note) {
            <span class="text-xs text-ink-muted">{{ l.note }}</span>
          } @else {
            <span class="text-xs text-ink-muted" i18n="@@link.inStore">im Laden</span>
          }
        </span>
      </div>
    }
  `,
})
export class LinkCard {
  readonly link = input.required<WishLink>();

  /** The owner's choice (product picture or shop logo); if the chosen one doesn't exist, the other. */
  protected readonly picture = computed(() => {
    const l = this.link();
    const p = l.preview;
    if (l.useLogo && p?.logoUrl) return { url: p.logoUrl, logo: true };
    if (p?.imageUrl) return { url: p.imageUrl, logo: false };
    if (p?.logoUrl) return { url: p.logoUrl, logo: true };
    return null;
  });

  protected readonly site = computed(() => {
    const l = this.link();
    return l.label || l.preview?.siteName || hostOf(l.url ?? '');
  });

  protected readonly title = computed(() => {
    const l = this.link();
    return l.preview?.title || l.label || hostOf(l.url ?? '');
  });
}
