import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { cardStyle, hintStyle, titleStyle } from './FormParts';

const SEEN_KEY = 'firstRunSeen';

/**
 * What makes a test count, shown once, above the first card a new tester
 * sees, until they dismiss it. The full guide stays a link away in the report.
 */
export function FirstRun() {
  const { t } = useTranslation();
  // Null until storage answers, so the card doesn't flash for someone who dismissed it.
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void chrome.storage.local
      .get(SEEN_KEY)
      .then((stored: Record<string, unknown>) => {
        if (!cancelled) setSeen(stored[SEEN_KEY] === true);
      })
      .catch(() => {
        if (!cancelled) setSeen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (seen !== false) return null;
  const rules = [t('firstRun.noVpn'), t('firstRun.tryIt'), t('firstRun.screenshot'), t('firstRun.reviewed')];
  return (
    <section className="us-animate-fade" style={{ ...cardStyle, gap: 12 }} aria-labelledby="first-run-title">
      <h2 id="first-run-title" style={{ ...titleStyle, fontSize: 16 }}>
        {t('firstRun.title')}
      </h2>
      <ol style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 6 }}>
        {rules.map((rule) => (
          <li key={rule} style={{ ...hintStyle, fontSize: 13, color: 'var(--us-text-primary)' }}>
            {rule}
          </li>
        ))}
      </ol>
      <Button
        variant="surface"
        size="sm"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          setSeen(true);
          void chrome.storage.local.set({ [SEEN_KEY]: true }).catch(() => undefined);
        }}
      >
        {t('firstRun.dismiss')}
      </Button>
    </section>
  );
}
