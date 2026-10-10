import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RelativeDayPipe } from './relative-day.pipe';

describe('RelativeDayPipe', () => {
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('says today, tomorrow and in n days', () => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'en' }] });
    const pipe = TestBed.runInInjectionContext(() => new RelativeDayPipe());
    expect(pipe.transform(iso(0))).toBe('today');
    expect(pipe.transform(iso(1))).toBe('tomorrow');
    expect(pipe.transform(iso(12))).toBe('in 12 days');
    expect(pipe.transform(null)).toBe('');
  });
});
