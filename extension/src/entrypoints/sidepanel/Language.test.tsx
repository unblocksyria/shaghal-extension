/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { i18next } from '../../lib/i18n';
import { fakeApi } from '../../testing/fakeApi';
import { openPanel } from '../../testing/panel';
import categories from '../../testing/fixtures/categories.json';
import functionalities from '../../testing/fixtures/functionalities.json';
import match from '../../testing/fixtures/match.json';
import matchNone from '../../testing/fixtures/match-none.json';
import serviceRecord from '../../testing/fixtures/service-record.json';

// The language pick, the direction flip and the English fallback, each against
// the acceptance criteria of spec 0002.
describe('language', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('opens in Arabic when the browser UI language is Arabic and nothing is saved (AC-2)', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://arabic.example/', { uiLanguage: 'ar-SY' });

    expect(document.documentElement.dir).toBe('rtl');
    await screen.findByRole('button', { name: 'أبلغ عمّا يعمل' }, { timeout: 3000 });
  });

  it('opens in English when the browser UI language is not Arabic (AC-2)', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://english.example/', { uiLanguage: 'fr-FR' });

    expect(document.documentElement.dir).toBe('ltr');
    await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 });
  });

  it('lets a saved pick win over the browser language (AC-2)', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://saved.example/', { language: 'en', uiLanguage: 'ar-SY' });

    expect(document.documentElement.dir).toBe('ltr');
    await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 });
  });

  it('switches the whole panel and the direction from Settings (AC-1, AC-3, AC-4)', async () => {
    const user = userEvent.setup();
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://switch.example/');
    await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 });
    expect(document.documentElement.dir).toBe('ltr');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Settings' });
    // Appearance and Language both offer System, so each pick is scoped to its row.
    const languages = screen.getByRole('radiogroup', { name: 'Language' });
    expect(within(languages).getByRole('radio', { name: 'System' })).toBeDefined();
    expect(within(languages).getByRole('radio', { name: 'English' })).toBeDefined();
    expect(within(languages).getByRole('radio', { name: 'Arabic' })).toBeDefined();

    await user.click(within(languages).getByRole('radio', { name: 'Arabic' }));

    // Applied at once, with the panel still open (AC-1).
    await screen.findByRole('heading', { name: 'الإعدادات' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect((await fakeBrowser.storage.local.get('language')).language).toBe('ar');

    // The card underneath is Arabic too, not just the Settings sheet (AC-4).
    await user.click(screen.getByRole('button', { name: 'رجوع' }));
    await screen.findByRole('button', { name: 'أبلغ عمّا يعمل' });
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('renders English text for a key the Arabic catalog leaves out, never a raw key (AC-5)', async () => {
    const arabic = (i18next.store.data as Record<string, { translation: Record<string, unknown> }>).ar;
    const header = arabic?.translation.header as Record<string, string>;
    const saved = header.settings;
    delete header.settings;
    fakeApi().on('POST', '/services/match', { data: match }).install();
    try {
      await openPanel('https://fallback.example/', { language: 'ar' });
      await screen.findByRole('button', { name: 'أبلغ عمّا يعمل' }, { timeout: 3000 });
      // Everything else reads Arabic, so the fallback really did happen for this key.
      expect(document.documentElement.dir).toBe('rtl');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Settings' }));
      await screen.findByRole('heading', { name: 'الإعدادات' });
      // The missing key's English text, not `header.settings`.
      expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
    } finally {
      header.settings = saved ?? 'Settings';
    }
  });

  it('shows the Arabic name in brackets beside the English one, and nothing when there is none (AC-6)', async () => {
    fakeApi()
      .on('POST', '/services/match', {
        data: { ...match, service: { ...match.service, nameAr: 'نتفليكس' } },
      })
      .install();

    await openPanel('https://named.example/', { language: 'ar' });
    expect(await screen.findByRole('heading', { name: 'Netflix (نتفليكس)' }, { timeout: 3000 })).toBeDefined();

    document.documentElement.dir = 'ltr';
    fakeApi().on('POST', '/services/match', { data: match }).install();
    await openPanel('https://unnamed.example/', { language: 'ar' });
    // `match.json` carries no nameAr, so there are no brackets to add (AC-6).
    expect(await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 })).toBeDefined();
  });

  it('carries the active locale on the read routes (AC-7)', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceRecord })
      .on('GET', '/categories', { data: categories })
      .on('GET', '/functionalities', { data: functionalities })
      .install();

    await openPanel('https://locale.example/', { language: 'ar' });
    await user.click(await screen.findByRole('button', { name: 'أبلغ عمّا يعمل' }, { timeout: 3000 }));

    // The match carries it in the body, the detail route in the query (AC-7).
    expect(api.calls.find((call) => call.path === '/services/match')?.json).toMatchObject({ locale: 'ar' });
    expect(api.calls.find((call) => call.path === '/services/netflix')?.url).toContain('locale=ar');
    // The report form asks for the functionality catalogue in the same language.
    expect(api.calls.find((call) => call.path === '/functionalities')?.url).toContain('locale=ar');

    // The form's back button carries the service name (AC-6 shows it in brackets when there is an Arabic one).
    await user.click(screen.getByRole('button', { name: 'العودة إلى Netflix' }));
    await user.click(await screen.findByRole('button', { name: 'اقترح تصحيحًا' }));
    await screen.findByRole('heading', { name: 'اقترح تصحيحًا' });
    await user.click(screen.getByRole('checkbox', { name: 'الفئات' }));

    expect(api.calls.find((call) => call.path === '/categories')?.url).toContain('locale=ar');
  });

  it('formats dates with the active locale (AC-8)', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://dates.example/', { language: 'ar' });
    const checked = await screen.findByText(/آخر فحص/, {}, { timeout: 3000 });
    // The fixture was checked on 1 September 2026; Arabic months are not "Sep".
    expect(checked.textContent).toContain('2026');
    expect(checked.textContent).not.toContain('Sep');
  });

  it('points the service link and the guide link at the Arabic path (AC-9)', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceRecord })
      .on('GET', '/functionalities', { data: functionalities })
      .install();

    await openPanel('https://links.example/', { language: 'ar' });
    const serviceLink = await screen.findByRole('link', { name: /عرض على Unblock Syria/ }, { timeout: 3000 });
    expect(serviceLink.getAttribute('href')).toContain('/ar/services/netflix');

    await user.click(screen.getByRole('button', { name: 'أبلغ عمّا يعمل' }));
    const guide = await screen.findByRole('link', { name: /اقرأ الدليل/ });
    expect(guide.getAttribute('href')).toContain('/ar/articles/how-to-test-a-service-from-syria');
  });

  it('keeps a half filled form and its screenshots through a switch, on the same view (AC-11)', async () => {
    const user = userEvent.setup();
    fakeApi().on('POST', '/services/match', { data: matchNone }).install();
    globalThis.URL.createObjectURL = () => 'blob:fake-evidence';
    globalThis.URL.revokeObjectURL = () => undefined;
    fakeBrowser.tabs.captureVisibleTab = () => Promise.resolve('data:image/jpeg;base64,aGVsbG8=');

    await openPanel('https://draft.example/');
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Kept Service');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Arabic' }));
    await screen.findByRole('heading', { name: 'الإعدادات' });
    await user.click(screen.getByRole('button', { name: 'رجوع' }));

    // Still the report form, still filled, still attached (AC-11).
    await screen.findByRole('heading', { name: 'أبلغ عن خدمة' });
    expect(screen.getByRole('textbox', { name: 'اسم الخدمة' })).toHaveProperty('value', 'Kept Service');
    expect(screen.getByAltText('الدليل رقم 1')).toBeDefined();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('relabels the parts the service recorded from the catalogue in the new language (AC-7)', async () => {
    const user = userEvent.setup();
    // A part that is not one of the two the form owns: only the catalogue can name it.
    const record = {
      ...serviceRecord,
      functionalities: [
        { slug: 'core_use', name: 'Core use', level: 'failing' as const },
        { slug: 'sign_up', name: 'Sign up', level: 'working' as const },
      ],
    };
    const arabicCatalogue = [
      { slug: 'core_use', name: 'الاستخدام الأساسي' },
      { slug: 'landing_page', name: 'الصفحة الرئيسية' },
      { slug: 'sign_up', name: 'التسجيل' },
      { slug: 'payments', name: 'المدفوعات' },
    ];
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: record })
      // The catalogue answers in the locale it is asked for, which is what the API does (AC-7).
      .on('GET', '/functionalities', (call) => ({
        data: new URL(call.url).searchParams.get('locale') === 'ar' ? arabicCatalogue : functionalities,
      }))
      .install();

    await openPanel('https://parts.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
    expect(screen.getByText('Sign up')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const languages = screen.getByRole('radiogroup', { name: 'Language' });
    await user.click(within(languages).getByRole('radio', { name: 'Arabic' }));
    await screen.findByRole('heading', { name: 'الإعدادات' });
    await user.click(screen.getByRole('button', { name: 'رجوع' }));

    // The catalogue came back in Arabic, so the part the record named in English is Arabic too.
    expect(await screen.findByText('التسجيل', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.queryByText('Sign up')).toBeNull();
  });

  it('relabels the category options and the recorded line in the new language (AC-7)', async () => {
    const user = userEvent.setup();
    const arabicCategories = [
      { id: 'cat-streaming', name: 'بث' },
      { id: 'cat-entertainment', name: 'ترفيه' },
      { id: 'cat-social', name: 'تواصل' },
    ];
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceRecord })
      .on('GET', '/categories', (call) => ({
        data: new URL(call.url).searchParams.get('locale') === 'ar' ? arabicCategories : categories,
      }))
      .install();

    await openPanel('https://labels.example/');
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }, { timeout: 3000 }));
    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    // The picker opens with the two recorded categories already ticked.
    await user.click(screen.getByRole('button', { name: /Select correct categories|\d+ selected/ }));
    expect(screen.getByText('Streaming')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const languages = screen.getByRole('radiogroup', { name: 'Language' });
    await user.click(within(languages).getByRole('radio', { name: 'Arabic' }));
    await screen.findByRole('heading', { name: 'الإعدادات' });
    await user.click(screen.getByRole('button', { name: 'رجوع' }));

    // The same two categories, now under their Arabic names, still ticked.
    expect(await screen.findByText('بث', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.getByText('ترفيه')).toBeDefined();
    expect(screen.getByRole('button', { name: /2: بث, ترفيه/ })).toBeDefined();
    // The recorded line reads those names too, not the ones the form opened with.
    expect(screen.getByText('بث, ترفيه')).toBeDefined();
  });

  it('tags a submission with the language it was written in (AC-7)', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: matchNone })
      .on('POST', '/submissions', { status: 201, json: { id: 'receipt' } })
      .install();

    await openPanel('https://writes.example/', { language: 'ar' });
    await user.click(await screen.findByRole('button', { name: 'أبلغ عن خدمة' }, { timeout: 3000 }));
    await user.type(screen.getByRole('textbox', { name: 'اسم الخدمة' }), 'خدمة غير متتبعة');
    await user.click(screen.getByRole('button', { name: 'أرسل التقرير' }));

    await screen.findByRole('heading', { name: 'استلمنا التقرير' });
    expect(api.callsTo('POST', '/submissions').at(0)?.json).toMatchObject({ locale: 'ar' });
  });
});
