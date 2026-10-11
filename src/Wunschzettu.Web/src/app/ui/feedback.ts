import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** A determinate progress bar, e.g. how much of a group gift is pledged. */
@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-2.5 overflow-hidden rounded-full bg-sunken',
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'clamped()',
    '[attr.aria-label]': 'label()',
  },
  template: `<div class="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent transition-[width] duration-700 ease-out" [style.width.%]="percent()"></div>`,
})
export class UiProgress {
  readonly value = input.required<number>();
  readonly max = input(100);
  readonly label = input<string>();
  protected readonly clamped = computed(() => Math.max(0, Math.min(this.value(), this.max())));
  protected readonly percent = computed(() => (this.max() > 0 ? (this.clamped() / this.max()) * 100 : 0));
}

/** The page is loading: a thin animated bar under the header. */
@Component({
  selector: 'ui-loading-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-1 overflow-hidden bg-accent-soft', role: 'progressbar', 'aria-busy': 'true' },
  template: `<div class="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded-full bg-accent"></div>`,
})
export class UiLoadingBar {}

/** Grey placeholder shapes while content loads, so the layout doesn't jump. */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block animate-pulse rounded-2xl bg-sunken', 'aria-hidden': 'true' },
  template: '',
})
export class UiSkeleton {}

/** "Nothing here yet" with an emoji, a title, a sentence and an optional action (projected). */
@Component({
  selector: 'ui-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-line px-6 py-12 text-center',
  },
  template: `
    <span class="text-5xl leading-none" aria-hidden="true">{{ emoji() }}</span>
    @if (title() && pageHeading()) {
      <h1 class="display text-xl">{{ title() }}</h1>
    } @else if (title()) {
      <strong class="display text-xl">{{ title() }}</strong>
    }
    <div class="max-w-sm text-ink-muted"><ng-content /></div>
    <ng-content select="[uiEmptyAction]" />
  `,
})
export class UiEmpty {
  readonly emoji = input('🎁');
  readonly title = input<string>();
  /** When the empty state is the whole page (e.g. 404), its title is the page's h1. */
  readonly pageHeading = input(false, { transform: booleanAttribute });
}
