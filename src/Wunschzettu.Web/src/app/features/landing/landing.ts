import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButton } from '../../ui/button';
import { UiProgress } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { InstallGuide } from '../install/install-guide';

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiIcon, UiProgress, InstallGuide],
  template: `
    <!-- Hero -->
    <section class="relative isolate overflow-hidden">
      <div class="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div class="absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-200),transparent)] opacity-70"></div>
        <div class="absolute top-60 -right-40 size-[30rem] rounded-full bg-[radial-gradient(closest-side,var(--color-gold-soft),transparent)]"></div>
        <div class="absolute inset-0 opacity-40 [background-image:radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"></div>
      </div>

      <div class="mx-auto grid max-w-[68rem] items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20 lg:pb-28">
        <div class="animate-rise">
          <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-line bg-raised/80 px-3.5 py-1.5 text-sm font-semibold text-accent shadow-sm backdrop-blur">
            <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60"></span><span class="relative inline-flex size-2 rounded-full bg-accent"></span></span>
            <span i18n="@@landing.badge">Neu: Wünsche direkt aus Shop-Links</span>
          </p>
          <h1 class="display text-[clamp(2.75rem,8vw,5.25rem)]">
            <ng-container i18n="@@landing.title1">Wünsche teilen.</ng-container><br />
            <span class="relative inline-block text-accent">
              <span i18n="@@landing.title2">Überraschungen</span>
              <svg class="absolute -bottom-2 left-0 h-3 w-full text-gold" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 9C60 3 130 2 298 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="[stroke-dasharray:320] [stroke-dashoffset:320] motion-safe:animate-[draw_900ms_500ms_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]" />
              </svg>
            </span><br />
            <ng-container i18n="@@landing.title3">bewahren.</ng-container>
          </h1>
          <p class="mt-7 max-w-[34ch] text-xl text-ink-muted" i18n="@@landing.lead">Erstell eine Wunschliste, schick den Link per WhatsApp – und alle sehen, was noch frei ist. Nur du nicht.</p>
          <div class="mt-9 flex flex-wrap items-center gap-3">
            <a uiButton size="lg" routerLink="/login"><span i18n="@@landing.cta">Wunschliste erstellen</span><ui-icon name="arrow_forward" /></a>
            <a uiButton size="lg" variant="ghost" routerLink="/" fragment="so-gehts" i18n="@@landing.how">So funktioniert's</a>
          </div>
          <ul class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-muted">
            @for (t of trust; track t) {
              <li class="flex items-center gap-1.5"><ui-icon name="check_circle" [size]="18" class="text-success" />{{ t }}</li>
            }
          </ul>
        </div>

        <!-- Two views of the same list: the core idea in one picture. -->
        <div class="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
          <div class="absolute -top-6 -left-2 z-20 text-5xl motion-safe:animate-[float_6s_ease-in-out_infinite]">🎈</div>
          <div class="absolute -right-2 bottom-10 z-20 text-4xl motion-safe:animate-[float_7s_ease-in-out_-2s_infinite]">✨</div>

          <div class="card relative z-10 rotate-[-3deg] p-4 shadow-[var(--shadow-lift)] transition-transform duration-500 hover:rotate-0">
            <div class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-ink-muted uppercase">
              <ui-icon name="group" [size]="16" /><span i18n="@@landing.guestView">So sehen es die Gäste</span>
            </div>
            <div class="flex flex-col gap-2.5">
              <div class="flex items-center gap-3 rounded-2xl bg-sunken p-3">
                <span class="grid size-12 place-items-center rounded-xl bg-raised text-2xl">🚲</span>
                <span class="flex-1"><strong class="block" i18n="@@landing.demoWish1">Laufrad</strong><span class="text-sm text-ink-muted">ca. CHF 129</span></span>
                <span class="chip chip-success"><ui-icon name="lock" [size]="14" /><span i18n="@@landing.demoTaken">Oma</span></span>
              </div>
              <div class="flex flex-col gap-2 rounded-2xl bg-sunken p-3">
                <div class="flex items-center gap-3">
                  <span class="grid size-12 place-items-center rounded-xl bg-raised text-2xl">🛝</span>
                  <span class="flex-1"><strong class="block" i18n="@@landing.demoWish2">Rutschbahn</strong><span class="text-sm text-ink-muted">ca. CHF 240</span></span>
                  <span class="chip chip-accent"><ui-icon name="groups" [size]="14" />3</span>
                </div>
                <ui-progress [value]="170" [max]="240" />
              </div>
              <div class="flex items-center gap-3 rounded-2xl bg-sunken p-3">
                <span class="grid size-12 place-items-center rounded-xl bg-raised text-2xl">📚</span>
                <span class="flex-1"><strong class="block" i18n="@@landing.demoWish3">Bücher</strong><span class="text-sm text-ink-muted" i18n="@@wish.unlimited">gerne mehrere</span></span>
                <span class="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent" i18n="@@landing.demoGive">Ich schenke das</span>
              </div>
            </div>
          </div>

          <div class="card absolute -right-3 -bottom-16 z-10 w-[62%] rotate-[5deg] border-accent-line p-4 shadow-[var(--shadow-lift)] sm:-right-8">
            <div class="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-accent uppercase">
              <ui-icon name="visibility_off" [size]="16" /><span i18n="@@landing.recipientView">Und so du</span>
            </div>
            <div class="flex items-center gap-2 rounded-xl bg-sunken p-2.5"><span class="text-xl">🚲</span><strong class="flex-1 text-sm" i18n="@@landing.demoWish1">Laufrad</strong><span class="text-xl">🙈</span></div>
            <p class="mt-2 text-xs text-ink-muted" i18n="@@landing.recipientNote">Keine Häkchen, keine Namen, keine Spoiler.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Occasions marquee -->
    <div class="overflow-hidden border-y border-line bg-raised py-4" aria-hidden="true">
      <div class="flex w-max gap-10 text-lg font-semibold whitespace-nowrap text-ink-muted motion-safe:animate-[marquee_38s_linear_infinite]">
        @for (o of occasionsTwice; track $index) {
          <span class="flex items-center gap-10">{{ o }}<span class="text-gold">✦</span></span>
        }
      </div>
    </div>

    <!-- How it works -->
    <section id="so-gehts" class="mx-auto max-w-[68rem] scroll-mt-20 px-4 py-24 sm:px-6">
      <p class="mb-2 text-center text-sm font-bold tracking-[0.2em] text-accent uppercase" i18n="@@landing.howKicker">In drei Schritten</p>
      <h2 class="display mx-auto mb-14 max-w-2xl text-center text-4xl sm:text-5xl" i18n="@@landing.howTitle">So einfach geht's</h2>
      <ol class="grid gap-6 md:grid-cols-3">
        @for (s of steps; track s.title; let i = $index) {
          <li class="card relative flex flex-col gap-3 overflow-hidden p-6 pt-16">
            <span class="display absolute -top-3 right-4 text-[7rem] leading-none text-accent-soft select-none" aria-hidden="true">{{ i + 1 }}</span>
            <span class="relative grid size-12 place-items-center rounded-2xl bg-accent text-on-accent"><ui-icon [name]="s.icon" /></span>
            <h3 class="display relative text-2xl">{{ s.title }}</h3>
            <p class="relative text-ink-muted">{{ s.text }}</p>
          </li>
        }
      </ol>
    </section>

    <!-- Features -->
    <section class="bg-sunken/60 py-24">
      <div class="mx-auto max-w-[68rem] px-4 sm:px-6">
        <p class="mb-2 text-sm font-bold tracking-[0.2em] text-accent uppercase" i18n="@@landing.featuresKicker">Durchdacht bis ins Detail</p>
        <h2 class="display mb-12 max-w-2xl text-4xl sm:text-5xl" i18n="@@landing.featuresTitle">Alles, was Schenken leichter macht</h2>
        <div class="grid gap-4 md:grid-cols-6">
          <article class="card flex flex-col gap-3 p-6 md:col-span-4 md:row-span-2">
            <span class="grid size-12 place-items-center rounded-2xl bg-accent-soft text-on-accent-soft"><ui-icon name="visibility_off" /></span>
            <h3 class="display text-3xl" i18n="@@landing.f1Title">Keine Spoiler. Nie.</h3>
            <p class="max-w-lg text-lg text-ink-muted" i18n="@@landing.f1">Wer die Liste bekommt, sieht nie, was schon geschenkt wird – auch nicht in Mails oder Zählern. Erst nach dem Fest kannst du die Dankesliste öffnen, wenn du willst.</p>
            <div class="mt-auto grid grid-cols-2 gap-3 pt-4 text-sm">
              <div class="rounded-2xl bg-sunken p-4"><strong class="mb-1 block" i18n="@@landing.f1GuestsTitle">Gäste</strong><span class="text-ink-muted" i18n="@@landing.f1Guests">sehen, was frei ist, und koordinieren sich.</span></div>
              <div class="rounded-2xl bg-accent-soft p-4 text-on-accent-soft"><strong class="mb-1 block" i18n="@@landing.f1YouTitle">Du</strong><span i18n="@@landing.f1You">siehst deine Wünsche – und freust dich auf die Überraschung.</span></div>
            </div>
          </article>
          @for (f of features; track f.icon) {
            <article class="card flex flex-col gap-2 p-6 md:col-span-2">
              <span class="mb-1 grid size-11 place-items-center rounded-2xl" [class]="f.tone"><ui-icon [name]="f.icon" /></span>
              <h3 class="text-lg font-bold">{{ f.title }}</h3>
              <p class="text-ink-muted">{{ f.text }}</p>
            </article>
          }
        </div>
      </div>
    </section>

    <!-- PWA -->
    <section id="app" class="mx-auto grid max-w-[68rem] scroll-mt-20 items-center gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2 [&>*]:min-w-0">
      <div>
        <p class="mb-2 text-sm font-bold tracking-[0.2em] text-accent uppercase" i18n="@@landing.appKicker">Ohne App Store</p>
        <h2 class="display mb-5 text-4xl sm:text-5xl" i18n="@@landing.appTitle">Wunschzettu auf dem Home-Bildschirm</h2>
        <p class="mb-6 text-lg text-ink-muted" i18n="@@landing.appText">Wunschzettu ist eine Web-App: einmal hinzufügen, und sie startet wie jede andere App – mit eigenem Symbol und ohne Browser-Leiste.</p>
        <a uiButton variant="outline" routerLink="/app"><ui-icon name="mobile_arrow_down" [size]="18" /><span i18n="@@landing.appMore">Ausführliche Anleitung</span></a>
      </div>
      <div class="card p-5 sm:p-6"><app-install-guide /></div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6">
      <h2 class="display mb-8 text-center text-4xl" i18n="@@landing.faqTitle">Fragen &amp; Antworten</h2>
      <div class="flex flex-col gap-3">
        @for (q of faq; track q.q) {
          <details class="card group overflow-hidden" name="faq">
            <summary class="flex cursor-pointer list-none items-center gap-3 p-5 font-semibold select-none [&::-webkit-details-marker]:hidden">
              <span class="flex-1">{{ q.q }}</span>
              <span class="grid size-8 place-items-center rounded-full bg-sunken transition-transform group-open:rotate-45"><ui-icon name="add" [size]="18" /></span>
            </summary>
            <p class="px-5 pb-5 text-ink-muted">{{ q.a }}</p>
          </details>
        }
      </div>
    </section>

    <!-- Closing CTA -->
    <section class="px-4 pb-24 sm:px-6">
      <div class="relative mx-auto max-w-[68rem] overflow-hidden rounded-[2rem] bg-accent px-6 py-14 text-center text-on-accent sm:px-12">
        <div class="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(white_1.5px,transparent_1.5px)] [background-size:24px_24px]" aria-hidden="true"></div>
        <span class="relative text-5xl" aria-hidden="true">🎁</span>
        <h2 class="display relative mx-auto mt-4 max-w-xl text-4xl sm:text-5xl" i18n="@@landing.finalTitle">Dein nächster Wunschzettel wartet.</h2>
        <p class="relative mx-auto mt-4 max-w-md opacity-90" i18n="@@landing.finalText">In einer Minute erstellt. Kostenlos, ohne Passwort, ohne Werbung.</p>
        <a uiButton variant="secondary" size="lg" routerLink="/login" class="relative mt-8"><span i18n="@@landing.cta">Wunschliste erstellen</span><ui-icon name="arrow_forward" /></a>
      </div>
    </section>
  `,
})
export class Landing {
  protected readonly trust = [
    $localize`:@@landing.trust1:Kostenlos`,
    $localize`:@@landing.trust2:Ohne Passwort`,
    $localize`:@@landing.trust3:Gäste ohne Konto`,
    $localize`:@@landing.trust4:Ohne Werbung`,
  ];

