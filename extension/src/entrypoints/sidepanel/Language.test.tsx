/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { i18next } from '../../lib/i18n';
import { fakeApi } from '../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../testing/panel';
import categories from '../../testing/fixtures/categories.json';
import functionalities from '../../testing/fixtures/functionalities.json';
import match from '../../testing/fixtures/match.json';
import matchNone from '../../testing/fixtures/match-none.json';
import serviceRecord from '../../testing/fixtures/service-record.json';

/** What every button involved in a language switch is called, per language. */
const LANGUAGE_LABELS = {
  en: {
    settings: 'Settings',
    title: 'Settings',
    back: 'Back',
    language: 'Language',
    pick: { en: 'English', ar: 'Arabic' },
  },
  ar: {
    settings: 'الإعدادات',
    title: 'الإعدادات',
    back: 'رجوع',
    language: 'اللغة',
    pick: { en: 'الإنجليزية', ar: 'العربية' },
  },
} as const;

/**
 * Picks a language in Settings and closes Settings again, the way a tester does
 * it. The labels come from the language the panel is in right now, which the
 * document root carries.
 */
async function switchLanguage(user: UserEvent, pick: 'en' | 'ar'): Promise<void> {
  const from = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const before = LANGUAGE_LABELS[from];
  const after = LANGUAGE_LABELS[pick];
  await user.click(screen.getByRole('button', { name: before.settings }));
  const languages = await screen.findByRole('radiogroup', { name: before.language });
  await user.click(within(languages).getByRole('radio', { name: before.pick[pick] }));
  await screen.findByRole('heading', { name: after.title });
  // The close button has already taken the language you just picked.
  await user.click(screen.getByRole('button', { name: after.back }));
}

/** A service recording a part the form does not own, so only the catalogue can name it. */
const recordWithParts = {
  ...serviceRecord,
  functionalities: [
    { slug: 'core_use', name: 'Core use', level: 'failing' },
    { slug: 'sign_up', name: 'Sign up', level: 'working' },
  ],
};

