import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/** "heute", "morgen", "in 12 Tagen", "vor 3 Tagen" for an ISO date (yyyy-mm-dd). */
@Pipe({ name: 'relativeDay' })
export class RelativeDayPipe implements PipeTransform {
  readonly #format = new Intl.RelativeTimeFormat(inject(LOCALE_ID), { numeric: 'auto' });

  transform(date: string | null | undefined): string {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    const today = new Date();
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
    return this.#format.format(days, 'day');
  }
}
