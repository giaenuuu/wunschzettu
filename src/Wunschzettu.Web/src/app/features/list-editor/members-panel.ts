import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Member, MemberRole, WishlistDetail } from '../../core/api';
import { problemMessage } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { Confirmer } from '../../ui/confirm';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { Toaster } from '../../ui/toaster';

/** Co-managers, recipients and invited guests (ARCHITECTURE §3). Guests who joined by giving are never listed. */
@Component({
  selector: 'app-members-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, CdkMenu, CdkMenuItem, CdkMenuTrigger, UiButton, UiControl, UiField, UiIcon, UiSegmented],
  template: `
    <ul class="mb-6 flex flex-col divide-y divide-line">
      @for (m of members.value() ?? []; track m.userId) {
        <li class="flex items-center gap-3 py-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-on-accent-soft" aria-hidden="true">
            {{ (m.displayName || m.email).charAt(0).toUpperCase() }}
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <strong class="truncate">{{ m.displayName || m.email }} @if (m.isMe) { <span class="font-normal text-ink-muted" i18n="@@gift.me">(du)</span> }</strong>
            <span class="truncate text-sm text-ink-muted">{{ m.email }}</span>
            <span class="flex flex-wrap gap-1">
              @if (m.isManager) { <span class="chip chip-accent" i18n="@@members.manager">verwaltet</span> }
              @if (m.isRecipient) { <span class="chip chip-gold" i18n="@@members.recipient">wird beschenkt</span> }
              @if (!m.isManager && !m.isRecipient) { <span class="chip" i18n="@@members.guest">eingeladen</span> }
              @if (!m.confirmed) { <span class="chip chip-warn" i18n="@@members.pending">Einladung offen</span> }
            </span>
          </span>
          <button uiButton variant="ghost" size="sm" [iconOnly]="true" [cdkMenuTriggerFor]="menu" i18n-aria-label="@@members.actions" aria-label="Aktionen für diese Person">
            <ui-icon name="more_vert" />
          </button>
          <ng-template #menu>
            <div cdkMenu class="menu">
              <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="update(m, !m.isManager, m.isRecipient)">
                <ui-icon [name]="m.isManager ? 'remove_moderator' : 'add_moderator'" />
                @if (m.isManager) { <span i18n="@@members.revokeManager">Nicht mehr verwalten</span> } @else { <span i18n="@@members.makeManager">Mitverwalten lassen</span> }
              </button>
              <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="update(m, m.isManager, !m.isRecipient)">
                <ui-icon name="redeem" />
                @if (m.isRecipient) { <span i18n="@@members.notRecipient">Wird nicht beschenkt</span> } @else { <span i18n="@@members.makeRecipient">Wird beschenkt</span> }
              </button>
              <div class="menu-separator"></div>
              <button cdkMenuItem class="menu-item text-danger!" (cdkMenuItemTriggered)="remove(m)">
                <ui-icon name="person_remove" />
                @if (m.isMe) { <span i18n="@@members.leave">Liste verlassen</span> } @else { <span i18n="@@members.remove">Entfernen</span> }
              </button>
            </div>
          </ng-template>
        </li>
      }
    </ul>

    <form [formRoot]="form" class="flex flex-col gap-4 rounded-3xl bg-sunken/60 p-4">
      <strong i18n="@@members.inviteTitle">Jemanden einladen</strong>
      <ui-segmented [formField]="form.role" [options]="roles" i18n-label="@@members.role" label="Als" />
      <p class="-mt-1 text-sm text-ink-muted">{{ roleHint() }}</p>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <ui-field i18n-label="@@members.inviteEmail" label="E-Mail-Adresse" class="flex-1">
          <input uiControl type="email" inputmode="email" autocomplete="off" [formField]="form.email" />
        </ui-field>
        <button uiButton type="submit" [busy]="form().submitting()"><ui-icon name="send" [size]="18" /><span i18n="@@members.invite">Einladen</span></button>
      </div>
    </form>
  `,
})
export class MembersPanel {
  readonly list = input.required<WishlistDetail>();
  readonly #http = inject(HttpClient);
  readonly #toaster = inject(Toaster);
  readonly #confirm = inject(Confirmer);
  readonly #router = inject(Router);

  protected readonly members = httpResource<Member[]>(() => `/api/wishlists/${this.list().id}/members`);
  protected readonly roles: SegmentOption<MemberRole>[] = [
    { value: 'Manager', label: $localize`:@@members.roleManager:Mitverwaltung` },
    { value: 'Recipient', label: $localize`:@@members.roleRecipient:Beschenkt` },
    { value: 'Guest', label: $localize`:@@members.roleGuest:Gast` },
  ];

  readonly #model = signal({ email: '', role: 'Manager' as MemberRole });
  protected readonly form = form(
    this.#model,
    (p) => {
      required(p.email);
      email(p.email);
    },
    {
      submission: {
        action: async (f) => {
          try {
            await firstValueFrom(this.#http.post(`/api/wishlists/${this.list().id}/members`, f().value()));
            this.#toaster.show($localize`:@@members.invited:Einladung verschickt`, { tone: 'success' });
            this.#model.set({ email: '', role: f().value().role });
            this.form().reset();
            this.members.reload();
          } catch (e) {
            this.#toaster.show(problemMessage(e), { tone: 'error' });
          }
        },
      },
    },
  );

  protected readonly roleHint = computed(() => {
    switch (this.#model().role) {
      case 'Manager':
        return $localize`:@@members.hintManager:Kann Wünsche, Einstellungen und Personen bearbeiten.`;
      case 'Recipient':
        return $localize`:@@members.hintRecipient:Kann eigene Wünsche ergänzen, sieht aber nie, was schon verschenkt wird.`;
      default:
        return $localize`:@@members.hintGuest:Für Listen, die nur eingeladene Personen sehen dürfen.`;
    }
  });

  protected async update(m: Member, isManager: boolean, isRecipient: boolean) {
    await this.#run(firstValueFrom(this.#http.put(`/api/wishlists/${this.list().id}/members/${m.userId}`, { isManager, isRecipient })));
  }

  protected async remove(m: Member) {
    const ok = await this.#confirm.ask({
      title: m.isMe ? $localize`:@@members.leaveTitle:Liste verlassen?` : $localize`:@@members.removeTitle:${m.displayName || m.email}:name: entfernen?`,
      confirm: m.isMe ? $localize`:@@members.leave:Liste verlassen` : $localize`:@@members.remove:Entfernen`,
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.#http.delete(`/api/wishlists/${this.list().id}/members/${m.userId}`));
      if (m.isMe) await this.#router.navigateByUrl('/');
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    }
    this.members.reload();
  }

  async #run(request: Promise<unknown>) {
    try {
      await request;
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    }
    this.members.reload();
  }
}
