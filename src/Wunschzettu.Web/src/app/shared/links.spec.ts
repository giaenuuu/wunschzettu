import { hostOf, nameFromUrl, normalizeUrl, sharedLink, withBrand } from './links';

describe('hostOf', () => {
  it('shows the host without www', () => {
    expect(hostOf('https://www.galaxus.ch/de/s1/product/123')).toBe('galaxus.ch');
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('normalizeUrl', () => {
  it('adds https:// to pasted addresses', () => {
    expect(normalizeUrl(' galaxus.ch/x ')).toBe('https://galaxus.ch/x');
    expect(normalizeUrl('http://shop.example/a?b=1')).toBe('http://shop.example/a?b=1');
  });

  it('rejects what is not a web address', () => {
    for (const input of ['', '   ', 'hello', 'javascript:alert(1)', 'ftp://files.example/x', 'mailto:a@b.ch'])
      expect(normalizeUrl(input)).toBeNull();
  });
});

describe('nameFromUrl', () => {
  it('turns a product slug into words', () => {
    expect(nameFromUrl('https://www.galaxus.ch/de/s3/product/lego-technic-porsche-911-42096-12345678')).toBe('Lego technic porsche 911');
    expect(nameFromUrl('https://shop.example/buecher/der-kleine-prinz.html')).toBe('Der kleine prinz');
  });

  it('gives up on URLs without a descriptive part', () => {
    expect(nameFromUrl('https://shop.example/p/123456')).toBeNull();
    expect(nameFromUrl('https://shop.example/')).toBeNull();
    expect(nameFromUrl('nonsense')).toBeNull();
  });
});

describe('sharedLink', () => {
  it('takes the url parameter', () => {
    expect(sharedLink({ url: 'https://shop.example/p/1', title: 'Laufrad' })).toEqual({ url: 'https://shop.example/p/1', title: 'Laufrad' });
  });

  it('finds the link inside the text, like many Android apps send it', () => {
    expect(sharedLink({ text: 'Schau mal: Woom 1 Laufrad https://shop.example/p/1?x=2' })).toEqual({
      url: 'https://shop.example/p/1?x=2',
      title: 'Schau mal: Woom 1 Laufrad',
    });
  });

  it('copes with nothing useful', () => {
    expect(sharedLink({ text: 'just words' })).toEqual({ url: null, title: 'just words' });
    expect(sharedLink({})).toEqual({ url: null, title: null });
  });
});

describe('withBrand', () => {
  it('adds the brand unless the title already has it', () => {
    expect(withBrand('Technic Porsche', 'LEGO')).toBe('LEGO Technic Porsche');
    expect(withBrand('LEGO Technic Porsche', 'Lego')).toBe('LEGO Technic Porsche');
    expect(withBrand('Laufrad', null)).toBe('Laufrad');
  });
});
