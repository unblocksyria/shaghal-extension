import { beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { submitService } from './submit';

const verification = vi.hoisted(() => vi.fn());
vi.mock('./turnstile', () => ({ turnstileToken: verification }));

beforeEach(() => {
  verification.mockReset().mockResolvedValue({ ok: true, token: 'verified' });
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
});
const input = { name: 'Example', url: 'https://example.com', evidenceUrls: [] };

it('keeps the same receipt after a lost response and across calls, then releases it after confirmation', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce(Response.json({ id: 'receipt' }))
    .mockResolvedValueOnce(Response.json({ id: 'new-receipt' }));
  vi.stubGlobal('fetch', fetcher);
  expect((await submitService(input)).ok).toBe(false);
  expect((await submitService(input)).ok).toBe(true);
  expect((await submitService(input)).ok).toBe(true);
  const keys = fetcher.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']);
  expect(keys[0]).toMatch(/^\d{13}\./);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
});

it('does not send edited details as a new intent after uncertain delivery', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce(Response.json({ state: 'unconfirmed' }));
  vi.stubGlobal('fetch', fetcher);
  await submitService(input);
  const result = await submitService({ ...input, name: 'Changed' });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.error).toBe('DELIVERY_UNCONFIRMED');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toContain('/submission-receipts');
});

it('fails before sending if a receipt cannot be saved', async () => {
  vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'));
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  const result = await submitService(input);
  expect(result.ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not discard an uncertain receipt when a later attempt hits a quota', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce(Response.json({ error: 'RATE_LIMITED', message: 'Wait' }, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ id: 'receipt' }));
  vi.stubGlobal('fetch', fetcher);
  await submitService(input);
  await submitService(input);
  await submitService(input);
  const keys = fetcher.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']);
  expect(new Set(keys).size).toBe(1);
});

it('retains the original receipt if verification is cancelled after a lost response', async () => {
  verification
    .mockResolvedValueOnce({ ok: true, token: 'one' })
    .mockResolvedValueOnce({ ok: false, message: 'Cancelled' })
    .mockResolvedValueOnce({ ok: true, token: 'two' });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('lost'))
    .mockResolvedValueOnce(Response.json({ id: 'receipt' }));
  vi.stubGlobal('fetch', fetcher);
  await submitService(input);
  await submitService(input);
  await submitService(input);
  const keys = fetcher.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});
