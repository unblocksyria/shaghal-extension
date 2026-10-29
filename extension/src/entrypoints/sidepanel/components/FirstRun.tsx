import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { activeLanguage, intlLocale } from '../../../lib/i18n';
import { cardStyle, detailStyle, sectionTitleStyle } from './FormParts';

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
      <h2 id="first-run-title" style={sectionTitleStyle}>
        {t('firstRun.title')}
      </h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rules.map((rule, index) => (
          <li key={rule} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* The step number, in a small gold disc like the site's. */}
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: 'var(--us-gold-subtle)',
                color: 'var(--us-accent-text)',
                fontSize: 'var(--us-text-xs)',
                fontWeight: 500,
                lineHeight: '20px',
                textAlign: 'center',
              }}
            >
              {(index + 1).toLocaleString(intlLocale(activeLanguage()))}
            </span>
            <span style={{ ...detailStyle, color: 'var(--us-text-primary)' }}>{rule}</span>
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
