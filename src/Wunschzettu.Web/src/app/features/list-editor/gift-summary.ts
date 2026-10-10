import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Wish, WishGifts } from '../../core/api';
import { UiProgress } from '../../ui/feedback';
import { UiIcon } from '../../ui/icon';

/** Who gives a wish, for managers who aren't the recipient. */
@Component({
  selector: 'app-gift-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, UiIcon, UiProgress],
  host: { class: 'block' },
  template: `
    @let g = gifts();
    <div class="flex flex-col gap-2.5 rounded-2xl bg-sunken p-3">
      @if (!g || g.gifts.length === 0) {
        <span class="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <ui-icon name="radio_button_unchecked" [size]="18" /><span i18n="@@summary.free">noch frei</span>
        </span>
      } @else {
        <span class="inline-flex items-center gap-2 text-sm font-semibold text-accent">
          <ui-icon name="check_circle" [size]="18" />
          @if (wish().quantity === null) {
            <span i18n="@@summary.givenTimes">{{ g.takenUnits }}× verschenkt</span>
          } @else {
            <span i18n="@@summary.taken">{{ g.takenUnits }} von {{ wish().quantity }} vergeben</span>
          }
        </span>
        @for (gift of g.gifts; track gift.giftId) {
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              @if (gift.isGroup) {
                <ui-icon name="groups" [size]="18" class="text-ink-muted" i18n-label="@@gift.groupGift" label="Gemeinsames Geschenk" />
              }
              @for (p of gift.participants; track $index) {
                <span class="chip bg-raised">
                  {{ p.name }}
                  @if (p.amount !== null) { · {{ currency() }} {{ p.amount | number: '1.0-0' }} }
                  @if (p.unconfirmed) { <ui-icon name="schedule" [size]="14" i18n-label="@@gift.unconfirmed" label="unbestätigt" /> }
                </span>
              }
              @if (gift.status === 'Bought') {
                <span class="chip chip-success"><ui-icon name="check" [size]="15" /><span i18n="@@gift.bought">gekauft</span></span>
              }
            </div>
            @if (gift.isGroup && wish().price) {
              <ui-progress [value]="gift.pledgedTotal" [max]="wish().price!" i18n-label="@@gift.pledgedLabel" label="Zugesagter Betrag" />
            }
          </div>
        }
        @if (hasUnconfirmed()) {
          <span class="inline-flex items-start gap-1.5 text-xs text-ink-muted">
            <ui-icon name="schedule" [size]="15" />
            <span i18n="@@summary.unconfirmedHint">E-Mail noch nicht bestätigt. Ohne Bestätigung wird der Wunsch nach 7 Tagen wieder frei.</span>
          </span>
        }
      }
    </div>
  `,
})
export class GiftSummary {
  readonly wish = input.required<Wish>();
  readonly gifts = input<WishGifts>();
  readonly currency = input('CHF');
  protected readonly hasUnconfirmed = computed(() => !!this.gifts()?.gifts.some((g) => g.participants.some((p) => p.unconfirmed)));
}
