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

  it('give every Arabic plural key all six forms', () => {
    const forms = ['zero', 'one', 'two', 'few', 'many', 'other'];
    const bases = new Set(
      [...arabic.keys()].flatMap((key) => {
        const match = /^(.+)_(zero|one|two|few|many|other)$/.exec(key);
        return match ? [match[1]] : [];
      }),
    );
    const missing = [...bases].flatMap((base) =>
      forms.map((form) => `${base}_${form}`).filter((key) => !arabic.has(key)),
    );
    expect(missing).toEqual([]);
  });

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
      if (original !== undefined && !key.endsWith('_one')) {
        expect({ key, placeholders: placeholders(text) }).toEqual({ key, placeholders: placeholders(original) });
        continue;
      }
      // An extra plural form may leave a placeholder out ("no votes"), but never invent one.
      const other = original ?? english.get(key.replace(/_(zero|two|few|many)$/, '_other')) ?? '';
      for (const name of placeholders(text))
        expect({ key, name, known: placeholders(other) }).toMatchObject({
          known: expect.arrayContaining([name]) as unknown,
        });
    }
  });
});

describe('cooldown waits', () => {
  const wait = (key: 'api.cooldownSecond' | 'api.cooldownMinute', count: number) => i18next.t(key, { count });

  it('read naturally in English', () => {
    expect(wait('api.cooldownMinute', 1)).toBe('1 minute');
    expect(wait('api.cooldownSecond', 30)).toBe('30 seconds');
  });

  it('use the Arabic dual, with no Latin text', () => {
    applyLanguage('ar');
    expect(wait('api.cooldownSecond', 2)).toBe('ثانيتين');
    expect(wait('api.cooldownMinute', 2)).toBe('دقيقتين');
    expect(wait('api.cooldownMinute', 1)).toBe('دقيقة واحدة');
    expect(wait('api.cooldownMinute', 5)).toBe('5 دقائق');
    expect(wait('api.cooldownSecond', 30)).toBe('30 ثانية');
    for (const count of [1, 2, 3, 11, 30, 59]) {
      expect(wait('api.cooldownSecond', count)).not.toMatch(/[A-Za-z]/);
    }
  });
});
