import { signal } from '@angular/core';

/**
 * Share tokens remembered on this device only (localStorage). Storage can be missing or blocked
 * (private mode, in-app browsers), so every access is guarded and failing means "nothing remembered".
 */
export function deviceList(key: string) {
  const tokens = signal<string[]>(read(key));
  return {
    has: (token: string) => tokens().includes(token),
    add(token: string) {
      if (tokens().includes(token)) return;
      // Bounded, so the list can't grow forever on a shared device.
      tokens.update((t) => [token, ...t].slice(0, 50));
      try {
        localStorage.setItem(key, JSON.stringify(tokens()));
      } catch {
        // Remembered for this visit only.
      }
    },
  };
}

function read(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
