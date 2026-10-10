import { Palette } from '../core/api';

/** Presets only (ARCHITECTURE §10). Each one maps to a `.palette-*` class in styles.css; `swatch` is a two-tone preview. */
export const palettes: { value: Palette; label: string; swatch: [string, string] }[] = [
  { value: 'Classic', label: $localize`:@@palette.classic:Cranberry`, swatch: ['#c23752', '#ff808f'] },
  { value: 'Forest', label: $localize`:@@palette.forest:Wald`, swatch: ['#2e854d', '#77c28c'] },
  { value: 'Ocean', label: $localize`:@@palette.ocean:Meer`, swatch: ['#0077bd', '#63b6f8'] },
  { value: 'Berry', label: $localize`:@@palette.berry:Beere`, swatch: ['#aa4298', '#e886d4'] },
  { value: 'Sunset', label: $localize`:@@palette.sunset:Abendrot`, swatch: ['#b84c00', '#f68f57'] },
  { value: 'Night', label: $localize`:@@palette.night:Nacht`, swatch: ['#2a2140', '#ad9efd'] },
];

export const paletteClass = (p: Palette) => `palette-${p.toLowerCase()}`;
