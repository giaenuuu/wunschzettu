import { Injectable, signal } from '@angular/core';

export type Scheme = 'system' | 'light' | 'dark';

const storageKey = 'wz.scheme';

/** Light, dark or follow the OS. index.html applies the saved choice before first paint. */
@Injectable({ providedIn: 'root' })
export class ColorScheme {
  readonly #scheme = signal<Scheme>(read());
  readonly scheme = this.#scheme.asReadonly();

  set(scheme: Scheme) {
    this.#scheme.set(scheme);
    try {
      if (scheme === 'system') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, scheme);
    } catch {
      // private mode: just don't remember
    }
    document.documentElement.style.colorScheme = scheme === 'system' ? '' : scheme;
  }
}

function read(): Scheme {
  try {
    const s = localStorage.getItem(storageKey);
    return s === 'light' || s === 'dark' ? s : 'system';
  } catch {
    return 'system';
  }
}
