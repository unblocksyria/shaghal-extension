import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { submitCorrection, submitFunctionalityReport, submitService } from './submit';
import { getSavedEmail, saveEmail } from './settings';
import { i18next } from './i18n';

vi.mock('./turnstile', () => ({ turnstileToken: () => Promise.resolve({ ok: true, token: 'verified' }) }));

beforeEach(async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
});

// Reset the language so it does not leak into the next test.
afterEach(async () => {
  await i18next.changeLanguage('en');
});

const forms = [
  {
    name: 'service',
    send: (submitterEmail?: string) =>
      submitService({ name: 'Example', url: 'https://example.com', evidenceUrls: [], submitterEmail }),
  },
  {
    name: 'report',
    send: (submitterEmail?: string) =>
      submitFunctionalityReport({
        serviceId: 'service',
        items: [{ slug: 'core_use', level: 'working', description: 'Works' }],
        submitterEmail,
      }),
  },
  {
    name: 'correction',
    send: (submitterEmail?: string) =>
      submitCorrection({
        serviceId: 'service',
        changes: [{ correctionType: 'description', proposedValue: 'Updated' }],
        evidenceUrls: [],
        submitterEmail,
      }),
  },
];

it.each(forms)('remembers the email after a confirmed $name submission', async ({ send }) => {
  await saveEmail('old@example.com');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'receipt' }, { status: 201 })));
  expect((await send(' new@example.com ')).ok).toBe(true);
  expect(await getSavedEmail()).toBe('new@example.com');
});

it.each(forms)('preserves the saved email after a refused or uncertain $name submission', async ({ send }) => {
  await saveEmail('old@example.com');
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'INVALID', message: 'Refused' }, { status: 422 }))
      .mockRejectedValueOnce(new Error('Lost response')),
  );
  expect((await send('new@example.com')).ok).toBe(false);
  expect(await getSavedEmail()).toBe('old@example.com');
  expect((await send('new@example.com')).ok).toBe(false);
  expect(await getSavedEmail()).toBe('old@example.com');
});

it.each(forms)('does not erase the saved email after an anonymous $name submission', async ({ send }) => {
  await saveEmail('old@example.com');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json({ id: 'receipt' }))),
  );
  for (const email of [undefined, '', '   ']) {
    expect((await send(email)).ok).toBe(true);
    expect(await getSavedEmail()).toBe('old@example.com');
  }
});

it.each(forms)('keeps a confirmed $name submission successful if remembering the email fails', async ({ send }) => {
  vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('Storage unavailable'));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'receipt' }));
  vi.stubGlobal('fetch', fetcher);
  expect(await send('tester@example.com')).toEqual({ ok: true, data: { id: 'receipt' } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  // The email was not remembered, and nothing was sent twice because of it.
  expect(await getSavedEmail()).toBe('');
});

it.each(forms)('tags a $name submission with the language the panel is in', async ({ send }) => {
  await i18next.changeLanguage('ar');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'receipt' }));
  vi.stubGlobal('fetch', fetcher);
  expect((await send()).ok).toBe(true);

  const [, init] = fetcher.mock.calls[0] ?? [];
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { locale?: unknown }) : {};
  expect(body.locale).toBe('ar');
});
