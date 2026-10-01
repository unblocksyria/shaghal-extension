import { useEffect, useState } from 'react';
import { getServiceBySlug, type ServiceRecord } from '../../../lib/endpoints';

export type DetailsState =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; record: ServiceRecord } | { status: 'error' };

/** What this slug answered last, so a re-render of the same slug asks nothing. */
type Answer = { slug: string; record: ServiceRecord } | { slug: string };

/**
 * The full record behind a matched service, asked for as soon as the card
 * matches it, so the card can show which parts work and what to use instead.
 * `slug` null means no service is matched, so nothing is asked.
 *
 * The card never waits on this: the status badge comes from the match route,
 * and a refusal leaves the card exactly as it was.
 */
export function useServiceDetails(slug: string | null): DetailsState {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (slug === null) return;
    let cancelled = false;
    void getServiceBySlug(slug).then((result) => {
      if (cancelled) return;
      setAnswer(result.ok ? { slug, record: result.data } : { slug });
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (slug === null) return { status: 'idle' };
  if (answer === null || answer.slug !== slug) return { status: 'loading' };
  return 'record' in answer ? { status: 'ready', record: answer.record } : { status: 'error' };
}
