import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { UiButton } from '../ui/button';
import { DIALOG_DATA, DialogRef, UiDialog, UiDialogActions } from '../ui/dialog';
import { UiIcon } from '../ui/icon';
import { SegmentOption, UiSegmented } from '../ui/segmented';

export interface CropDialogData {
  /** A URL on this server (or a blob URL) or a file from the device. */
  source: string | Blob;
}

/** The cut-out as a JPEG, or nothing when cancelled. */
export type CropDialogResult = Blob | undefined;

type Aspect = '4:3' | '1:1' | '3:4';
const ratios: Record<Aspect, number> = { '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4 };
const maxEdge = 1600;
const maxZoom = 4;

/**
 * Crop a picture: drag it under the frame, zoom with the slider, the mouse wheel or two fingers, pick the frame's shape.
 * Everything happens in the browser; the server only receives the result (ARCHITECTURE §10).
 */
@Component({
  selector: 'app-image-cropper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiDialog, UiDialogActions, UiButton, UiIcon, UiSegmented],
  template: `
    <ui-dialog i18n-title="@@crop.title" title="Bild zuschneiden">
      <div class="flex flex-col gap-4">
        @if (error(); as message) {
          <p class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert">{{ message }}</p>
        } @else {
          <div
            #frame
            class="relative mx-auto touch-none overflow-hidden rounded-2xl bg-sunken select-none"
            [class]="dragging() ? 'cursor-grabbing' : 'cursor-grab'"
            [style.aspect-ratio]="ratio()"
            [style.width]="'min(100%, ' + 56 * ratio() + 'dvh)'"
            tabindex="0"
            role="img"
            i18n-aria-label="@@crop.frameLabel"
            aria-label="Ausschnitt des Bildes. Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen."
            (pointerdown)="down($event)"
            (pointermove)="move($event)"
            (pointerup)="up($event)"
            (pointercancel)="up($event)"
            (wheel)="wheel($event)"
            (keydown)="key($event)"
          >
            <canvas #canvas class="block size-full"></canvas>
            <!-- thirds, to line things up -->
            <div class="pointer-events-none absolute inset-0" aria-hidden="true">
              <div class="absolute inset-y-0 left-1/3 w-px bg-white/40"></div>
              <div class="absolute inset-y-0 left-2/3 w-px bg-white/40"></div>
              <div class="absolute inset-x-0 top-1/3 h-px bg-white/40"></div>
              <div class="absolute inset-x-0 top-2/3 h-px bg-white/40"></div>
            </div>
            @if (!loaded()) {
              <span class="absolute inset-0 grid place-items-center text-ink-muted" role="status" i18n="@@crop.loading">Bild wird geladen …</span>
            }
          </div>
          <ui-segmented [(value)]="aspect" [options]="aspects" i18n-label="@@crop.shape" label="Form des Ausschnitts" [wide]="true" />
          <label class="flex items-center gap-3 text-sm font-medium text-ink-muted">
            <ui-icon name="zoom_out" [size]="20" />
            <input
              type="range"
              class="min-w-0 flex-1 accent-[var(--color-accent)]"
              min="1"
              [max]="maxZoom"
              step="0.01"
              [value]="zoom()"
              (input)="setZoom($any($event.target).valueAsNumber)"
              i18n-aria-label="@@crop.zoom"
              aria-label="Zoom"
            />
            <ui-icon name="zoom_in" [size]="20" />
          </label>
          <p class="text-sm text-ink-muted" i18n="@@crop.hint">Zieh das Bild an die richtige Stelle. Zum Zoomen: Regler, Mausrad oder zwei Finger.</p>
        }
      </div>
      <footer uiDialogActions>
        <button uiButton variant="ghost" type="button" (click)="ref.close()" i18n="@@common.cancel">Abbrechen</button>
        <button uiButton type="button" [disabled]="!loaded()" [busy]="working()" (click)="apply()" i18n="@@crop.apply">Übernehmen</button>
      </footer>
    </ui-dialog>
  `,
})
export class ImageCropper implements OnDestroy {
  protected readonly data = inject<CropDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<CropDialogResult>>(DialogRef);
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly maxZoom = maxZoom;
  protected readonly aspects: SegmentOption<Aspect>[] = [
    { value: '4:3', label: $localize`:@@crop.landscape:Querformat` },
    { value: '1:1', label: $localize`:@@crop.square:Quadrat` },
    { value: '3:4', label: $localize`:@@crop.portrait:Hochformat` },
  ];
  protected readonly aspect = signal<Aspect>('4:3');
  protected readonly ratio = computed(() => ratios[this.aspect()]);
  protected readonly zoom = signal(1);
  protected readonly loaded = signal(false);
  protected readonly working = signal(false);
  protected readonly dragging = signal(false);
  protected readonly error = signal<string | null>(null);

  readonly #bitmap = signal<ImageBitmap | null>(null);
  /** Centre of the cut-out, in picture pixels. */
  readonly #center = signal({ x: 0, y: 0 });
  readonly #pointers = new Map<number, { x: number; y: number }>();
  #pinch: { distance: number; zoom: number } | null = null;
  #observer?: ResizeObserver;

  /** Size of the cut-out in picture pixels: the largest frame of the chosen shape, divided by the zoom. */
  readonly #cut = computed(() => {
    const bitmap = this.#bitmap();
    if (!bitmap) return null;
    const r = this.ratio();
    let w = bitmap.width;
    let h = w / r;
    if (h > bitmap.height) {
      h = bitmap.height;
      w = h * r;
    }
    return { w: w / this.zoom(), h: h / this.zoom() };
  });

  /** The centre, kept inside the picture. */
  readonly #rect = computed(() => {
    const bitmap = this.#bitmap();
    const cut = this.#cut();
    if (!bitmap || !cut) return null;
    const { x, y } = this.#center();
    const cx = Math.min(Math.max(x, cut.w / 2), bitmap.width - cut.w / 2);
    const cy = Math.min(Math.max(y, cut.h / 2), bitmap.height - cut.h / 2);
    return { sx: cx - cut.w / 2, sy: cy - cut.h / 2, sw: cut.w, sh: cut.h };
  });

  constructor() {
    this.#load();
    afterNextRender(() => {
      const frame = this.frame()?.nativeElement;
      if (frame) {
        this.#observer = new ResizeObserver(() => this.#draw());
        this.#observer.observe(frame);
      }
    });
    effect(() => {
      this.#rect();
      this.canvas();
      this.#draw();
    });
  }

  ngOnDestroy() {
    this.#observer?.disconnect();
    this.#bitmap()?.close();
  }

  async #load() {
    try {
      const source = this.data.source;
      const blob = typeof source === 'string' ? await fetch(source).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))) : source;
      // 'from-image' bakes the phone's EXIF rotation in, so the cut-out matches what people see.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      this.#bitmap.set(bitmap);
      this.#center.set({ x: bitmap.width / 2, y: bitmap.height / 2 });
      this.loaded.set(true);
    } catch {
      this.error.set($localize`:@@crop.failed:Das Bild konnte nicht geladen werden.`);
    }
  }

  #draw() {
    const canvas = this.canvas()?.nativeElement;
    const bitmap = this.#bitmap();
    const rect = this.#rect();
    if (!canvas || !bitmap || !rect) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
  }

  protected setZoom(value: number) {
    this.zoom.set(Math.min(maxZoom, Math.max(1, Number(value))));
  }

  // ---- Dragging, pinching, wheel and keys

  protected down(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragging.set(true);
    if (this.#pointers.size === 2) this.#pinch = { distance: this.#distance(), zoom: this.zoom() };
  }

  protected move(event: PointerEvent) {
    const previous = this.#pointers.get(event.pointerId);
    if (!previous) return;
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.#pointers.size === 2 && this.#pinch) {
      this.setZoom((this.#pinch.zoom * this.#distance()) / this.#pinch.distance);
    } else if (this.#pointers.size === 1) {
      this.#pan(event.clientX - previous.x, event.clientY - previous.y);
    }
  }

  protected up(event: PointerEvent) {
    this.#pointers.delete(event.pointerId);
    this.#pinch = null;
    if (this.#pointers.size === 0) this.dragging.set(false);
  }

  protected wheel(event: WheelEvent) {
    event.preventDefault();
    this.setZoom(this.zoom() * Math.exp(-event.deltaY * 0.0015));
  }

  protected key(event: KeyboardEvent) {
    const cut = this.#cut();
    if (!cut) return;
    const step = 0.05;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      const [dx, dy] = moves[event.key];
      const rect = this.#rect()!;
      this.#center.set({ x: rect.sx + cut.w / 2 + dx * cut.w * step, y: rect.sy + cut.h / 2 + dy * cut.h * step });
    } else if (event.key === '+' || event.key === '=') this.setZoom(this.zoom() + 0.2);
    else if (event.key === '-') this.setZoom(this.zoom() - 0.2);
    else return;
    event.preventDefault();
  }

  #distance() {
    const [a, b] = [...this.#pointers.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  #pan(dx: number, dy: number) {
    const frame = this.frame()?.nativeElement;
    const rect = this.#rect();
    if (!frame || !rect) return;
    // Pixels of the picture per pixel on screen.
    const scale = rect.sw / frame.clientWidth;
    this.#center.set({ x: rect.sx + rect.sw / 2 - dx * scale, y: rect.sy + rect.sh / 2 - dy * scale });
  }

  // ---- Result

  protected async apply() {
    const bitmap = this.#bitmap();
    const rect = this.#rect();
    if (!bitmap || !rect) return;
    this.working.set(true);
    const width = Math.round(Math.min(rect.sw, maxEdge));
    const height = Math.round(width / this.ratio());
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
    // JPEG: every browser can encode it (Safari can't do WebP); the server converts to WebP anyway.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    this.working.set(false);
    if (blob) this.ref.close(blob);
    else this.error.set($localize`:@@crop.exportFailed:Der Ausschnitt konnte nicht erstellt werden.`);
  }
}
