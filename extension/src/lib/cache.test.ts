import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ApiResult } from './api';
import { clearReadCaches, createReadCache, hydrateReadCaches } from './cache';

const ok = (data: string): ApiResult<string> => ({ ok: true, data });
const failed: ApiResult<string> = { ok: false, error: { error: 'DOWN', message: 'Down', status: 503 } };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('a read cache', () => {
  it('asks once for concurrent loads of one key, and not again while fresh', async () => {
    const cache = createReadCache<string>({ freshMs: 1000, keepMs: 5000, limit: 5 });
    const answer = deferred<ApiResult<string>>();
    const fetcher = vi.fn(() => answer.promise);

    const first = cache.load('netflix', fetcher);
    const second = cache.load('netflix', fetcher);
    answer.resolve(ok('record'));
    expect(await first).toEqual(ok('record'));
    expect(await second).toEqual(ok('record'));
    expect(await cache.load('netflix', fetcher)).toEqual(ok('record'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a stale answer to show, asks again for it, and drops it past keepMs', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = createReadCache<string>({ freshMs: 1000, keepMs: 5000, limit: 5 });
    await cache.load('netflix', () => Promise.resolve(ok('old')));

    clock.mockReturnValue(now + 2000);
    expect(cache.peek('netflix')).toEqual({ value: 'old', fresh: false });
    expect(await cache.load('netflix', () => Promise.resolve(ok('new')))).toEqual(ok('new'));
    expect(cache.peek('netflix')).toEqual({ value: 'new', fresh: true });

    clock.mockReturnValue(now + 2000 + 5001);
    expect(cache.peek('netflix')).toBeUndefined();
  });

  it('never keeps a failure, so the next load asks again', async () => {
    const cache = createReadCache<string>({ freshMs: 1000, keepMs: 5000, limit: 5 });
    expect(await cache.load('netflix', () => Promise.resolve(failed))).toEqual(failed);
    expect(cache.peek('netflix')).toBeUndefined();
    expect(await cache.load('netflix', () => Promise.resolve(ok('record')))).toEqual(ok('record'));
  });

  it('asks again when forced, even with a fresh answer', async () => {
    const cache = createReadCache<string>({ freshMs: 1000, keepMs: 5000, limit: 5 });
    await cache.load('netflix', () => Promise.resolve(ok('old')));
    expect(await cache.load('netflix', () => Promise.resolve(ok('new')), { force: true })).toEqual(ok('new'));
  });

  it('holds at most `limit` answers, dropping the least recently stored', () => {
    const cache = createReadCache<string>({ freshMs: 1000, keepMs: 5000, limit: 2 });
    cache.put('a', '1');
    cache.put('b', '2');
    cache.put('a', '1 again');
    cache.put('c', '3');
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.peek('a')?.value).toBe('1 again');
    expect(cache.peek('c')?.value).toBe('3');
  });
});

describe('a reopened panel', () => {
  it('starts with the answers the last one kept in session storage', async () => {
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    const cache = createReadCache<string>({ storageKey: 'cache.test', freshMs: 1000, keepMs: 5000, limit: 5 });
    await cache.load('netflix', () => Promise.resolve(ok('record')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await fakeBrowser.storage.session.get('cache.test')).toEqual({
      'cache.test': { netflix: { value: 'record', at: expect.any(Number) as number } },
    });

    clearReadCaches();
    expect(cache.peek('netflix')).toBeUndefined();
    await hydrateReadCaches();
    expect(cache.peek('netflix')).toEqual({ value: 'record', fresh: true });
  });

  it('skips stored answers that are too old or malformed', async () => {
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    const cache = createReadCache<string>({ storageKey: 'cache.old', freshMs: 1000, keepMs: 5000, limit: 5 });
    await fakeBrowser.storage.session.set({
      'cache.old': {
        expired: { value: 'gone', at: Date.now() - 6000 },
        broken: { at: 'yesterday' },
        kept: { value: 'here', at: Date.now() - 2000 },
      },
    });
    clearReadCaches();
    await hydrateReadCaches();
    expect(cache.peek('expired')).toBeUndefined();
    expect(cache.peek('broken')).toBeUndefined();
    expect(cache.peek('kept')).toEqual({ value: 'here', fresh: false });
  });
});
