/** "galaxus.ch" for "https://www.galaxus.ch/de/s1/product/…"; the input as is if it isn't a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Accepts what people paste: adds https:// when the scheme is missing; null for anything that isn't a web address. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * A wish name guessed from a product URL, for shops that don't let us read the page:
 * ".../lego-technic-porsche-911-p12345" → "Lego technic porsche 911". Null when the URL says nothing useful.
 */
export function nameFromUrl(url: string): string | null {
  let segments: string[];
  try {
    segments = new URL(url).pathname.split('/').map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  // The most descriptive segment is the one with the most words; ids and short codes lose.
  const words = (s: string) =>
    s
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .split(/[-_+\s]+/)
      .filter((w) => (/\p{L}/u.test(w) || /^\d{1,4}$/.test(w)) && !/^[a-z]?\d{5,}$/i.test(w) && !/^(p|dp|id|art|product|produkt|s\d+)$/i.test(w));
  const best = segments.map(words).sort((a, b) => b.length - a.length)[0] ?? [];
  if (best.length < 2) return null;
  const text = best.join(' ').slice(0, 120);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What another app shared with us (Web Share Target, see manifest.webmanifest). Apps disagree on where the link goes:
 * some use `url`, many put "Product name https://…" into `text`. Returns the link and a usable title.
 */
export function sharedLink(shared: { url?: string | null; text?: string | null; title?: string | null }): { url: string | null; title: string | null } {
  const text = shared.text ?? '';
  const inText = text.match(/https?:\/\/\S+/)?.[0] ?? null;
  const url = normalizeUrl(shared.url ?? '') ?? (inText && normalizeUrl(inText));
  const rest = (inText ? text.replace(inText, '') : text).replace(/\s+/g, ' ').trim();
  const title = (shared.title ?? '').trim() || rest || null;
  return { url, title: title && title !== url ? title.slice(0, 200) : null };
}

/** "LEGO Technic Porsche" from brand "LEGO" and title "Technic Porsche"; titles that already name the brand stay. */
export function withBrand(title: string, brand: string | null | undefined): string {
  if (!brand || title.toLowerCase().includes(brand.toLowerCase())) return title;
  return `${brand} ${title}`;
}

/** A shop picture as the server shows it: fetched and shrunk there, so the browser never contacts the shop. */
export function previewImageUrl(url: string, full = false): string {
  return `/api/scrape/image?${full ? 'full=true&' : ''}url=${encodeURIComponent(url)}`;
}
