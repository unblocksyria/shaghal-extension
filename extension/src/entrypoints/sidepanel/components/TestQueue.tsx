import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogService } from '../../../lib/endpoints';
import { activeLanguage, dayAndMonth } from '../../../lib/i18n';
import { webUrl } from '../../../lib/url';
import { loadQueue, peekQueue } from '../../../lib/reads';
import { cardStyle, hintStyle, sectionTitleStyle } from './FormParts';
import { ServiceRow } from './ServiceRow';
import { RETEST_SINCE } from '../../../lib/retest';

/** How many of each queue the list shows: rechecks first, then never-tested services. */
const RETEST_ROWS = 3;
const UNTESTED_ROWS = 2;

type Row = { service: CatalogService; url: string; reason: 'retest' | 'untested' };

function rowsOf(retest: CatalogService[] | undefined, untested: CatalogService[] | undefined): Row[] {
  const rows: Row[] = [];
  const add = (list: CatalogService[] | undefined, reason: Row['reason'], limit: number) => {
    let added = 0;
    for (const service of list ?? []) {
      const url = webUrl(service.url);
      if (added >= limit || url === null || rows.some((row) => row.service.slug === service.slug)) continue;
      rows.push({ service, url, reason });
      added += 1;
    }
  };
  add(retest, 'retest', RETEST_ROWS);
  add(untested, 'untested', UNTESTED_ROWS);
  return rows;
}

/**
 * "Help check these from Syria": the most-voted services whose record needs a
 * check, for when the panel has nothing else to show and after a report is
 * sent. A row opens the service's site in a new tab, and the panel, which
 * follows the tab, lands on its card with the gaps marked.
 *
 * Nothing shows until there is something to list, and a failure only says so
 * in a line, since the list is a suggestion.
 */
export function TestQueue(props: {
  /**
   * Runs when the tester opens a service from the list, so a view that would
   * stay put, such as a sent screen, goes back to the card for the new tab.
   */
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => rowsOf(peekQueue('retest'), peekQueue('untested')));
  const [failed, setFailed] = useState(false);
  const language = activeLanguage();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadQueue('retest'), loadQueue('untested')]).then(([retest, untested]) => {
      if (cancelled) return;
      setRows(rowsOf(retest.ok ? retest.data : undefined, untested.ok ? untested.data : undefined));
      setFailed(!retest.ok && !untested.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  if (rows.length === 0 && !failed) return null;
  const date = dayAndMonth(RETEST_SINCE);
  return (
    <section className="us-animate-fade" style={{ ...cardStyle, gap: 12 }} aria-labelledby="test-queue-title">
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 id="test-queue-title" style={sectionTitleStyle}>
          {t('queue.title')}
        </h2>
        <p style={hintStyle}>{failed ? t('queue.failed') : t('queue.hint')}</p>
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <ServiceRow
              key={row.service.slug}
              service={row.service}
              href={row.url}
              onOpen={props.onOpen}
              detail={row.reason === 'retest' ? t('queue.retest', { date }) : t('queue.untested')}
            />
          ))}
        </div>
      )}
    </section>
  );
}
