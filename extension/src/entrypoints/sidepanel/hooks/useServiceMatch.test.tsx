/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../testing/fakeApi';
import match from '../../../testing/fixtures/match.json';
import { useServiceMatch } from './useServiceMatch';

describe('lookup lifecycle', () => {
  it('sends no credentials or fragment and reuses the sanitized cache key', async () => {
    const api = fakeApi().on('POST', '/services/match', { data: match }).install();
    const { result, rerender } = renderHook(({ url }) => useServiceMatch(url), {
      initialProps: { url: 'https://user:password@privacy.example/path?id=app#secret' },
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    // The active locale rides along, so the answer comes back in the panel's language.
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
