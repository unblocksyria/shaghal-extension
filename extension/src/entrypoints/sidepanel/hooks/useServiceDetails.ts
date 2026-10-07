import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getServiceBySlug, type ServiceRecord } from '../../../lib/endpoints';
import { activeLanguage, type Language } from '../../../lib/i18n';

export type DetailsState =
  { status: 'idle' } | { status: 'loading' } | { status: 'ready'; record: ServiceRecord } | { status: 'error' };

/** What this slug and language answered last, so a re-render of the same ask asks nothing. */
type Answer = { slug: string; language: Language; record?: ServiceRecord };
/**
 * The full record behind a matched service, asked for as soon as the card
 * matches it, so the card can show which parts work and what to use instead.
 * `slug` null means no service is matched, so nothing is asked.
 *
 * The record is asked for in the panel's language, and a language switch asks
 * again, so the names on the card match the text around them.
 *
 * The card never waits on this: the status badge comes from the match route,
 * and a refusal leaves the card exactly as it was.
 */
export function useServiceDetails(slug: string | null): DetailsState {
  useTranslation();
  const language = activeLanguage();
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (slug === null) return;
    let cancelled = false;
    void getServiceBySlug(slug).then((result) => {
      if (cancelled) return;
      setAnswer({ slug, language, ...(result.ok ? { record: result.data } : {}) });
    });
    return () => {
      cancelled = true;
    };
  }, [slug, language]);

  if (slug === null) return { status: 'idle' };
  if (answer === null || answer.slug !== slug || answer.language !== language) return { status: 'loading' };
  return answer.record !== undefined ? { status: 'ready', record: answer.record } : { status: 'error' };
}
