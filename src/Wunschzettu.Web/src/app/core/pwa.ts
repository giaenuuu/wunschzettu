import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Toaster } from '../ui/toaster';

/** Chrome's install event; not in the TypeScript DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'desktop';

/**
 * Installing Wunschzettu as an app (ARCHITECTURE §10 PWA) and picking up new versions.
 * Chrome and Edge offer a real install button; Safari and Firefox need the steps from the install guide.
 */
@Injectable({ providedIn: 'root' })
export class Pwa {
  readonly #updates = inject(SwUpdate, { optional: true });
  readonly #toaster = inject(Toaster);
  readonly #prompt = signal<InstallPromptEvent | null>(null);
  readonly #installed = signal(matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

  /** True when the browser can show its own install dialog right now. */
  readonly canPrompt = computed(() => this.#prompt() !== null);
  /** Running as an installed app (no browser chrome). */
  readonly installed = this.#installed.asReadonly();
  readonly platform: Platform = detectPlatform();

  constructor() {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar away; the page offers its own button
      this.#prompt.set(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      this.#prompt.set(null);
      this.#installed.set(true);
    };
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    });
  }

  async install(): Promise<boolean> {
    const prompt = this.#prompt();
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    this.#prompt.set(null);
    return outcome === 'accepted';
  }

  /** Offers a reload once a new version has been downloaded in the background. */
  watchForUpdates(): void {
    const updates = this.#updates;
    if (!updates?.isEnabled) return;
    updates.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') {
        this.#toaster.show($localize`:@@pwa.updateReady:Eine neue Version von Wunschzettu ist bereit.`, {
          action: { label: $localize`:@@pwa.reload:Neu laden`, run: () => location.reload() },
          duration: 60_000,
        });
      }
    });
    updates.unrecoverable.subscribe(() => location.reload());
  }
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
