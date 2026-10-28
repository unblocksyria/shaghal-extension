import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearSentHistory, recentlyReported, recordSent, sentHistory, type SentEntry } from './history';

beforeEach(async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
});

const report = (at: number, slugs: string[], serviceSlug = 'netflix'): SentEntry => ({
  kind: 'report',
  serviceSlug,
  serviceName: 'Netflix',
  at,
  parts: slugs.map((slug) => ({ slug, name: slug, level: 'failing' })),
});

describe('what this browser sent', () => {
  it('keeps the newest 50, newest first, and forgets them all on request', async () => {
    for (let n = 0; n < 52; n += 1) await recordSent(report(n, ['core_use']));
    const list = await sentHistory();
    expect(list).toHaveLength(50);
    expect(list[0]?.at).toBe(51);
    await clearSentHistory();
    expect(await sentHistory()).toEqual([]);
  });

  it('skips stored entries it cannot read, and clears them too', async () => {
    await fakeBrowser.storage.local.set({ 'sent:1:a': { kind: 'gossip' }, 'sent:2:b': 'text', language: 'ar' });
    await recordSent(report(3, ['core_use']));
    expect(await sentHistory()).toEqual([report(3, ['core_use'])]);
    await clearSentHistory();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({ language: 'ar' });
  });

  it('clears an empty list without touching anything else', async () => {
    await fakeBrowser.storage.local.set({ language: 'en' });
    await clearSentHistory();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({ language: 'en' });
  });

  it('keeps both entries when two panels send at the same moment', async () => {
    await Promise.all([recordSent(report(5, ['payment'])), recordSent(report(5, ['sign_in'], 'github'))]);
    expect((await sentHistory()).map((entry) => entry.serviceSlug).sort()).toEqual(['github', 'netflix']);
  });
});

describe('parts reported recently', () => {
  it('marks the newest report of each part of one service within 30 days', () => {
    const now = Date.parse('2026-10-28T00:00:00.000Z');
    const day = 24 * 60 * 60_000;
    const marks = recentlyReported(
      [
        report(now - day, ['payment']),
        report(now - 3 * day, ['payment', 'sign_in']),
        report(now - 31 * day, ['core_use']),
        report(now - day, ['core_use'], 'github'),
        {
          kind: 'report',
          serviceSlug: 'netflix',
          serviceName: 'Netflix',
          at: now,
          parts: [{ name: 'Group calls', level: 'failing' }],
        },
        // A report stored without parts marks nothing.
        { kind: 'report', serviceSlug: 'netflix', serviceName: 'Netflix', at: now },
      ],
      'netflix',
      now,
    );
    expect(Object.fromEntries(marks)).toEqual({ payment: now - day, sign_in: now - 3 * day });
  });
});
