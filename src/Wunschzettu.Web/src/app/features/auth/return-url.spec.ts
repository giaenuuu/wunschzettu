import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps local paths', () => {
    expect(safeReturnUrl('/l/abc')).toBe('/l/abc');
    expect(safeReturnUrl('/lists/1/edit?x=1')).toBe('/lists/1/edit?x=1');
  });

  it('rejects anything that could leave the site', () => {
    for (const url of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined])
      expect(safeReturnUrl(url)).toBe('/');
  });
});
