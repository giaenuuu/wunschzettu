import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MyGift, Wish, WishAvailability } from '../../core/api';
import { Auth } from '../../core/auth';
import { problemMessage } from '../../core/problems';
import { UiButton } from '../../ui/button';
import { Confirmer } from '../../ui/confirm';
import { Dialogs } from '../../ui/dialog';
import { UiProgress } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';
import { Toaster } from '../../ui/toaster';
import { GiftDialog, GiftDialogData, GiftDialogResult, GiftMode } from './gift-dialog';

/** Gift state and actions of one wish, as a guest sees it (ARCHITECTURE §6 "What each role sees"). */
@Component({
  selector: 'app-gift-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, UiButton, UiIcon, UiProgress],
  host: { class: 'mt-1 flex flex-col gap-3' },
  template: `
    @let a = availability();
    @for (g of mine(); track g.giftId) {
      <section class="flex flex-col gap-3 rounded-2xl border border-accent-line bg-accent-soft/60 p-3.5 text-on-accent-soft">
        <div class="flex flex-wrap items-center gap-2">
          <span class="grid size-8 place-items-center rounded-full bg-accent text-on-accent"><ui-icon [name]="g.isGroup ? 'groups' : 'redeem'" [size]="18" /></span>
          <strong class="flex-1">
            @if (g.isGroup) {
              <ng-container i18n="@@gift.youGiveTogether">Ihr schenkt das gemeinsam</ng-container>
            } @else if (g.units > 1) {
              <ng-container i18n="@@gift.youGiveUnits">Du schenkst {{ g.units }} Stück</ng-container>
            } @else {
              <ng-container i18n="@@gift.youGive">Du schenkst das</ng-container>
            }
          </strong>
          @if (g.status === 'Bought') {
            <span class="chip chip-success"><ui-icon name="check" [size]="15" /><span i18n="@@gift.bought">gekauft</span></span>
          }
        </div>

        @if (g.expiresAt) {
          <p class="notice notice-warn py-2 text-sm">
            <ui-icon name="schedule" [size]="18" />
            <span class="flex flex-1 flex-col items-start gap-1">
              <span i18n="@@gift.confirmBy">Bitte bestätige deine E-Mail bis {{ g.expiresAt | date: 'longDate' }} – den Link findest du in deiner Mailbox.</span>
              <button type="button" class="cursor-pointer font-semibold underline underline-offset-2 disabled:opacity-60" [disabled]="resending()" (click)="resendConfirmation()" i18n="@@gift.resendMail">Mail nochmals senden</button>
            </span>
          </p>
        }

        @if (g.isGroup) {
          <ul class="flex flex-col gap-2 text-sm">
            @for (p of g.participants; track $index) {
              <li class="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
                <span class="inline-flex flex-wrap items-center gap-1.5">
                  {{ p.name }}
                  @if (p.isMe) { <span class="opacity-70" i18n="@@gift.me">(du)</span> }
                  @if (p.isOrganizer) { <span class="chip chip-accent" i18n="@@gift.organizer">organisiert</span> }
                  @if (p.unconfirmed) { <span class="chip" i18n="@@gift.unconfirmed">unbestätigt</span> }
                </span>
                @if (p.amount !== null) {
                  <span class="font-semibold tabular-nums">{{ currency() }} {{ p.amount | number: '1.0-2' }}</span>
                }
                @if (p.message) {
                  <span class="col-span-2 italic opacity-85">«{{ p.message }}»</span>
                }
              </li>
            }
          </ul>
          @if (wish().price) {
            <div class="flex flex-col gap-1.5">
              <ui-progress [value]="g.pledgedTotal" [max]="wish().price!" i18n-label="@@gift.pledgedLabel" label="Zugesagter Betrag" />
              <span class="text-xs opacity-80" i18n="@@gift.pledged">{{ currency() }} {{ g.pledgedTotal | number: '1.0-0' }} von ca. {{ wish().price | number: '1.0-0' }} zugesagt</span>
            </div>
          }
        }

        @if (g.canModify) {
          <div class="flex flex-wrap justify-end gap-1.5">
            @if (g.isOrganizer) {
              @if (g.status === 'Bought') {
                <button uiButton variant="ghost" size="sm" (click)="setBought(g, false)"><ui-icon name="undo" [size]="18" /><span i18n="@@gift.unbuy">Doch nicht gekauft</span></button>
              } @else {
                <button uiButton variant="secondary" size="sm" (click)="setBought(g, true)"><ui-icon name="shopping_bag" [size]="18" /><span i18n="@@gift.markBought">Als gekauft markieren</span></button>
              }
            }
            @if (g.isGroup) {
              <button uiButton variant="ghost" size="sm" (click)="open('edit', g)"><ui-icon name="edit" [size]="18" /><span i18n="@@gift.editContribution">Beitrag</span></button>
            }
            <button uiButton variant="ghost" size="sm" (click)="leave(g)" [disabled]="g.status === 'Bought'" [title]="g.status === 'Bought' ? boughtHint : ''">
              <ui-icon name="close" [size]="18" />
              @if (g.isGroup) {
                <span i18n="@@gift.leave">Aussteigen</span>
              } @else {
                <span i18n="@@gift.withdraw">Zurückziehen</span>
              }
            </button>
          </div>
          @if (g.status === 'Bought') {
            <p class="text-xs opacity-80">{{ boughtHint }}</p>
          }
        } @else {
          <p class="text-sm opacity-80" i18n="@@gift.otherDevice">Das hast du auf einem anderen Gerät gewählt. Bestätige deine E-Mail, um es hier zu ändern.</p>
        }
      </section>
    }

    @if (a && mine().length === 0) {
      <div class="flex flex-col gap-1 text-sm">
        @if (a.available === 0 && !a.openGroup) {
          <span class="inline-flex items-start gap-2 font-semibold text-ink-muted">
            <ui-icon name="lock" [size]="18" />
            <span>
              <ng-container i18n="@@gift.taken">Schon vergeben</ng-container>
              @if (a.givers.length) { <span class="font-normal" i18n="@@gift.by"> von {{ a.givers.join(', ') }}</span> }
              @if (a.hasUnconfirmed) { <span class="font-normal" i18n="@@gift.takenUnconfirmed"> (noch unbestätigt)</span> }
            </span>
          </span>
        } @else {
          @if (a.openGroup) {
            <span class="inline-flex items-center gap-2 font-semibold text-accent"><ui-icon name="groups" [size]="18" />
              <span i18n="@@gift.groupRunning">{a.openGroup.participantCount, plural, =1 {1 Person sammelt schon} other {{{a.openGroup.participantCount}} Personen sammeln schon}}</span>
            </span>
          } @else if (wish().quantity === null && a.takenUnits > 0) {
            <span class="text-ink-muted" i18n="@@gift.alreadyGiven">{{ a.takenUnits }} schon verschenkt</span>
          } @else if (a.available !== null && a.takenUnits > 0) {
            <span class="text-ink-muted" i18n="@@gift.leftOf">noch {{ a.available }} von {{ wish().quantity }} frei</span>
          }
          @if (a.givers.length && a.available !== 0) {
            <span class="text-ink-muted" i18n="@@gift.alreadyIn">Schon dabei: {{ a.givers.join(', ') }}</span>
          }
        }
      </div>
      @if (interactive() && (a.available !== 0 || a.openGroup)) {
        <div class="flex flex-wrap gap-2">
          @if (a.available !== 0) {
            <button uiButton class="flex-1" (click)="open('reserve')"><ui-icon name="redeem" [size]="18" /><span i18n="@@gift.iGive">Ich schenke das</span></button>
          }
          @if (a.openGroup) {
            <button uiButton variant="secondary" class="flex-1" (click)="open('join', undefined, a.openGroup.giftId)"><ui-icon name="group_add" [size]="18" /><span i18n="@@gift.join">Mitmachen</span></button>
          } @else if (wish().groupGiftAllowed && a.available !== 0) {
            <button uiButton variant="secondary" class="flex-1" (click)="open('group')"><ui-icon name="groups" [size]="18" /><span i18n="@@gift.startGroup">Gemeinsam schenken</span></button>
          }
        </div>
      }
    }
  `,
})
export class GiftStatus {
  readonly wish = input.required<Wish>();
  readonly availability = input<WishAvailability>();
  /** Gifts of a removed wish, which carries no availability. */
  readonly removedGifts = input<MyGift[]>();
  readonly token = input.required<string>();
  readonly currency = input('CHF');
  readonly recipientName = input<string | null>(null);
  /** Guests can act; managers browsing the link only see the state. */
  readonly interactive = input(true);
  readonly changed = output<void>();

