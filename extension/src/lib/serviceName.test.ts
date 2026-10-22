import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from './i18n';
import { isolate, serviceName } from './serviceName';

describe('serviceName', () => {
  afterEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('shows the English name alone in English, even when the catalogue has an Arabic one', async () => {
    await i18next.changeLanguage('en');
    expect(serviceName({ name: 'Netflix', nameAr: 'نتفليكس' })).toBe('Netflix');
  });

  it('shows the English name with the Arabic one in brackets in Arabic', async () => {
    await i18next.changeLanguage('ar');
    expect(serviceName({ name: 'Netflix', nameAr: 'نتفليكس' })).toBe('\u2068Netflix\u2069 (نتفليكس)');
  });

  it('shows the English name alone in Arabic when there is no Arabic name', async () => {
    await i18next.changeLanguage('ar');
    expect(serviceName({ name: 'Netflix', nameAr: null })).toBe('\u2068Netflix\u2069');
    expect(serviceName({ name: 'Netflix' })).toBe('\u2068Netflix\u2069');
    expect(serviceName({ name: 'Netflix', nameAr: '' })).toBe('\u2068Netflix\u2069');
  });

  it('isolates a name in Arabic so its punctuation stays in place, and leaves English alone', async () => {
    await i18next.changeLanguage('ar');
    expect(isolate('Disney+')).toBe('\u2068Disney+\u2069');
    await i18next.changeLanguage('en');
    expect(isolate('Disney+')).toBe('Disney+');
  });
});
