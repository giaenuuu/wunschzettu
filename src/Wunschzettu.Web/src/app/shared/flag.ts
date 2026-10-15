import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LanguageOption } from '../core/language';

/**
 * Small inline flags. Flag emojis don't render on Windows (they show as letters), and a flag font would be
 * another download; these are a few shapes each. Decorative: the language name sits next to them.
 */
@Component({
  selector: 'app-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 16" class="block h-4 w-6 rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]">
      @switch (flag()) {
        @case ('ch') {
          <rect width="24" height="16" fill="#d52b1e" />
          <path fill="#fff" d="M10.2 3.5h3.6v3h2.7v3.6h-2.7v3h-3.6v-3H7.5V6.5h2.7z" />
        }
        @case ('de') {
          <rect width="24" height="16" fill="#ffce00" />
          <rect width="24" height="10.67" fill="#dd0000" />
          <rect width="24" height="5.33" fill="#000" />
        }
        @case ('at') {
          <rect width="24" height="16" fill="#ed2939" />
          <rect y="5.33" width="24" height="5.34" fill="#fff" />
        }
        @case ('fr') {
          <rect width="24" height="16" fill="#ed2939" />
          <rect width="16" height="16" fill="#fff" />
          <rect width="8" height="16" fill="#002395" />
        }
        @case ('es') {
          <rect width="24" height="16" fill="#aa151b" />
          <rect y="4" width="24" height="8" fill="#f1bf00" />
        }
        @case ('pt') {
          <rect width="24" height="16" fill="#ff0000" />
          <rect width="9.6" height="16" fill="#006600" />
          <circle cx="9.6" cy="8" r="3" fill="#ffcc00" stroke="#ff0000" stroke-width="0.8" />
        }
        @case ('br') {
          <rect width="24" height="16" fill="#009c3b" />
          <path fill="#ffdf00" d="M12 1.8 22 8 12 14.2 2 8z" />
          <circle cx="12" cy="8" r="3.4" fill="#002776" />
          <path fill="none" stroke="#fff" stroke-width="0.7" d="M8.7 7.2c2.2-.8 4.6-.4 6.6 1" />
        }
        @default {
          <!-- Union Jack -->
          <rect width="24" height="16" fill="#012169" />
          <path stroke="#fff" stroke-width="3.2" d="M0 0l24 16M24 0L0 16" />
          <path stroke="#c8102e" stroke-width="1.4" d="M0 0l24 16M24 0L0 16" />
          <path stroke="#fff" stroke-width="5.2" d="M12 0v16M0 8h24" />
          <path stroke="#c8102e" stroke-width="3" d="M12 0v16M0 8h24" />
        }
      }
    </svg>
  `,
})
export class Flag {
  readonly flag = input.required<LanguageOption['flag']>();
}
