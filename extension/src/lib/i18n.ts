import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from '../locales/ar';
import { en, type Catalog } from '../locales/en';
import { ku } from '../locales/ku';
import { getSavedLanguage, LANGUAGES, saveLanguage, type LanguagePreference } from './settings';

/** The languages the panel can render in. */
export type Language = Exclude<LanguagePreference, 'system'>;

export type Direction = 'ltr' | 'rtl';

/** Arabic or Kurdish when the browser UI language is one of them, English otherwise. */
function systemLanguage(): Language {
  let tag: string | undefined;
  try {
    // chrome.i18n is absent outside the browser, as in Node tests.
    tag = typeof chrome !== 'undefined' ? chrome.i18n?.getUILanguage() : undefined;
  } catch {
    tag = undefined;
  }
  const fallback = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const browser = (tag ?? fallback ?? 'en').toLowerCase();
  if (browser.startsWith('ar')) return 'ar';
  return browser.startsWith('ku') ? 'ku' : 'en';
}

/** Only Arabic runs right to left. Kurdish here is Kurmanji, in Latin script. */
export function directionOf(language: Language): Direction {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** The `Intl` services the panel formats with. Kurdish formatting needs Kurdish data in each. */
const INTL_SERVICES: { supportedLocalesOf(locales: string): string[] }[] = [
  Intl.DateTimeFormat,
  Intl.NumberFormat,
  Intl.ListFormat,
  Intl.DisplayNames,
];

/**
 * The `Intl` locale for dates, counts, lists and country names. English uses en-GB
 * formatting, and so does Kurdish in a browser without Kurdish locale data.
 */
export function intlLocale(language: Language): string {
  if (language === 'ar') return 'ar';
  if (language === 'ku' && INTL_SERVICES.every((service) => service.supportedLocalesOf('ku').length > 0)) return 'ku';
  return 'en-GB';
}

/** The `/en`, `/ar` or `/ku` segment of a site link. */
export function sitePathSegment(language: Language): string {
  return `/${language}`;
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    ku: { translation: ku },
  } satisfies Record<Language, unknown>,
  lng: systemLanguage(),
  fallbackLng: 'en',
  returnNull: false,
  interpolation: { escapeValue: false },
});

export { i18next };

/** The language the panel is rendering in. */
export function activeLanguage(): Language {
  return LANGUAGES.find((language) => language === i18next.language) ?? 'en';
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

/** A date as the site writes it, e.g. "1 Sep 2026", in the active locale. Null for no date or a bad one. */
export function shortDate(iso: string | null | undefined): string | null {
  if (iso == null || !Number.isFinite(Date.parse(iso))) return null;
  return new Date(iso).toLocaleDateString(intlLocale(activeLanguage()), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
