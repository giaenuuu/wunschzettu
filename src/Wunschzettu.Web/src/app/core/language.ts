/** The interface languages. German is the source language (written in Swiss spelling); the other German variants only override what differs. */
export const languages = ['de-CH', 'de-DE', 'de-AT', 'en', 'fr', 'es', 'pt-BR', 'pt-PT'] as const;
export type Language = (typeof languages)[number];

export const defaultLanguage: Language = 'de-CH';

const storageKey = 'wz.lang';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languages as readonly string[]).includes(value);
}

/** Maps what a browser reports (de, de-LI, pt, en-GB, …) to one of ours. */
export function languageFor(tag: string): Language | null {
  const t = tag.toLowerCase();
  if (t === 'de-at') return 'de-AT';
  if (t === 'de-de') return 'de-DE';
  if (t === 'de' || t.startsWith('de-')) return t === 'de' ? 'de-DE' : 'de-CH'; // de-CH, de-LI, …
  if (t === 'pt-pt') return 'pt-PT';
  if (t === 'pt' || t.startsWith('pt-')) return 'pt-BR';
  for (const base of ['en', 'fr', 'es'] as const) if (t === base || t.startsWith(base + '-')) return base;
  return null;
}

export function chosenLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isLanguage(stored)) return stored;
  } catch {
    // private mode
  }
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const found = languageFor(tag);
    if (found) return found;
  }
  return defaultLanguage;
}

/** Translations are loaded at startup (main.ts), so switching reloads the page. */
export function switchLanguage(lang: Language): void {
  try {
    localStorage.setItem(storageKey, lang);
  } catch {
    // private mode
  }
  location.reload();
}

/** German texts (not the translations) are the source; the legal pages exist in German and English only. */
export const isGerman = (lang: Language = chosenLanguage()) => lang.startsWith('de');

export interface LanguageOption {
  code: Language;
  label: string;
  /** Short code for the header button. */
  short: string;
  /** Which flag to draw (see app-flag). */
  flag: 'ch' | 'de' | 'at' | 'gb' | 'fr' | 'es' | 'br' | 'pt';
}

export const languageOptions: readonly LanguageOption[] = [
  { code: 'de-CH', label: 'Deutsch (Schweiz)', short: 'DE', flag: 'ch' },
  { code: 'de-DE', label: 'Deutsch (Deutschland)', short: 'DE', flag: 'de' },
  { code: 'de-AT', label: 'Deutsch (Österreich)', short: 'DE', flag: 'at' },
  { code: 'en', label: 'English', short: 'EN', flag: 'gb' },
  { code: 'fr', label: 'Français', short: 'FR', flag: 'fr' },
  { code: 'es', label: 'Español', short: 'ES', flag: 'es' },
  { code: 'pt-BR', label: 'Português (Brasil)', short: 'PT', flag: 'br' },
  { code: 'pt-PT', label: 'Português (Portugal)', short: 'PT', flag: 'pt' },
];

export const languageOption = (lang: Language): LanguageOption => languageOptions.find((o) => o.code === lang)!;
