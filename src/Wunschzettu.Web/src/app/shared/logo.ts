import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The app mark, inline so it is crisp and needs no request. favicon.svg has the same shape with a gradient;
 * here it is a flat colour, because url(#id) references break with <base href> on some browsers.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64" class="block size-full drop-shadow-sm">
      <rect width="64" height="64" rx="16" fill="#bb2f4c" />
      <path fill="#fff" d="M15 31h34v19a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4Z" />
      <rect x="12" y="22" width="40" height="10" rx="3" fill="#fff" />
      <path fill="#f0b135" d="M29 22h6v32h-6z" />
      <path fill="none" stroke="#f0b135" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"
        d="M32 22c-2.5-6.5-11-8.5-11-3s8.5 3 11 3c2.5 0 11 2.5 11-3s-8.5-3.5-11 3" />
      <path fill="#ffe0e3" d="M52 8l1.3 3.2L56.5 12.5l-3.2 1.3L52 17l-1.3-3.2L47.5 12.5l3.2-1.3z" />
    </svg>
  `,
})
export class Logo {}
