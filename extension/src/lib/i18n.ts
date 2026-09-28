import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from '../locales/ar';
import { en, type Catalog } from '../locales/en';
import { getSavedLanguage, saveLanguage, type LanguagePreference } from './settings';

/** The languages the panel can render in. */
export type Language = 'en' | 'ar';

export type Direction = 'ltr' | 'rtl';

/** Arabic when the browser UI language is Arabic, English otherwise. */
function systemLanguage(): Language {
  let tag: string | undefined;
  try {
    // chrome.i18n is absent outside the browser, as in Node tests.
    tag = typeof chrome !== 'undefined' ? chrome.i18n?.getUILanguage() : undefined;
  } catch {
    tag = undefined;
  }
  const fallback = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return (tag ?? fallback ?? 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function directionOf(language: Language): Direction {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** The `Intl` locale for dates, counts and country names. English uses en-GB formatting. */
export function intlLocale(language: Language): string {
  return language === 'ar' ? 'ar' : 'en-GB';
}

/** The `/ar` or `/en` segment of a site link. */
export function sitePathSegment(language: Language): string {
  return `/${language}`;
}

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: systemLanguage(),
  fallbackLng: 'en',
  returnNull: false,
  interpolation: { escapeValue: false },
});

export { i18next };

/** The language the panel is rendering in. */
export function activeLanguage(): Language {
  return i18next.language === 'ar' ? 'ar' : 'en';
}

/** Switches i18next and sets `dir` and `lang` on <html> so every element inherits them. */
export function applyLanguage(language: Language): void {
  void i18next.changeLanguage(language);
  if (typeof document === 'undefined') return;
  document.documentElement.dir = directionOf(language);
  document.documentElement.lang = language;
}

/**
 * Applies the saved language, or the browser language when none is saved, and
 * returns it. Without `chrome.storage` it keeps the startup default.
 */
export async function applyStoredLanguage(): Promise<Language> {
  if (typeof chrome === 'undefined' || chrome.storage === undefined) return activeLanguage();
  const preference = await getSavedLanguage();
  const language: Language = preference === 'system' ? systemLanguage() : preference;
  applyLanguage(language);
  return language;
}

/** Saves the preference and applies it. */
export async function setLanguagePreference(preference: LanguagePreference): Promise<Language> {
  await saveLanguage(preference);
  const language: Language = preference === 'system' ? systemLanguage() : preference;
  applyLanguage(language);
  return language;
}

/** Types `t` against the English catalog, so an unknown key is a compile error. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Catalog };
    returnNull: false;
  }
}
