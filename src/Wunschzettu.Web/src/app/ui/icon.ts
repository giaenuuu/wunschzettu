import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A Material Symbol from /icons (copied there by scripts/sync-icons.mjs, which finds `name="…"` on <ui-icon>).
 * Drawn as a CSS mask in `currentColor`: no icon font, no inline SVG markup, cached like any file.
 * Decorative by default; pass `label` when the icon is the only thing that says what something means.
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    class: 'inline-block shrink-0 bg-current align-[-0.2em]',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.mask]': 'mask()',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
})
export class UiIcon {
  readonly name = input.required<string>();
  readonly size = input(20);
  readonly label = input<string>();

  protected readonly mask = computed(() => `url(/icons/${this.name()}.svg) center / contain no-repeat`);
}
