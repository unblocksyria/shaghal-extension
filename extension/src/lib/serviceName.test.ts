import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from './i18n';
import { serviceName } from './serviceName';

// The name the panel shows for a service, in both languages (spec 0002, AC-6).
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
    expect(serviceName({ name: 'Netflix', nameAr: 'نتفليكس' })).toBe('Netflix (نتفليكس)');
  });

  it('shows the English name alone in Arabic when there is no Arabic name', async () => {
    await i18next.changeLanguage('ar');
    expect(serviceName({ name: 'Netflix', nameAr: null })).toBe('Netflix');
    expect(serviceName({ name: 'Netflix' })).toBe('Netflix');
    expect(serviceName({ name: 'Netflix', nameAr: '' })).toBe('Netflix');
  });
});
