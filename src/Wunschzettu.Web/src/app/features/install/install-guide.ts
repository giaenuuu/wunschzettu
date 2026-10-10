import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { Platform, Pwa } from '../../core/pwa';
import { UiButton } from '../../ui/button';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { Toaster } from '../../ui/toaster';

interface Step {
  icon: string;
  text: string;
}

/** How to add Wunschzettu to the home screen, for the visitor's platform (switchable). */
@Component({
  selector: 'app-install-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiIcon, UiSegmented],
  host: { class: 'block' },
  template: `
    @if (pwa.installed()) {
      <p class="notice notice-accent items-center"><ui-icon name="celebration" /><span i18n="@@install.already">Du nutzt Wunschzettu schon als App. Schön!</span></p>
    } @else {
      @if (pwa.canPrompt()) {
        <div class="mb-6 flex flex-wrap items-center gap-4 rounded-3xl bg-accent p-5 text-on-accent">
          <span class="flex-1 basis-56"><strong class="block text-lg" i18n="@@install.oneTap">Geht mit einem Tipp</strong>
            <span class="opacity-85" i18n="@@install.oneTapText">Dein Browser kann Wunschzettu direkt installieren.</span></span>
          <button uiButton variant="secondary" size="lg" (click)="install()"><ui-icon name="mobile_arrow_down" /><span i18n="@@install.now">Jetzt installieren</span></button>
        </div>
      }
      <ui-segmented class="mb-5" [options]="platforms" [(value)]="platform" [wide]="true" [stacked]="true" i18n-label="@@install.platform" label="Gerät" />
      <ol class="flex flex-col gap-3">
        @for (s of steps[platform()]; track $index; let i = $index) {
          <li class="flex items-center gap-4 rounded-2xl bg-sunken/70 p-3.5">
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-raised font-bold text-accent shadow-sm">{{ i + 1 }}</span>
            <span class="flex-1">{{ s.text }}</span>
            <ui-icon [name]="s.icon" [size]="26" class="text-ink-muted" />
          </li>
        }
      </ol>
      @if (platform() !== 'ios') {
        <p class="notice notice-accent mt-4 items-center text-sm">
          <ui-icon name="share" [size]="18" />
          <span i18n="@@install.shareTip">Danach steht Wunschzettu im Teilen-Menü: Produkt im Shop oder Browser teilen, Liste wählen, fertig.</span>
        </p>
      }
      @if (platform() === 'desktop') {
        <p class="mt-3 text-sm text-ink-muted" i18n="@@install.firefox">Firefox kann Web-Apps auf dem Computer nicht installieren – ein Lesezeichen tut's auch.</p>
      }
    }
  `,
})
export class InstallGuide {
  protected readonly pwa = inject(Pwa);
  readonly #toaster = inject(Toaster);
  protected readonly platform = linkedSignal<Platform>(() => this.pwa.platform);

  protected readonly platforms: SegmentOption<Platform>[] = [
    { value: 'ios', label: $localize`:@@install.ios:iPhone & iPad`, icon: 'mobile' },
    { value: 'android', label: 'Android', icon: 'android' },
    { value: 'desktop', label: $localize`:@@install.desktop:Computer`, icon: 'computer' },
  ];

  protected readonly steps: Record<Platform, Step[]> = {
    ios: [
      { icon: 'travel_explore', text: $localize`:@@install.ios1:Öffne Wunschzettu in Safari.` },
      { icon: 'ios_share', text: $localize`:@@install.ios2:Tippe unten auf «Teilen» (das Quadrat mit dem Pfeil).` },
      { icon: 'add_box', text: $localize`:@@install.ios3:Wähle «Zum Home-Bildschirm».` },
      { icon: 'check_circle', text: $localize`:@@install.ios4:Tippe auf «Hinzufügen» – fertig!` },
    ],
    android: [
      { icon: 'travel_explore', text: $localize`:@@install.android1:Öffne Wunschzettu in Chrome.` },
      { icon: 'more_vert', text: $localize`:@@install.android2:Tippe oben rechts auf das Menü (⋮).` },
      { icon: 'mobile_arrow_down', text: $localize`:@@install.android3:Wähle «App installieren» oder «Zum Startbildschirm hinzufügen».` },
      { icon: 'check_circle', text: $localize`:@@install.android4:Bestätige mit «Installieren».` },
    ],
    desktop: [
      { icon: 'travel_explore', text: $localize`:@@install.desktop1:Öffne Wunschzettu in Chrome oder Edge.` },
      { icon: 'install_desktop', text: $localize`:@@install.desktop2:Klicke rechts in der Adressleiste auf das Installieren-Symbol.` },
      { icon: 'check_circle', text: $localize`:@@install.desktop3:Bestätige mit «Installieren». Auf dem Mac in Safari: Ablage → «Zum Dock hinzufügen».` },
    ],
  };

  protected async install() {
    if (await this.pwa.install()) this.#toaster.show($localize`:@@install.done:Installiert! Du findest Wunschzettu jetzt bei deinen Apps.`, { tone: 'success' });
  }
}