/** The catalogue as the API answers it in Arabic (spec 0002, AC-7). */
const arabicCatalogue = [
  { slug: 'core_use', name: 'الاستخدام الأساسي' },
  { slug: 'landing_page', name: 'الصفحة الرئيسية' },
  { slug: 'sign_up', name: 'التسجيل' },
  { slug: 'payments', name: 'المدفوعات' },
];

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

  it('leaves the names owed when the catalogue fails on a switch, and Try again finishes them (AC-7)', async () => {
    const user = userEvent.setup();
    // The English catalogue always answers; only the Arabic one can fail.
    let arabicCatalogueFails = true;
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: recordWithParts })
      .on('GET', '/functionalities', (call) => {
        const locale = new URL(call.url).searchParams.get('locale');
        if (locale === 'ar' && arabicCatalogueFails) {
          return { status: 500, json: { error: 'UPSET', message: 'The catalogue is down' } };
        }
        return { data: locale === 'ar' ? arabicCatalogue : functionalities };
      })
      .install();

    await openPanel('https://catalogue.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
    expect(screen.getByText('Sign up')).toBeDefined();

    await switchLanguage(user, 'ar');

    // The failure is said in the new language, and the two parts the extension
    // names itself are renamed anyway, because no catalogue is needed for them.
    await screen.findByText(/تعذّر تحميل الأجزاء/, {}, { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'أعد المحاولة' })).toBeDefined();
    expect(screen.getByText('الاستخدام الأساسي')).toBeDefined();
    // The part only the catalogue can name still waits for it.
    expect(screen.getByText('Sign up')).toBeDefined();

    arabicCatalogueFails = false;
    await user.click(screen.getByRole('button', { name: 'أعد المحاولة' }));

    expect(await screen.findByText('التسجيل', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.queryByText('Sign up')).toBeNull();
    expect(screen.queryByRole('button', { name: 'أعد المحاولة' })).toBeNull();
    // The retry asked in the language the panel is showing (spec 0002, AC-7).
    expect(api.callsTo('GET', '/functionalities').at(-1)?.url).toContain('locale=ar');
  });

  it('keeps the level, the note and the screenshot while the parts take their Arabic names (AC-11)', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: recordWithParts })
      .on('GET', '/functionalities', (call) => ({
        data: new URL(call.url).searchParams.get('locale') === 'ar' ? arabicCatalogue : functionalities,
      }))
      .install();

    await openPanel('https://kept.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));

    // A mark the record disagrees with, backed by a note and a screenshot.
    const group = screen.getByRole('radiogroup', { name: 'Sign up' });
    await user.click(within(group).getByRole('radio', { name: 'Fails' }));
    await user.type(screen.getByPlaceholderText('What happened?'), 'The sign up form never opened.');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');

    await switchLanguage(user, 'ar');

    // Everything typed and chosen is still there, under the Arabic part name.
    const renamed = await screen.findByRole('radiogroup', { name: 'التسجيل' }, { timeout: 3000 });
    expect(within(renamed).getByRole('radio', { name: 'لا يعمل' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'ملاحظات التسجيل' })).toHaveProperty(
      'value',
      'The sign up form never opened.',
    );
    expect(screen.getByAltText('الدليل رقم 1')).toBeDefined();
  });

  it('restores the English part names when the panel is switched back (AC-7)', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: recordWithParts })
      .on('GET', '/functionalities', (call) => ({
        data: new URL(call.url).searchParams.get('locale') === 'ar' ? arabicCatalogue : functionalities,
      }))
      .install();

    await openPanel('https://again.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
    expect(screen.getByText('Sign up')).toBeDefined();

    await switchLanguage(user, 'ar');
    expect(await screen.findByText('التسجيل', {}, { timeout: 3000 })).toBeDefined();

    await switchLanguage(user, 'en');

    expect(await screen.findByText('Sign up', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.queryByText('التسجيل')).toBeNull();
    expect(document.documentElement.dir).toBe('ltr');
    // The names came back from a catalogue asked for in English.
    expect(api.callsTo('GET', '/functionalities').at(-1)?.url).toContain('locale=en');
  });

  it('keeps the loaded category names through a failed refetch and catches up on the next switch (AC-7)', async () => {
    const user = userEvent.setup();
    let arabicCategoriesFail = true;
    const arabicCategories = [
      { id: 'cat-streaming', name: 'بث' },
      { id: 'cat-entertainment', name: 'ترفيه' },
      { id: 'cat-social', name: 'تواصل' },
    ];
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceRecord })
      .on('GET', '/categories', (call) => {
        const locale = new URL(call.url).searchParams.get('locale');
        if (locale === 'ar' && arabicCategoriesFail) {
          return { status: 500, json: { error: 'UPSET', message: 'Categories are down' } };
        }
        return { data: locale === 'ar' ? arabicCategories : categories };
      })
      .install();

    await openPanel('https://refetch.example/');
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }, { timeout: 3000 }));
    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await screen.findByRole('button', { name: /2 selected: Streaming, Entertainment/ });

    await switchLanguage(user, 'ar');
    // Wait for the refetch the switch made before judging what it left behind.
    await waitFor(() => expect(api.callsTo('GET', '/categories')).toHaveLength(2));

    // The names loaded in English are still on screen and no error is raised:
    // the form stays usable while the options wait for a language that answers.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /تم اختيار 2: Streaming, Entertainment/ })).toBeDefined();

    // Coming back to Arabic asks once more, and this time the names follow.
    arabicCategoriesFail = false;
    await switchLanguage(user, 'en');
    await switchLanguage(user, 'ar');

    expect(await screen.findByRole('button', { name: /تم اختيار 2: بث, ترفيه/ }, { timeout: 3000 })).toBeDefined();
    expect(api.callsTo('GET', '/categories').map((call) => new URL(call.url).searchParams.get('locale'))).toEqual([
      'en',
      'ar',
      'ar',
    ]);
  });
});