  readonly #http = inject(HttpClient);
  readonly #dialogs = inject(Dialogs);
  readonly #toaster = inject(Toaster);
  readonly #confirm = inject(Confirmer);
  readonly #auth = inject(Auth);

  protected readonly mine = computed(() => this.removedGifts() ?? this.availability()?.mine ?? []);
  protected readonly boughtHint = $localize`:@@gift.boughtHint:Als gekauft markiert – die Organisatorin oder der Organisator muss es zuerst wieder öffnen.`;

  protected readonly resending = signal(false);

  /** A login mail confirms the address too, which keeps the reservation. */
  protected async resendConfirmation() {
    const email = this.#auth.user()?.email;
    if (!email) return;
    this.resending.set(true);
    try {
      await this.#auth.requestCode(email, `/l/${this.token()}`);
      this.#toaster.show($localize`:@@gift.mailResent:Neue Mail ist unterwegs. Schau auch im Spam-Ordner nach.`, { tone: 'success' });
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    } finally {
      this.resending.set(false);
    }
  }

  protected open(mode: GiftMode, gift?: MyGift, giftId?: string) {
    const data: GiftDialogData = {
      mode,
      token: this.token(),
      wish: this.wish(),
      currency: this.currency(),
      recipientName: this.recipientName(),
      available: this.availability()?.available,
      giftId: gift?.giftId ?? giftId,
      initial: gift ? { amount: gift.amount, message: gift.message } : undefined,
    };
    this.#dialogs.open<GiftDialog, GiftDialogData, GiftDialogResult>(GiftDialog, { data, size: 'sm' }).closed.subscribe((result) => {
      if (!result) return;
      if (result === 'taken') {
        this.#toaster.show($localize`:@@gift.justTaken:Schade – dieser Wunsch wurde gerade vergeben.`, { tone: 'error' });
      } else if (mode !== 'edit') {
        this.#toaster.show(
          this.#auth.confirmed()
            ? $localize`:@@gift.thanks:Danke! Wir haben dir eine Bestätigung geschickt.`
            : $localize`:@@gift.thanksConfirm:Danke! Bitte bestätige noch deine E-Mail – der Link ist in deiner Mailbox.`,
          { tone: 'success', duration: 7000 },
        );
      }
      this.changed.emit();
    });
  }

  protected async setBought(g: MyGift, bought: boolean) {
    const url = `/api/gifts/${g.giftId}/bought`;
    await this.#run(firstValueFrom(bought ? this.#http.post(url, null) : this.#http.delete(url)));
  }

  protected async leave(g: MyGift) {
    const ok = await this.#confirm.ask(
      g.isGroup
        ? { title: $localize`:@@gift.leaveTitle:Beim gemeinsamen Geschenk aussteigen?`, confirm: $localize`:@@gift.leave:Aussteigen`, danger: true }
        : {
            title: $localize`:@@gift.withdrawTitle:Reservation zurückziehen?`,
            message: $localize`:@@gift.withdrawMessage:Der Wunsch wird wieder für alle frei.`,
            confirm: $localize`:@@gift.withdraw:Zurückziehen`,
            danger: true,
          },
    );
    if (ok) await this.#run(firstValueFrom(this.#http.delete(`/api/gifts/${g.giftId}/participants/me`)));
  }

  async #run(request: Promise<unknown>) {
    try {
      await request;
    } catch (e) {
      this.#toaster.show(problemMessage(e), { tone: 'error' });
    }
    this.changed.emit();
  }
}
