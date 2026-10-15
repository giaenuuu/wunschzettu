/// <reference types="@angular/localize" />

import { registerLocaleData } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { loadTranslations } from '@angular/localize';
import { Language, chosenLanguage } from './app/core/language';

// Runtime i18n: one build, German source texts (Swiss spelling); the other languages are loaded on demand
// (switching reloads the page). Translations must be loaded before any component code runs, hence the dynamic imports below.
//
// Variants override a base: de-DE/de-AT only list what differs from the German source, pt-PT what differs from pt-BR.
const files: Partial<Record<Language, string[]>> = {
  'de-DE': ['de-DE'],
  'de-AT': ['de-AT'],
  en: ['en'],
  fr: ['fr'],
  es: ['es'],
  'pt-BR': ['pt-BR'],
  'pt-PT': ['pt-BR', 'pt-PT'],
};

// Angular's date, number and currency formats per language. Only the chosen one is downloaded.
const localeData: Record<Language, () => Promise<{ default: unknown[] }>> = {
  'de-CH': () => import('@angular/common/locales/de-CH'),
  'de-DE': () => import('@angular/common/locales/de'),
  'de-AT': () => import('@angular/common/locales/de-AT'),
  en: () => import('@angular/common/locales/en'),
  fr: () => import('@angular/common/locales/fr'),
  es: () => import('@angular/common/locales/es'),
  'pt-BR': () => import('@angular/common/locales/pt'),
  'pt-PT': () => import('@angular/common/locales/pt-PT'),
};

const lang = chosenLanguage();
const [translations, data] = await Promise.all([
  Promise.all((files[lang] ?? []).map((name) => fetch(`/i18n/${name}.json`).then((r) => r.json()))),
  localeData[lang](),
]);
if (translations.length) loadTranslations(Object.assign({}, ...translations.map((file) => file.translations)));
registerLocaleData(data.default as Parameters<typeof registerLocaleData>[0]);
document.documentElement.lang = lang;

const [{ App }, { appConfig }] = await Promise.all([import('./app/app'), import('./app/app.config')]);
bootstrapApplication(App, {
  providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: lang }],
}).catch((err) => console.error(err));
