/// <reference types="@angular/localize" />

import { registerLocaleData } from '@angular/common';
import localeDeCh from '@angular/common/locales/de-CH';
import { LOCALE_ID } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { loadTranslations } from '@angular/localize';
import { chosenLanguage } from './app/core/language';

// Runtime i18n: one build, German source texts, English loaded on demand (switching reloads the page).
// Translations must be loaded before any component code runs, hence the dynamic imports below.
const lang = chosenLanguage();
if (lang === 'en') {
  const file = await fetch('/i18n/en.json').then((r) => r.json());
  loadTranslations(file.translations);
}
registerLocaleData(localeDeCh);
document.documentElement.lang = lang;

const [{ App }, { appConfig }] = await Promise.all([import('./app/app'), import('./app/app.config')]);
bootstrapApplication(App, {
  providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: lang }],
}).catch((err) => console.error(err));
