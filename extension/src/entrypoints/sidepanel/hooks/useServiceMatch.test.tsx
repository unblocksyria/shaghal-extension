/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../testing/fakeApi';
import match from '../../../testing/fixtures/match.json';
import matchNone from '../../../testing/fixtures/match-none.json';
import { useServiceMatch } from './useServiceMatch';

describe('lookup lifecycle', () => {
  it('sends no credentials or fragment and reuses the sanitized cache key', async () => {
    const api = fakeApi().on('POST', '/services/match', { data: match }).install();
    const { result, rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://user:password@privacy.example/path?id=app#secret' },
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    // The locale is sent so the answer comes back in the panel's language.
    expect(api.callsTo('POST', '/services/match')[0]?.json).toEqual({
      url: 'https://privacy.example/path?id=app',
      locale: 'en',
    });
    rerender({ url: 'https://privacy.example/path?id=app#other' });
    expect(result.current.state.status).toBe('ready');
    expect(api.callsTo('POST', '/services/match')).toHaveLength(1);
  });

  it('aborts the obsolete request when navigation changes', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const { rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://cancelled.example/path' },
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => rerender({ url: 'chrome://settings/' }));
    expect(signal?.aborted).toBe(true);
  });

  it('refreshes an expired answer when revisited', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const api = fakeApi().on('POST', '/services/match', { data: match }).install();
    const { result, rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://expired.example/' },
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ url: 'chrome://settings/' });
    clock.mockReturnValue(now + 6 * 60_000);
    rerender({ url: 'https://expired.example/' });
    await waitFor(() => expect(api.callsTo('POST', '/services/match')).toHaveLength(2));
  });
});

describe('asking again', () => {
  afterEach(() => vi.useRealTimers());

  it('drops a remembered failure or a cached answer on reload', async () => {
    let failing = true;
    const api = fakeApi()
      .on('POST', '/services/match', () =>
        failing ? { status: 500, json: { error: 'BOOM', message: 'Service is down' } } : { data: match },
      )
      .install();
    const { result } = renderHook(() => useServiceMatch('https://reload.example/'));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', message: 'Service is down' }));

    failing = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => result.current.reload());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(api.callsTo('POST', '/services/match')).toHaveLength(3));
  });

  it('keeps the newer page’s answer when the page before it answers late', async () => {
    let releaseSlow: (response: Response) => void = () => undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseSlow = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ data: matchNone }));
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://slow.example/' },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    rerender({ url: 'https://fast.example/' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', match: matchNone }));

    releaseSlow(Response.json({ data: match }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.state).toEqual({ status: 'ready', match: matchNone });
    // The late answer was not cached either.
    rerender({ url: 'https://slow.example/' });
    expect(result.current.state.status).toBe('loading');
  });

  it('remembers at most 100 pages, forgetting the oldest first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = fakeApi().on('POST', '/services/match', { data: matchNone }).install();
    const { result, rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://page-0.example/' },
    });
    // Lets the debounce fire and the answer land.
    const settle = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(350);
        await new Promise((resolve) => setImmediate(resolve));
      });

    for (let page = 0; page <= 100; page += 1) {
      rerender({ url: `https://page-${page}.example/` });
      await settle();
      expect(result.current.state.status).toBe('ready');
    }
    const lookups = api.callsTo('POST', '/services/match').length;

    // The second page is still remembered, the first is not.
    rerender({ url: 'https://page-1.example/' });
    expect(result.current.state.status).toBe('ready');
    rerender({ url: 'https://page-0.example/' });
    expect(result.current.state.status).toBe('loading');
    await settle();
    expect(api.callsTo('POST', '/services/match')).toHaveLength(lookups + 1);
  });
});
