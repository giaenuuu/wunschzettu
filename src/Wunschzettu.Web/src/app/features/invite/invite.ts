import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AcceptInviteResponse, InvitePeek } from '../../core/api';
import { Auth } from '../../core/auth';
import { problemMessage, problemType } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { UiIcon } from '../../ui/icon';
import { AuthCard } from '../auth/auth-card';

/**
 * Target of an invitation link (ARCHITECTURE §3). Explains what accepting means before anyone signs in,
 * because the link was probably pasted into a chat and the receiver doesn't know the app.
 */
@Component({
  selector: 'app-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiIcon, AuthCard],
  template: `
    @if (state() === 'loading') {
      <app-auth-card emoji="✉️">
        <span class="size-10 animate-spin rounded-full border-4 border-accent border-r-transparent" aria-hidden="true"></span>
        <p class="text-ink-muted" role="status" i18n="@@confirm.working">Einen Moment …</p>
      </app-auth-card>
    } @else if (state() === 'invalid') {
      <app-auth-card emoji="🙈">
        <h1 class="display text-3xl" i18n="@@invite.invalidTitle">Diese Einladung gilt nicht mehr</h1>
        <p class="text-ink-muted" i18n="@@invite.invalid">Der Link ist abgelaufen, wurde schon benutzt oder zurückgezogen. Bitte die Person, dich nochmals einzuladen.</p>
        <a uiButton variant="secondary" routerLink="/" i18n="@@invite.home">Zur Startseite</a>
      </app-auth-card>
    } @else if (peek(); as p) {
      <app-auth-card emoji="🤝">
        <h1 class="display text-3xl">{{ heading() }}</h1>
        <p class="text-ink-muted">{{ what() }}</p>

        <ul class="flex w-full flex-col gap-2 rounded-2xl bg-sunken/70 p-4 text-left text-sm">
          @if (p.role === 'Manager') {
            <li class="flex gap-2"><ui-icon name="edit" [size]="18" /><span i18n="@@invite.canEdit">Wünsche, Einstellungen und Personen ändern</span></li>
            <li class="flex gap-2"><ui-icon name="redeem" [size]="18" /><span i18n="@@invite.canSee">Sehen, wer was schenkt</span></li>
            <li class="flex gap-2"><ui-icon name="person_add" [size]="18" /><span i18n="@@invite.canInvite">Weitere Personen einladen</span></li>
          } @else {
            <li class="flex gap-2"><ui-icon name="add" [size]="18" /><span i18n="@@invite.canAdd">Eigene Wünsche ergänzen und bearbeiten</span></li>
            <li class="flex gap-2"><ui-icon name="visibility_off" [size]="18" /><span i18n="@@invite.cannotSee">Du siehst nie, was schon verschenkt wird – die Überraschung bleibt</span></li>
          }
        </ul>

        @if (error(); as message) {
          <p class="w-full rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ message }}</p>
        }
        @if (auth.confirmed()) {
          <p class="text-sm text-ink-muted" i18n="@@invite.asUser">Du bist angemeldet als {{ auth.user()!.email }}.</p>
          <button uiButton size="lg" [wide]="true" type="button" [busy]="accepting()" (click)="accept()" i18n="@@invite.accept">Einladung annehmen</button>
        } @else {
          <p class="text-sm text-ink-muted" i18n="@@invite.signInHint">Dazu meldest du dich mit deiner E-Mail-Adresse an. Du brauchst kein Passwort, wir schicken dir einen Code.</p>
          <a uiButton size="lg" [wide]="true" routerLink="/login" [queryParams]="{ returnUrl: '/invite/' + token() }" i18n="@@invite.signIn">Anmelden und annehmen</a>
        }
      </app-auth-card>
    }
  `,
})
export class Invite implements OnInit {
  readonly token = input.required<string>();
  protected readonly auth = inject(Auth);
  readonly #http = inject(HttpClient);
  readonly #router = inject(Router);

  protected readonly state = signal<'loading' | 'invalid' | 'ready'>('loading');
  protected readonly peek = signal<InvitePeek | null>(null);
  protected readonly accepting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly heading = computed(() => {
    const p = this.peek();
    if (!p) return '';
    const who = p.inviterName || $localize`:@@members.someone:Jemand`;
    return p.role === 'Manager' ? $localize`:@@invite.titleManager:${who}:who: lädt dich ein` : $localize`:@@invite.titleRecipient:${who}:who: hat eine Liste für dich`;
  });

  protected readonly what = computed(() => {
    const p = this.peek();
    if (!p) return '';
    return p.role === 'Manager'
      ? $localize`:@@invite.whatManager:Du sollst die Wunschliste «${p.listTitle}:title:» mitverwalten.`
      : $localize`:@@invite.whatRecipient:Die Wunschliste «${p.listTitle}:title:» ist für dich.`;
  });

  async ngOnInit() {
    try {
      this.peek.set(await firstValueFrom(this.#http.get<InvitePeek>(`/api/invite-links/${encodeURIComponent(this.token())}`)));
      this.state.set('ready');
    } catch {
      this.state.set('invalid');
    }
  }

  protected async accept() {
    this.accepting.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.#http.post<AcceptInviteResponse>(`/api/invite-links/${encodeURIComponent(this.token())}/accept`, {}));
      await this.#router.navigate(['/lists', res.listId, 'edit']);
    } catch (e) {
      // Someone else was faster, or the link expired meanwhile.
      if (problemType(e) === 'not-found' || (e as { status?: number }).status === 404) this.state.set('invalid');
      else this.error.set(problemMessage(e));
    } finally {
      this.accepting.set(false);
    }
  }
}
