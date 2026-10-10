export type Language = 'de-CH' | 'en';

const storageKey = 'wz.lang';

export function chosenLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'de-CH' || stored === 'en') return stored;
  } catch {
    // private mode
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'de-CH';
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
