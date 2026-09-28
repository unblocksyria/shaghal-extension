import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ar } from '../locales/ar';
import { en } from '../locales/en';
import {
  activeLanguage,
  applyLanguage,
  applyStoredLanguage,
  directionOf,
  i18next,
  intlLocale,
  setLanguagePreference,
  sitePathSegment,
} from './i18n';

// The i18next instance is shared by every test in this file.
afterEach(() => applyLanguage('en'));

function browserSpeaking(uiLanguage: string | (() => string)): void {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  const getUILanguage = typeof uiLanguage === 'string' ? () => uiLanguage : uiLanguage;
  Object.assign(fakeBrowser, { i18n: { getUILanguage } });
}

describe('the stored language', () => {
  it('keeps the startup language where there is no extension storage', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(await applyStoredLanguage()).toBe('en');
    expect(activeLanguage()).toBe('en');
  });

  it('applies a saved pick', async () => {
    browserSpeaking('en-US');
    await fakeBrowser.storage.local.set({ language: 'ar' });
    expect(await applyStoredLanguage()).toBe('ar');
    expect(activeLanguage()).toBe('ar');
    expect(i18next.t('common.back')).toBe('رجوع');
  });

  it('follows the browser for System, and saves the choice rather than its outcome', async () => {
    browserSpeaking('ar-SY');
    expect(await setLanguagePreference('system')).toBe('ar');
    expect((await fakeBrowser.storage.local.get('language')).language).toBe('system');

    browserSpeaking('de-DE');
    expect(await setLanguagePreference('system')).toBe('en');

    expect(await setLanguagePreference('ar')).toBe('ar');
    expect((await fakeBrowser.storage.local.get('language')).language).toBe('ar');
  });

  it('falls back to the system language when the browser will not say its own', async () => {
    browserSpeaking(() => {
      throw new Error('unavailable');
    });
    vi.stubGlobal('navigator', { language: 'ar' });
    expect(await setLanguagePreference('system')).toBe('ar');
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(await setLanguagePreference('system')).toBe('en');
  });
});

describe('language facts', () => {
  it('give each language its direction, Intl locale and site path', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(intlLocale('ar')).toBe('ar');
    expect(intlLocale('en')).toBe('en-GB');
    expect(sitePathSegment('ar')).toBe('/ar');
    expect(sitePathSegment('en')).toBe('/en');
  });
});

/** Every `a.b.c` key with a string value. */
function leaves(value: object, prefix = ''): [string, string][] {
  return Object.entries(value).flatMap(([key, item]): [string, string][] =>
    typeof item === 'object' && item !== null
      ? leaves(item as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(item)]],
  );
}

// CONTRIBUTING asks for every new string in English and Arabic. The panel
// falls back to English silently, so only a test notices a forgotten one.
describe('the catalogs', () => {
  const english = new Map(leaves(en));
  const arabic = new Map(leaves(ar));

  it('translate every English string into Arabic', () => {
    expect([...english.keys()].filter((key) => !arabic.has(key))).toEqual([]);
  });

  it('add nothing beyond Arabic plural forms of English keys', () => {
    const extra = [...arabic.keys()].filter((key) => !english.has(key));
    for (const key of extra) expect(english.has(key.replace(/_(zero|two|few|many)$/, '_other'))).toBe(true);
  });

  it('carry the same placeholders in both languages, so nothing goes unfilled', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    for (const [key, text] of arabic) {
      const original = english.get(key);
      if (original !== undefined) {
        expect({ key, placeholders: placeholders(text) }).toEqual({ key, placeholders: placeholders(original) });
        continue;
      }
      // An extra plural form may leave a placeholder out ("no votes"), but never invent one.
      const other = english.get(key.replace(/_(zero|two|few|many)$/, '_other')) ?? '';
      for (const name of placeholders(text))
        expect({ key, name, known: placeholders(other) }).toMatchObject({
          known: expect.arrayContaining([name]) as unknown,
        });
    }
  });
});
