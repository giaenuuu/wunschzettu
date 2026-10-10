import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiIcon } from '../../ui/icon';
import { InstallGuide } from './install-guide';

/** /app: Wunschzettu as an installed app (PWA), with the steps for each platform. */
@Component({
  selector: 'app-install-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InstallGuide, UiIcon],
  template: `
    <div class="page page-narrow">
      <header class="mb-8 flex flex-col items-center pt-4 text-center">
        <span class="stamp size-24 text-5xl" aria-hidden="true">📲</span>
        <h1 class="display mt-5 text-4xl" i18n="@@install.title">Wunschzettu als App</h1>
        <p class="mt-3 max-w-md text-ink-muted" i18n="@@install.intro">Kein App Store nötig: Wunschzettu lässt sich direkt aus dem Browser auf den Home-Bildschirm legen.</p>
      </header>

      <ul class="mb-8 grid grid-cols-2 gap-3">
        @for (b of benefits; track b.icon) {
          <li class="card flex flex-col items-center gap-2 p-4 text-center text-sm">
            <span class="grid size-11 place-items-center rounded-2xl bg-accent-soft text-on-accent-soft"><ui-icon [name]="b.icon" /></span>
            {{ b.text }}
          </li>
        }
      </ul>

      <section class="card p-5 sm:p-6" aria-labelledby="install-steps">
        <h2 id="install-steps" class="section-title mb-5" i18n="@@install.how">So geht's</h2>
        <app-install-guide />
      </section>
    </div>
  `,
})
export class InstallPage {
  protected readonly benefits = [
    { icon: 'apps', text: $localize`:@@install.b1:Eigenes Symbol auf dem Home-Bildschirm` },
    { icon: 'bolt', text: $localize`:@@install.b2:Startet schnell, ganz ohne Browser-Leiste` },
    { icon: 'photo_library', text: $localize`:@@install.b3:Bilder bleiben gespeichert, das spart Datenvolumen` },
    { icon: 'share', text: $localize`:@@install.b4:Produkte direkt aus Shop-Apps teilen (Android, Computer)` },
  ];
}
