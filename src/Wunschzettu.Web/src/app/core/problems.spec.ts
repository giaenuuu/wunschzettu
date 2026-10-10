import { HttpErrorResponse } from '@angular/common/http';
import { problemType } from './problems';

const error = (status: number, body: unknown = null) => new HttpErrorResponse({ status, error: body });

describe('problemType', () => {
  it('reads the type the API puts into problem responses', () => {
    expect(problemType(error(409, { type: 'not-available' }))).toBe('not-available');
  });

  it('falls back to the status for standard problem types', () => {
    expect(problemType(error(409, { type: 'https://tools.ietf.org/html/rfc9110#section-15.5.10' }))).toBe('conflict');
    expect(problemType(error(429))).toBe('rate-limited');
    expect(problemType(error(0))).toBe('offline');
    expect(problemType(error(500))).toBeNull();
    expect(problemType(new Error('x'))).toBeNull();
  });
});
