import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The centered card of the sign-in pages, on a soft confetti background. */
@Component({
  selector: 'app-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden' },
  template: `
    <div class="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      <div class="absolute -top-24 -left-24 size-80 rounded-full bg-brand-200/50 blur-3xl"></div>
      <div class="absolute top-40 -right-24 size-72 rounded-full bg-gold-soft blur-3xl"></div>
    </div>
    <div class="page page-narrow pt-[6vh]">
      <section class="card flex animate-rise flex-col items-center gap-4 px-6 py-9 text-center sm:px-10">
        <span class="stamp size-20 text-4xl" aria-hidden="true">{{ emoji() }}</span>
        <ng-content />
      </section>
    </div>
  `,
})
export class AuthCard {
  readonly emoji = input('👋');
}
