import { useEffect, useState } from 'react';
import { matchService, type ServiceMatch } from '../../../lib/endpoints';
import { matchUrl } from '../../../lib/url';

export type MatchState =
  | { status: 'no-page' }
  | { status: 'loading' }
  | { status: 'ready'; match: ServiceMatch }
  | { status: 'error'; message: string };

/** In memory, bounded and short-lived, so no browsing history is persisted. */
const cache = new Map<string, { match: ServiceMatch; expires: number }>();
const CACHE_LIMIT = 100;
const CACHE_TTL_MS = 5 * 60_000;

/** Wait for navigation to settle before asking, so a redirect chain costs one lookup. */
const DEBOUNCE_MS = 350;

/**
 * Matches the active page to a catalogue service. `reload` drops the cached
 * answer for this page and asks again.
 */
export function useServiceMatch(pageUrl: string | null): { state: MatchState; reload: () => void } {
  const key = matchUrl(pageUrl);
  // Last failure and the page it belongs to. Successes live in `cache`.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // Bumped on each answer and on reload to force a re-render.
  const [generation, setGeneration] = useState(0);

  // A failed page is not asked again until `reload` clears the failure.
  const failedKey = failure?.key ?? null;

  useEffect(() => {
    if (key === null || failedKey === key) return;
    const cached = cache.get(key);
    if (cached !== undefined && cached.expires > Date.now()) return;
    cache.delete(key);
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void matchService(key, controller.signal).then((result) => {
        if (cancelled) return;
        if (result.ok) {
          if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
          cache.set(key, { match: result.data, expires: Date.now() + CACHE_TTL_MS });
          setFailure(null);
        } else {
          setFailure({ key, message: result.error.message });
        }
        setGeneration((value) => value + 1);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, generation, failedKey]);

  let state: MatchState;
  const cached = key === null ? undefined : cache.get(key);
  if (key === null) state = { status: 'no-page' };
  else if (cached !== undefined) state = { status: 'ready', match: cached.match };
  else if (failure?.key === key) state = { status: 'error', message: failure.message };
  else state = { status: 'loading' };

  const reload = () => {
    if (key !== null) cache.delete(key);
    setFailure(null);
    setGeneration((value) => value + 1);
  };

  return { state, reload };
}
