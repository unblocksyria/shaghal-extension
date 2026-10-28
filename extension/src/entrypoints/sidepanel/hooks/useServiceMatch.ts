import { useEffect, useEffectEvent, useState } from 'react';
import { matchService, type ServiceMatch } from '../../../lib/endpoints';
import { matchCache } from '../../../lib/reads';
import { matchUrl } from '../../../lib/url';
import { apiErrorMessage } from '../../../lib/api';

export type MatchState =
  | { status: 'no-page' }
  | { status: 'loading' }
  | { status: 'ready'; match: ServiceMatch }
  | { status: 'error'; message: string };

/**
 * While the tab is still loading, wait this long before asking, so a redirect
 * chain costs one lookup. A loaded page, a tab switch or a reopened panel asks
 * at once.
 */
const DEBOUNCE_MS = 350;

/**
 * Matches the active page to a catalogue service. Answers are kept in
 * `matchCache` (lib/reads.ts): a fresh one is used without asking, and a stale
 * one is shown while the lookup runs again. `reload` drops the kept answer for
 * this page and asks again.
 */
export function useServiceMatch(
  pageUrl: string | null,
  options: { loading?: boolean } = {},
): { state: MatchState; reload: () => void } {
  const key = matchUrl(pageUrl);
  // Last failure and the page it belongs to. Successes live in `matchCache`.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // Bumped on each answer and on reload to force a re-render.
  const [generation, setGeneration] = useState(0);
  // Read when a lookup is scheduled, so the tab finishing its load doesn't start another.
  const tabLoading = useEffectEvent(() => options.loading === true);

  // A failed page is not asked again until `reload` clears the failure.
  const failedKey = failure?.key ?? null;

  useEffect(() => {
    if (key === null || failedKey === key) return;
    const kept = matchCache.peek(key);
    if (kept?.fresh === true) return;
    let cancelled = false;
    const controller = new AbortController();
    const ask = () => {
      void matchService(key, controller.signal).then((result) => {
        if (cancelled) return;
        if (result.ok) {
          matchCache.put(key, result.data);
          setFailure(null);
        } else {
          // Recorded either way, so the page isn't asked again until `reload`.
          // A stale answer still wins over it below.
          setFailure({ key, message: apiErrorMessage(result.error) });
        }
        setGeneration((value) => value + 1);
      });
    };
    const timer = tabLoading() && kept === undefined ? setTimeout(ask, DEBOUNCE_MS) : undefined;
    if (timer === undefined) ask();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, generation, failedKey]);

  let state: MatchState;
  const kept = key === null ? undefined : matchCache.peek(key);
  if (key === null) state = { status: 'no-page' };
  else if (kept !== undefined) state = { status: 'ready', match: kept.value };
  else if (failure?.key === key) state = { status: 'error', message: failure.message };
  else state = { status: 'loading' };

  const reload = () => {
    if (key !== null) matchCache.delete(key);
    setFailure(null);
    setGeneration((value) => value + 1);
  };

  return { state, reload };
}