  readonly #occasions = [
    $localize`:@@landing.o1:🎂 Geburtstag`,
    $localize`:@@landing.o2:🎄 Weihnachten`,
    $localize`:@@landing.o3:💍 Hochzeit`,
    $localize`:@@landing.o4:👶 Geburt`,
    $localize`:@@landing.o5:🐣 Ostern`,
    $localize`:@@landing.o6:🏠 Einzug`,
    $localize`:@@landing.o7:🎓 Abschluss`,
    $localize`:@@landing.o8:🕯️ Taufe`,
    $localize`:@@landing.o9:🎅 Samichlaus`,
  ];
  /** Two copies side by side, so the marquee loops without a gap. */
  protected readonly occasionsTwice = [...this.#occasions, ...this.#occasions];

  protected readonly steps = [
    {
      icon: 'edit_note',
      title: $localize`:@@landing.step1Title:Liste anlegen`,
      text: $localize`:@@landing.step1:Link aus dem Online-Shop einfügen – Name, Preis und Bild füllen sich von selbst. Oder einfach aufschreiben.`,
    },
    {
      icon: 'share',
      title: $localize`:@@landing.step2Title:Link teilen`,
      text: $localize`:@@landing.step2:Per WhatsApp, Mail oder Familienchat. Alle öffnen die Liste sofort, ohne Anmeldung.`,
    },
    {
      icon: 'celebration',
      title: $localize`:@@landing.step3Title:Freuen`,
      text: $localize`:@@landing.step3:Gäste reservieren mit Name und E-Mail. Doppelte Geschenke gibt's nicht mehr.`,
    },
  ];

  protected readonly features = [
    {
      icon: 'groups',
      tone: 'bg-gold-soft text-on-gold-soft',
      title: $localize`:@@landing.f2Title:Gemeinsam schenken`,
      text: $localize`:@@landing.f2:Für grosse Wünsche legen mehrere zusammen – mit Fortschrittsbalken statt Chat-Chaos.`,
    },
    {
      icon: 'wand_stars',
      tone: 'bg-accent-soft text-on-accent-soft',
      title: $localize`:@@landing.f3Title:Aus Link erstellen`,
      text: $localize`:@@landing.f3:Shop-Link einfügen oder direkt aus der Shop-App teilen – Name, Preis, Bilder und EAN werden übernommen.`,
    },
    {
      icon: 'lock_open',
      tone: 'bg-success-soft text-success',
      title: $localize`:@@landing.f4Title:Gäste ohne Konto`,
      text: $localize`:@@landing.f4:Der Link genügt. Wer etwas schenkt, gibt nur Name und E-Mail an.`,
    },
    {
      icon: 'storefront',
      tone: 'bg-sunken text-ink',
      title: $localize`:@@landing.f5Title:Online oder im Laden`,
      text: $localize`:@@landing.f5:Sag, wo es das gibt: Shop-Link oder Laden um die Ecke.`,
    },
    {
      icon: 'supervisor_account',
      tone: 'bg-gold-soft text-on-gold-soft',
      title: $localize`:@@landing.f6Title:Zusammen verwalten`,
      text: $localize`:@@landing.f6:Eltern führen die Liste gemeinsam, die Kinder ergänzen eigene Wünsche.`,
    },
    {
      icon: 'favorite',
      tone: 'bg-accent-soft text-on-accent-soft',
      title: $localize`:@@landing.f7Title:Dankesliste`,
      text: $localize`:@@landing.f7:Nach dem Fest siehst du auf Wunsch, wer was geschenkt hat – samt lieben Grüssen.`,
    },
  ];

  protected readonly faq = [
    {
      q: $localize`:@@landing.q1:Kostet Wunschzettu etwas?`,
      a: $localize`:@@landing.a1:Nein. Wunschzettu ist kostenlos und zeigt keine Werbung. Es läuft auf einem eigenen, kleinen Server.`,
    },
    {
      q: $localize`:@@landing.q2:Brauchen meine Gäste ein Konto?`,
      a: $localize`:@@landing.a2:Nein. Sie öffnen den Link und sehen die Liste. Wer etwas reserviert, gibt Name und E-Mail an und bestätigt mit einem Klick in der Mail.`,
    },
    {
      q: $localize`:@@landing.q3:Kann ich wirklich nicht sehen, was schon reserviert ist?`,
      a: $localize`:@@landing.a3:Genau. Weder in der Liste noch in Mails oder Zählern. Nach dem Anlass kannst du die Dankesliste öffnen – nur, wenn du willst.`,
    },
    {
      q: $localize`:@@landing.q4:Brauche ich ein Passwort?`,
      a: $localize`:@@landing.a4:Nein, du meldest dich mit einem Code per Mail an. Wer möchte, kann im Profil zusätzlich ein Passwort setzen.`,
    },
    {
      q: $localize`:@@landing.q5:Warum klappt «Aus Link erstellen» nicht bei jedem Shop?`,
      a: $localize`:@@landing.a5:Manche Shops sperren automatische Abrufe. Dann übernehmen wir den Link, und du ergänzt Name und Preis selbst.`,
    },
    {
      q: $localize`:@@landing.q6:Was passiert mit meinen Daten?`,
      a: $localize`:@@landing.a6:Sie bleiben auf dem Server, auf dem Wunschzettu läuft. Kein Tracking, keine Weitergabe. Bilder werden beim Hochladen von Metadaten wie dem Aufnahmeort befreit.`,
    },
  ];
}
