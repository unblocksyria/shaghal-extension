import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from '../locales/ar';
import { en, type Catalog } from '../locales/en';
import { getSavedLanguage, saveLanguage, type LanguagePreference } from './settings';

/** The languages the panel can render in. */
export type Language = 'en' | 'ar';

/** How the text runs: Arabic reads right to left, English left to right. */
export type Direction = 'ltr' | 'rtl';

/**
 * The stored preference plus the browser language resolved to a real language.
 * `system` means the browser decides: an Arabic UI opens the panel in Arabic
 * (spec 0002, AC-2).
 */
function systemLanguage(): Language {
  let tag: string | undefined;
  try {
    // The extension's own UI language; absent outside a browser, such as in node tests.
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

/**
 * The tag handed to `Intl`, so dates, counts and country names read in the
 * active language: Arabic for Arabic, and English as it is formatted today
 * (spec 0002, AC-8).
 */
export function intlLocale(language: Language): string {
  return language === 'ar' ? 'ar' : 'en-GB';
}

/** The `/ar` or `/en` segment of a site link (spec 0002, AC-9). */
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

/** The language the panel is rendering in right now. */
export function activeLanguage(): Language {
  return i18next.language === 'ar' ? 'ar' : 'en';
}

/** Puts the direction and language tag on the root, so every element inherits them. */
export function applyLanguage(language: Language): void {
  void i18next.changeLanguage(language);
  if (typeof document === 'undefined') return;
  document.documentElement.dir = directionOf(language);
  document.documentElement.lang = language;
}

/**
 * Applies the saved pick, or the browser language when there is none, and
 * returns the language that won. Safe outside a browser: it leaves the
 * synchronous default alone when there is no `chrome.storage`.
 */
export async function applyStoredLanguage(): Promise<Language> {
  if (typeof chrome === 'undefined' || chrome.storage === undefined) return activeLanguage();
  const preference = await getSavedLanguage();
  const language: Language = preference === 'system' ? systemLanguage() : preference;
  applyLanguage(language);
  return language;
}

/** Saves the picker's choice and applies it at once (spec 0002, AC-1). */
export async function setLanguagePreference(preference: LanguagePreference): Promise<Language> {
  await saveLanguage(preference);
  const language: Language = preference === 'system' ? systemLanguage() : preference;
  applyLanguage(language);
  return language;
}

/**
 * The English catalog is the shape `t` checks against, so a typo in a key is a
 * build error rather than a raw key name in front of a tester (spec 0002).
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Catalog };
    returnNull: false;
  }
}
