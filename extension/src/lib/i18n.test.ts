import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ar } from '../locales/ar';
import { en } from '../locales/en';
import { ku } from '../locales/ku';
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

  it('applies a saved Kurdish pick', async () => {
    browserSpeaking('ar-SY');
    await fakeBrowser.storage.local.set({ language: 'ku' });
    expect(await applyStoredLanguage()).toBe('ku');
    expect(activeLanguage()).toBe('ku');
    expect(i18next.t('common.back')).toBe('Vegere');
  });

  it('follows a Kurdish browser for System, whatever its region', async () => {
    browserSpeaking('ku');
    expect(await setLanguagePreference('system')).toBe('ku');
    browserSpeaking('ku-TR');
    expect(await setLanguagePreference('system')).toBe('ku');
    // Sorani, in Arabic script, is a different language, which the panel does not speak.
    browserSpeaking('ckb-IQ');
    expect(await setLanguagePreference('system')).toBe('en');
  });

  it('falls back to the system language when the browser will not say its own', async () => {
    browserSpeaking(() => {
      throw new Error('unavailable');
    });
    vi.stubGlobal('navigator', { language: 'ar' });
    expect(await setLanguagePreference('system')).toBe('ar');
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(await setLanguagePreference('system')).toBe('en');
    vi.stubGlobal('navigator', { language: 'ku' });
    expect(await setLanguagePreference('system')).toBe('ku');
  });
});

describe('language facts', () => {
  it('give each language its direction, Intl locale and site path', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(directionOf('ku')).toBe('ltr');
    expect(intlLocale('ar')).toBe('ar');
    expect(intlLocale('en')).toBe('en-GB');
    // Node ships full ICU, which has Kurdish.
    expect(intlLocale('ku')).toBe('ku');
    expect(sitePathSegment('ar')).toBe('/ar');
    expect(sitePathSegment('en')).toBe('/en');
    expect(sitePathSegment('ku')).toBe('/ku');
  });

  it('format Kurdish in English where the browser lacks Kurdish data for any of dates, counts, lists or country names', () => {
    for (const service of [Intl.DateTimeFormat, Intl.NumberFormat, Intl.ListFormat, Intl.DisplayNames]) {
      const spy = vi.spyOn(service, 'supportedLocalesOf').mockReturnValue([]);
      expect(intlLocale('ku')).toBe('en-GB');
      spy.mockRestore();
    }
    expect(intlLocale('ku')).toBe('ku');
    // Arabic and English never depend on it.
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockReturnValue([]);
    expect(intlLocale('ar')).toBe('ar');
    expect(intlLocale('en')).toBe('en-GB');
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

/** The `{{name}}` placeholders in a string, sorted. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

// CONTRIBUTING asks for every new string in English, Arabic and Kurdish. The
// panel falls back to English silently, so only a test notices a forgotten one.
describe('the catalogs', () => {
  const english = new Map(leaves(en));
  const arabic = new Map(leaves(ar));
  const kurdish = new Map(leaves(ku));

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

  it('carry the same placeholders in Arabic as in English, so nothing goes unfilled', () => {
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

  it('translate every English string into Kurdish', () => {
    expect([...english.keys()].filter((key) => !kurdish.has(key))).toEqual([]);
  });

  it('add no Kurdish key English lacks, since Kurdish has the same plural forms', () => {
    expect([...kurdish.keys()].filter((key) => !english.has(key))).toEqual([]);
  });

  it('carry the same placeholders in Kurdish as in English, so nothing goes unfilled', () => {
    for (const [key, text] of kurdish) {
      expect({ key, placeholders: placeholders(text) }).toEqual({
        key,
        placeholders: placeholders(english.get(key) ?? ''),
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

  it('take the Kurdish one and other forms, in Kurdish words', () => {
    applyLanguage('ku');
    expect(wait('api.cooldownMinute', 1)).toBe('1 deqîqeyê');
    expect(wait('api.cooldownMinute', 2)).toBe('2 deqîqeyan');
    expect(wait('api.cooldownSecond', 30)).toBe('30 saniyeyan');
    expect(i18next.t('api.cooldown', { wait: wait('api.cooldownSecond', 30) })).toContain('Piştî 30 saniyeyan');
  });
});
