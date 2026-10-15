import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { applyEach, applyWhenValue, form, FormField, FormRoot, max, maxLength, min, required, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { LinkKind, ScrapeResult, Wish, WishImage, WishRequest } from '../../core/api';
import { problemMessage, problemType } from '../../core/problems';
import { LinkCard } from '../../shared/link-card';
import { hostOf, nameFromUrl, normalizeUrl, previewImageUrl, withBrand } from '../../shared/links';
import { UiButton } from '../../ui/button';
import { DIALOG_DATA, DialogRef, UiDialog, UiDialogActions } from '../../ui/dialog';
import { UiControl, UiField } from '../../ui/field';
import { UiIcon } from '../../ui/icon';
import { SegmentOption, UiSegmented } from '../../ui/segmented';
import { UiSwitch } from '../../ui/switch';

export interface WishDialogData {
  listId: string;
  currency: string;
  wish?: Wish;
  /** A link shared from another app (see /share): read right away, with its title as the fallback name. */
  shared?: { url: string; title: string | null };
}

const maxImages = 5;
const maxLinks = 10;

/** A picture that isn't saved yet: a file from the device or a picture found on the shop page. */
type PendingImage = { kind: 'file'; file: File; preview: string } | { kind: 'remote'; url: string };

type QuantityMode = 'exact' | 'unlimited';

interface LinkModel {
  kind: LinkKind;
  url: string;
  label: string;
  note: string;
}

/**
 * Create or edit a wish. A new wish starts either from a shop link (the server reads the page and we prefill
 * name, description, price, pictures and the link) or from an empty form (ARCHITECTURE §4 Wish, WishLink).
 */
@Component({
  selector: 'app-wish-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormRoot, FormField, UiDialog, UiDialogActions, UiButton, UiControl, UiField, UiIcon, UiSegmented, UiSwitch, LinkCard],
  template: `
    @if (step() === 'start') {
      <ui-dialog i18n-title="@@wishDialog.newTitle" title="Neuer Wunsch" i18n-subtitle="@@wishDialog.startSubtitle" subtitle="Hast du ihn online gesehen? Dann füg den Link ein.">
        <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); fetchFromUrl()">
          <div class="rounded-3xl bg-accent-soft p-5 text-on-accent-soft">
            <div class="mb-3 flex items-center gap-3">
              <span class="grid size-11 place-items-center rounded-2xl bg-accent text-on-accent"><ui-icon name="wand_stars" /></span>
              <div>
                <strong class="block" i18n="@@wishDialog.fromUrlTitle">Aus Link erstellen</strong>
                <span class="text-sm opacity-80" i18n="@@wishDialog.fromUrlText">Wir lesen Name, Preis und Bilder von der Shop-Seite.</span>
              </div>
            </div>
            <label for="wish-url" class="sr-only" i18n="@@wishDialog.urlLabel">Link zum Produkt</label>
            <div class="flex flex-col gap-2 sm:flex-row">
              <input
                #urlInput
                id="wish-url"
                class="control flex-1"
                type="url"
                inputmode="url"
                autocomplete="url"
                placeholder="https://…"
                [value]="url()"
                (input)="url.set($any($event.target).value); urlError.set(null)"
                (paste)="onPaste($event)"
                [attr.aria-invalid]="urlError() ? 'true' : null"
                [attr.aria-describedby]="urlError() ? 'wish-url-error' : null"
              />
              <button uiButton type="submit" [busy]="fetching()" [disabled]="!url().trim()">
                <span i18n="@@wishDialog.fetch">Infos holen</span>
              </button>
            </div>
            @if (urlError()) {
              <p id="wish-url-error" class="mt-2 text-sm font-medium text-danger" role="alert">{{ urlError() }}</p>
            }
            @if (fetching()) {
              <p class="mt-2 text-sm" role="status" i18n="@@wishDialog.fetching">Seite wird gelesen …</p>
            }
          </div>
          <div class="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
            <span class="h-px flex-1 bg-line"></span><span i18n="@@common.or">oder</span><span class="h-px flex-1 bg-line"></span>
          </div>
          <button type="button" class="card card-link flex cursor-pointer items-center gap-3 p-4 text-left" (click)="goTo('form')">
            <span class="grid size-11 place-items-center rounded-2xl bg-sunken"><ui-icon name="edit_note" /></span>
            <span class="flex-1">
              <strong class="block" i18n="@@wishDialog.blankTitle">Selbst ausfüllen</strong>
              <span class="text-sm text-ink-muted" i18n="@@wishDialog.blankText">Nur ein Name genügt – alles andere ist freiwillig.</span>
            </span>
            <ui-icon name="chevron_right" class="text-ink-muted" />
          </button>
        </form>
      </ui-dialog>
    } @else {
      <form [formRoot]="form" class="contents">
        <ui-dialog [title]="data.wish ? editTitle : newTitle">
          <div class="flex flex-col gap-7">
            @if (!data.wish && !imported() && !importFailed()) {
              <button uiButton variant="ghost" size="sm" type="button" class="-mt-3 -mb-4 self-start" (click)="goTo('start')">
                <ui-icon name="wand_stars" [size]="18" /><span i18n="@@wishDialog.backToLink">Doch aus Link ausfüllen</span>
              </button>
            }
            @if (imported(); as source) {
              <p class="notice notice-accent items-center" role="status">
                <ui-icon name="wand_stars" />
                <span class="flex-1" i18n="@@wishDialog.imported">Von {{ source }} übernommen. Prüf kurz die Angaben.</span>
              </p>
              @if (availability() === 'OutOfStock') {
                <p class="notice notice-warn items-center" role="status">
                  <ui-icon name="production_quantity_limits" />
                  <span class="flex-1" i18n="@@wishDialog.outOfStock">Laut {{ source }} ist das gerade ausverkauft.</span>
                </p>
              } @else if (availability() === 'PreOrder') {
                <p class="notice items-center" role="status">
                  <ui-icon name="schedule" />
                  <span class="flex-1" i18n="@@wishDialog.preOrder">Bei {{ source }} erst vorbestellbar.</span>
                </p>
              }
            } @else if (importFailed(); as source) {
              <p class="notice notice-warn" role="status">
                <ui-icon name="info" />
                <span class="flex-1" i18n="@@wishDialog.importFailed">{{ source }} lässt uns die Seite nicht lesen. Der Link ist übernommen – den Rest füllst du selbst aus.</span>
              </p>
            }

            <fieldset class="flex flex-col gap-4">
              <legend class="sr-only" i18n="@@wishDialog.basics">Angaben</legend>
              <ui-field i18n-label="@@wish.name" label="Was wünschst du dir?">
                <input #nameInput uiControl [formField]="form.name" i18n-placeholder="@@wish.namePlaceholder" placeholder="z.B. Laufrad, rot" />
              </ui-field>
              <ui-field i18n-label="@@wish.description" label="Beschreibung" [optional]="true">
                <textarea uiControl rows="3" [formField]="form.description" i18n-placeholder="@@wish.descriptionPlaceholder" placeholder="Grösse, Farbe, Modell …"></textarea>
              </ui-field>
              <ui-field i18n-label="@@wish.priceLabel" label="Preis ca." [optional]="true" [prefix]="data.currency" class="sm:max-w-[calc(50%-0.5rem)]">
                <input uiControl type="number" inputmode="decimal" [formField]="form.price" />
              </ui-field>
              <details class="group rounded-2xl" [open]="!!form.gtin().value()">
                <summary class="flex w-fit cursor-pointer list-none items-center gap-1 rounded-full py-1 text-sm font-semibold text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                  <ui-icon name="keyboard_arrow_down" [size]="18" class="transition-transform group-open:rotate-180" /><span i18n="@@wishDialog.more">Mehr Angaben</span>
                </summary>
                <ui-field i18n-label="@@wish.gtinLabel" label="EAN (Strichcode-Nummer)" [optional]="true" i18n-hint="@@wish.gtinHint" hint="Damit man es auch in anderen Shops findet." class="mt-3 sm:max-w-[calc(50%-0.5rem)]">
                  <input uiControl inputmode="numeric" autocomplete="off" [formField]="form.gtin" placeholder="7610…" />
                </ui-field>
              </details>
            </fieldset>

            <fieldset class="flex flex-col gap-1 rounded-3xl bg-sunken/60 p-4">
              <legend class="sr-only" i18n="@@wishDialog.options">Optionen</legend>
              <ui-switch [formField]="form.isFavorite" i18n-description="@@wish.favoriteHint" description="Wird hervorgehoben – das wünschst du dir am meisten."
                ><span i18n="@@wish.favoriteToggle">Herzenswunsch</span></ui-switch
              >
              <ui-switch [formField]="form.multiple" i18n-description="@@wish.multipleHint" description="Zum Beispiel Bücher, Socken oder Gutscheine."
                ><span i18n="@@wish.multipleToggle">Davon gerne mehrere</span></ui-switch
              >
              @if (form.multiple().value()) {
                <div class="mb-2 ml-[3.875rem] flex animate-rise flex-col gap-3">
                  <ui-segmented [formField]="form.quantityMode" [options]="quantityModes" i18n-label="@@wish.quantityMode" label="Wie viele?" />
                  @if (form.quantityMode().value() === 'exact') {
                    <ui-field i18n-label="@@wish.quantityLabel" label="Anzahl" class="max-w-36">
                      <input uiControl type="number" inputmode="numeric" [formField]="form.quantity" />
                    </ui-field>
                  }
                </div>
              }
              <ui-switch [formField]="form.groupGiftAllowed" i18n-description="@@wish.groupHint" description="Mehrere legen für einen grösseren Wunsch zusammen."
                ><span i18n="@@wish.groupToggle">Gemeinsam schenken erlaubt</span></ui-switch
              >
            </fieldset>

            <fieldset class="flex flex-col gap-3">
              <legend class="mb-3 font-semibold" i18n="@@wish.images">Bilder</legend>
              <div class="flex flex-wrap gap-2.5">
                @for (img of images(); track img.id) {
                  <div class="relative size-24 overflow-hidden rounded-2xl bg-sunken">
                    <img [src]="img.thumbUrl" alt="" class="size-full object-cover" />
                    <button type="button" class="thumb-remove" (click)="removeImage(img)" i18n-aria-label="@@wish.removeImage" aria-label="Bild entfernen"><span><ui-icon name="close" [size]="16" /></span></button>
                  </div>
                }
                @for (p of pending(); track $index) {
                  <div class="relative size-24 overflow-hidden rounded-2xl bg-sunken ring-2 ring-accent/40">
                    <img [src]="p.kind === 'file' ? p.preview : previewUrl(p.url)" alt="" class="size-full object-cover" />
                    <button type="button" class="thumb-remove" (click)="removePending(p)" i18n-aria-label="@@wish.removeImage" aria-label="Bild entfernen"><span><ui-icon name="close" [size]="16" /></span></button>
                  </div>
                }
                @if (roomForImages() > 0) {
                  <label
                    class="relative flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-sm font-medium text-ink-muted transition-colors focus-within:border-accent hover:border-accent hover:text-accent"
                  >
                    <input type="file" accept="image/*" multiple class="absolute inset-0 cursor-pointer opacity-0" (change)="addFiles($event)" />
                    <ui-icon name="add_photo_alternate" [size]="26" />
                    <span i18n="@@wish.addImage">Bild</span>
                  </label>
                }
              </div>
              @if (suggestions().length) {
                <div class="flex flex-col gap-2">
                  <span class="text-sm text-ink-muted" i18n="@@wish.suggestions">Bilder von der Shop-Seite – tippe an, um sie zu übernehmen:</span>
                  <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    @for (s of suggestions(); track s) {
                      <button
                        type="button"
                        class="relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-white transition-all"
                        [class]="isPicked(s) ? 'border-accent' : 'border-line opacity-70 hover:opacity-100'"
                        [attr.aria-pressed]="isPicked(s)"
                        (click)="toggleSuggestion(s)"
                        i18n-aria-label="@@wish.useImage"
                        aria-label="Bild übernehmen"
                      >
                        <img [src]="previewUrl(s)" alt="" loading="lazy" (error)="brokenSuggestion(s)" class="size-full object-contain" />
                        @if (isPicked(s)) {
                          <span class="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-accent text-on-accent"><ui-icon name="check" [size]="16" /></span>
                        }
                      </button>
                    }
                  </div>
                </div>
              }
              @if (uploading()) {
                <p class="text-sm text-ink-muted" role="status" i18n="@@wish.uploading">Bilder werden hochgeladen …</p>
              }
            </fieldset>

            <fieldset class="flex flex-col gap-3">
              <legend class="mb-1 font-semibold" i18n="@@wish.whereToBuy">Wo gibt es das?</legend>
              <p class="-mt-1 text-sm text-ink-muted" i18n="@@wish.whereToBuyHint">Hilft beim Besorgen. Online-Links bekommen automatisch eine Vorschau.</p>
              @for (link of form.links; track $index; let i = $index) {
                <div class="flex animate-rise flex-col gap-3 rounded-3xl border border-line bg-raised p-4">
                  <div class="flex items-center gap-2">
                    <ui-segmented [formField]="link.kind" [options]="linkKinds" i18n-label="@@wish.linkKind" label="Art der Bezugsquelle" class="flex-1" />
                    <button uiButton variant="danger-ghost" size="sm" [iconOnly]="true" type="button" (click)="removeLink(i)" i18n-aria-label="@@wish.removeLink" aria-label="Bezugsquelle entfernen">
                      <ui-icon name="delete" />
                    </button>
                  </div>
                  @if (link.kind().value() === 'Online') {
                    <ui-field i18n-label="@@wish.linkUrl" label="Link">
                      <input uiControl type="url" inputmode="url" placeholder="https://…" [formField]="link.url" />
                    </ui-field>
                    @if (savedPreview(link.url().value()); as saved) {
                      <app-link-card [link]="saved" />
                    }
                    <div class="grid gap-3 sm:grid-cols-2">
                      <ui-field i18n-label="@@wish.shopName" label="Shop" [optional]="true">
                        <input uiControl [formField]="link.label" [placeholder]="hostPlaceholder(link.url().value())" />
                      </ui-field>
                      <ui-field i18n-label="@@wish.linkNote" label="Hinweis" [optional]="true">
                        <input uiControl [formField]="link.note" i18n-placeholder="@@wish.linkNotePlaceholder" placeholder="z.B. in Grösse M" />
                      </ui-field>
                    </div>
                  } @else {
                    <div class="grid gap-3 sm:grid-cols-2">
                      <ui-field i18n-label="@@wish.storeName" label="Laden">
                        <input uiControl [formField]="link.label" i18n-placeholder="@@wish.storeNamePlaceholder" placeholder="z.B. Spielwaren Bären" />
                      </ui-field>
                      <ui-field i18n-label="@@wish.storeWhere" label="Wo / Hinweis" [optional]="true">
                        <input uiControl [formField]="link.note" i18n-placeholder="@@wish.storeWherePlaceholder" placeholder="z.B. Marktgasse, Bern" />
                      </ui-field>
                    </div>
                  }
                </div>
              }
              @if (form.links().value().length < maxLinks) {
                <div class="flex flex-wrap gap-2">
                  <button uiButton variant="outline" size="sm" type="button" (click)="addLink('Online')"><ui-icon name="add_link" [size]="18" /><span i18n="@@wish.addOnline">Online-Shop</span></button>
                  <button uiButton variant="outline" size="sm" type="button" (click)="addLink('Store')"><ui-icon name="storefront" [size]="18" /><span i18n="@@wish.addStore">Laden</span></button>
                </div>
              }
            </fieldset>

            @if (error()) {
              <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ error() }}</p>
            }
          </div>
          <footer uiDialogActions>
            @if (form().submitting() && hasNewOnlineLinks()) {
              <span class="mr-auto text-sm text-ink-muted" role="status" i18n="@@wishDialog.loadingPreviews">Link-Vorschau wird geladen …</span>
            }
            <button uiButton variant="ghost" type="button" (click)="ref.close()" i18n="@@common.cancel">Abbrechen</button>
            <button uiButton type="submit" [busy]="form().submitting() || uploading()" i18n="@@common.save">Speichern</button>
          </footer>
        </ui-dialog>
      </form>
    }
  `,
  styles: `
    /* 40px to tap, 28px to see */
    .thumb-remove {
      position: absolute; top: 0; right: 0; display: grid; place-items: center; width: 40px; height: 40px; cursor: pointer;
    }
    .thumb-remove > span {
      display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: rgb(0 0 0 / 0.6); color: white;
    }
  `,
})
export class WishDialog {
  protected readonly data = inject<WishDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<Wish>>(DialogRef);
  readonly #http = inject(HttpClient);
  readonly #injector = inject(Injector);
  private readonly urlInput = viewChild<ElementRef<HTMLInputElement>>('urlInput');
  private readonly nameInput = viewChild('nameInput', { read: ElementRef<HTMLInputElement> });

  protected readonly maxLinks = maxLinks;
  protected readonly newTitle = $localize`:@@wishDialog.newTitle:Neuer Wunsch`;
  protected readonly editTitle = $localize`:@@wishDialog.editTitle:Wunsch bearbeiten`;
  protected readonly linkKinds: SegmentOption<LinkKind>[] = [
    { value: 'Online', label: $localize`:@@wish.kindOnline:Online`, icon: 'language' },
    { value: 'Store', label: $localize`:@@wish.kindStore:Laden`, icon: 'storefront' },
  ];
  protected readonly quantityModes: SegmentOption<QuantityMode>[] = [
    { value: 'exact', label: $localize`:@@wish.quantityExact:Genaue Anzahl` },
    { value: 'unlimited', label: $localize`:@@wish.quantityUnlimited:So viele wie möglich` },
  ];

  protected readonly step = signal<'start' | 'form'>(this.data.wish ? 'form' : 'start');
  protected readonly url = signal('');
  protected readonly urlError = signal<string | null>(null);
  protected readonly fetching = signal(false);
  protected readonly imported = signal<string | null>(null);
  protected readonly importFailed = signal<string | null>(null);
  protected readonly suggestions = signal<string[]>([]);
  protected readonly availability = signal<ScrapeResult['availability']>(null);

  protected readonly error = signal<string | null>(null);
  /** The wish is stored, even if the dialog stays open because a picture failed. */
  readonly saved = signal(false);
  protected readonly uploading = signal(false);
  protected readonly images = signal<WishImage[]>(this.data.wish?.images ?? []);
  protected readonly pending = signal<PendingImage[]>([]);
  protected readonly roomForImages = computed(() => maxImages - this.images().length - this.pending().length);

  readonly #model = signal(toModel(this.data.wish));

  protected readonly form = form(
    this.#model,
    (p) => {
      required(p.name);
      maxLength(p.name, 200);
      maxLength(p.description, 4000);
      min(p.price, 0);
      max(p.price, 1_000_000);
      validate(p.gtin, ({ value }) =>
        value().trim() && !/^(\d{8}|\d{12,14})$/.test(value().replace(/[\s-]/g, ''))
          ? { kind: 'gtin', message: $localize`:@@validation.gtin:Eine EAN hat 8 oder 13 Ziffern.` }
          : null,
      );
      applyWhenValue(p, (m) => m.multiple && m.quantityMode === 'exact', (q) => {
        required(q.quantity);
        min(q.quantity, 2);
        max(q.quantity, 999);
      });
      applyEach(p.links, (l) => {
        maxLength(l.label, 100);
        maxLength(l.note, 500);
        applyWhenValue(l, (v) => v.kind === 'Online', (online) => {
          required(online.url);
          validate(online.url, ({ value }) => (value() && !normalizeUrl(value()) ? { kind: 'url' } : null));
        });
        applyWhenValue(l, (v) => v.kind === 'Store', (store) => required(store.label));
      });
    },
    { submission: { action: async (f) => this.#save(f().value()) } },
  );

  protected readonly hasNewOnlineLinks = computed(() => {
    const before = new Set((this.data.wish?.links ?? []).map((l) => l.url));
    return this.#model().links.some((l) => l.kind === 'Online' && !before.has(normalizeUrl(l.url)));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pending().forEach((p) => p.kind === 'file' && URL.revokeObjectURL(p.preview)));
    if (this.data.shared) {
      this.url.set(this.data.shared.url);
      this.fetchFromUrl();
    }
  }

  /** Switching steps swaps the whole dialog content, so focus moves to the first field of the new step. */
  protected goTo(step: 'start' | 'form') {
    this.step.set(step);
    afterNextRender(() => (step === 'form' ? this.nameInput() : this.urlInput())?.nativeElement.focus(), { injector: this.#injector });
  }

  // ---- Start from a link

  protected onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!normalizeUrl(text)) return;
    event.preventDefault();
    this.url.set(text.trim());
    this.fetchFromUrl();
  }

  protected async fetchFromUrl() {
    const url = normalizeUrl(this.url());
    if (!url) {
      this.urlError.set($localize`:@@wishDialog.badUrl:Das sieht nicht nach einem Link aus. Kopier ihn am besten direkt aus dem Browser.`);
      return;
    }
    this.fetching.set(true);
    this.urlError.set(null);
    try {
      const result = await firstValueFrom(this.#http.post<ScrapeResult>('/api/scrape', { url }));
      this.#applyScrape(result);
    } catch (e) {
      if (problemType(e) === 'invalid-url') {
        this.urlError.set(problemMessage(e));
        return;
      }
      // Many shops block robots. Keep the link and a name guessed from it; the rest is typed by hand.
      this.#model.update((m) => ({ ...m, name: m.name || this.data.shared?.title || (nameFromUrl(url) ?? ''), links: [onlineLink(url)] }));
      this.importFailed.set(hostOf(url));
      this.goTo('form');
    } finally {
      this.fetching.set(false);
    }
  }

  #applyScrape(r: ScrapeResult) {
    const priceFits = r.price !== null && (!r.currency || r.currency.toUpperCase() === this.data.currency);
    this.#model.update((m) => ({
      ...m,
      name: withBrand(r.title ?? this.data.shared?.title ?? nameFromUrl(r.url) ?? '', r.brand).slice(0, 200),
      description: (r.description ?? '').slice(0, 4000),
      price: priceFits ? Math.round(r.price!) : null,
      gtin: r.gtin ?? m.gtin,
      links: [onlineLink(r.url)],
    }));
    this.suggestions.set(r.images);
    this.availability.set(r.availability);
    if (r.images.length) this.pending.set([{ kind: 'remote', url: r.images[0] }]);
    this.imported.set(r.siteName || hostOf(r.url));
    this.goTo('form');
  }

  protected readonly previewUrl = previewImageUrl;

  /** A picture the server can't read (blocked, not an image) is no use for the wish either: drop it from the offer. */
  protected brokenSuggestion(url: string) {
    this.suggestions.update((list) => list.filter((s) => s !== url));
    this.pending.update((list) => list.filter((p) => !(p.kind === 'remote' && p.url === url)));
  }

  protected isPicked(url: string) {
    return this.pending().some((p) => p.kind === 'remote' && p.url === url);
  }

  protected toggleSuggestion(url: string) {
    if (this.isPicked(url)) this.pending.update((list) => list.filter((p) => !(p.kind === 'remote' && p.url === url)));
    else if (this.roomForImages() > 0) this.pending.update((list) => [...list, { kind: 'remote', url }]);
  }

  // ---- Links

  protected addLink(kind: LinkKind) {
    this.#model.update((m) => ({ ...m, links: [...m.links, { kind, url: '', label: '', note: '' }] }));
  }

  protected removeLink(index: number) {
    this.#model.update((m) => ({ ...m, links: m.links.filter((_, i) => i !== index) }));
  }

  protected hostPlaceholder(url: string) {
    const normalized = normalizeUrl(url);
    return normalized ? hostOf(normalized) : $localize`:@@wish.shopPlaceholder:z.B. Galaxus`;
  }

  /** The preview the server already has for this URL, shown while editing. */
  protected savedPreview(url: string) {
    const normalized = normalizeUrl(url);
    return this.data.wish?.links.find((l) => l.kind === 'Online' && l.url === normalized && l.preview) ?? null;
  }

  // ---- Images

  protected addFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, this.roomForImages());
    input.value = '';
    this.pending.update((p) => [...p, ...files.map((file): PendingImage => ({ kind: 'file', file, preview: URL.createObjectURL(file) }))]);
  }

  protected removePending(p: PendingImage) {
    if (p.kind === 'file') URL.revokeObjectURL(p.preview);
    this.pending.update((list) => list.filter((x) => x !== p));
  }

  protected async removeImage(img: WishImage) {
    try {
      await firstValueFrom(this.#http.delete(`/api/wishes/${this.data.wish!.id}/images/${img.id}`));
      this.images.update((list) => list.filter((i) => i.id !== img.id));
    } catch (e) {
      this.error.set(problemMessage(e));
    }
  }

  // ---- Save

  async #save(v: WishModel) {
    const body: WishRequest = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      price: v.price ?? null,
      gtin: v.gtin.replace(/[\s-]/g, '') || null,
      quantity: !v.multiple ? 1 : v.quantityMode === 'unlimited' ? null : v.quantity,
      isFavorite: v.isFavorite,
      groupGiftAllowed: v.groupGiftAllowed,
      links: v.links.map((l) =>
        l.kind === 'Online'
          ? { kind: 'Online', url: normalizeUrl(l.url), label: l.label.trim() || null, note: l.note.trim() || null }
          : { kind: 'Store', url: null, label: l.label.trim(), note: l.note.trim() || null },
      ),
    };
    this.error.set(null);
    let saved: Wish;
    try {
      saved = await firstValueFrom(
        this.data.wish
          ? this.#http.put<Wish>(`/api/wishes/${this.data.wish.id}`, body)
          : this.#http.post<Wish>(`/api/wishlists/${this.data.listId}/wishes`, body),
      );
    } catch (e) {
      this.error.set(problemMessage(e));
      return;
    }
    this.saved.set(true);

    // The wish is saved; pictures follow. A picture that fails doesn't undo the wish.
    this.uploading.set(true);
    const failed: string[] = [];
    for (const p of this.pending()) {
      try {
        const image =
          p.kind === 'file'
            ? await firstValueFrom(this.#http.post<WishImage>(`/api/wishes/${saved.id}/images`, fileBody(p.file)))
            : await firstValueFrom(this.#http.post<WishImage>(`/api/wishes/${saved.id}/images/import`, { url: p.url }));
        this.images.update((list) => [...list, image]);
      } catch (e) {
        failed.push(problemMessage(e));
      }
    }
    this.uploading.set(false);
    if (failed.length) {
      this.pending.set([]);
      this.error.set($localize`:@@wish.imagesFailed:Der Wunsch ist gespeichert, aber nicht alle Bilder: ${failed[0]}:reason:`);
      // Further saves edit the wish that now exists.
      this.data.wish = { ...saved, images: this.images() };
      return;
    }
    this.ref.close({ ...saved, images: this.images() });
  }
}

type WishModel = ReturnType<typeof toModel>;

function toModel(w?: Wish) {
  const quantity = w?.quantity === undefined ? 1 : w.quantity;
  return {
    name: w?.name ?? '',
    description: w?.description ?? '',
    price: w?.price ?? (null as number | null),
    gtin: w?.gtin ?? '',
    isFavorite: w?.isFavorite ?? false,
    multiple: quantity === null || quantity > 1,
    quantityMode: (quantity === null ? 'unlimited' : 'exact') as QuantityMode,
    quantity: quantity !== null && quantity > 1 ? quantity : 2,
    groupGiftAllowed: w?.groupGiftAllowed ?? false,
    links: (w?.links ?? []).map((l): LinkModel => ({ kind: l.kind, url: l.url ?? '', label: l.label ?? '', note: l.note ?? '' })),
  };
}

function onlineLink(url: string): LinkModel {
  return { kind: 'Online', url, label: '', note: '' };
}

function fileBody(file: File) {
  const body = new FormData();
  body.append('file', file);
  return body;
}
