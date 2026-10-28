import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogService, ProgressStatus, ServiceFunctionality, ServiceRecord } from '../../../lib/endpoints';
import { partChecks, searchServices } from '../../../lib/endpoints';
import { SITE_BASE } from '../../../lib/config';
import { rememberFallbackHeading } from '../../../lib/focusFlow';
import { countryName } from '../../../lib/geo';
import { recentlyReported, sentHistory, watchSentHistory, type SentEntry } from '../../../lib/history';
import { activeLanguage, directionOf, i18next, intlLocale, sitePathSegment, shortDate } from '../../../lib/i18n';
import { loadFunctionalities } from '../../../lib/reads';
import { needsRecheck, RETEST_SINCE } from '../../../lib/retest';
import { isolate, serviceName } from '../../../lib/serviceName';
import { hostOf, webUrl } from '../../../lib/url';
import { hasVoted, setVote, watchVote } from '../../../lib/votes';
import { prefetchTurnstileToken } from '../../../lib/turnstile';
import type { MatchState } from '../hooks/useServiceMatch';
import { useBrowsingCountry } from '../hooks/useBrowsingCountry';
import { useServiceDetails, type DetailsState } from '../hooks/useServiceDetails';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { cardStyle, hintStyle, titleStyle } from './FormParts';
import { knownStatus, ServiceLogo, ServiceRow, StatusBadge } from './ServiceRow';
import { TestQueue } from './TestQueue';
import { VerificationSlot } from './VerificationSlot';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ClipboardCheck,
  Globe,
  LoaderCircle,
  Mail,
  PlusCircle,
  RefreshCw,
  WifiOff,
} from 'lucide-react';

function formatCount(count: number): string {
  return count.toLocaleString(intlLocale(activeLanguage()));
}

/** "Checked 1 Sep 2026", in the active locale. */
function checkedText(iso: string | null): string | null {
  const date = shortDate(iso);
  return date === null ? null : i18next.t('card.checked', { date });
}

/** "Since 16 Feb 2026", in the active locale. */
function sinceText(iso: string | null | undefined): string | null {
  const date = shortDate(iso);
  return date === null ? null : i18next.t('card.since', { date });
}

/** The card's colour for a part's level, matching the website's level cells. The words come from the report catalog. */
const LEVEL_COLOR: Record<ServiceFunctionality['level'], string> = {
  working: 'var(--us-level-working)',
  failing: 'var(--us-level-failing)',
  unknown: 'var(--us-status-unknown)',
};

const LEVEL_LABEL = {
  working: 'report.levelWorking',
  failing: 'report.levelFailing',
  unknown: 'report.levelUnknown',
} as const;

const countChip: React.CSSProperties = {
  // Logical property, so the chip stays at the end of the row in RTL.
  marginInlineStart: 'auto',
  borderRadius: 6,
  padding: '1px 8px',
  fontSize: 12,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

/** How long "Remove vote" waits for the confirming second click. */
const CONFIRM_MS = 3000;

/** Counts returned by this panel's votes. They override the older counts in cached lookups. */
const latestVoteCounts = new Map<string, number>();

function VoteButton(props: { service: CatalogService }) {
  const { t } = useTranslation();
  const [voted, setVoted] = useState<boolean | null>(null);
  const [count, setCount] = useState(() => latestVoteCounts.get(props.service.slug) ?? props.service.voteCount);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let changed = false;
    const unwatch = watchVote(props.service.slug, (value) => {
      changed = true;
      setVoted(value);
    });
    void hasVoted(props.service.slug).then((value) => {
      if (!cancelled && !changed) setVoted(value);
    });
    return () => {
      cancelled = true;
      unwatch();
      clearTimeout(confirmTimer.current);
    };
  }, [props.service.slug]);

  if (props.service.availability === 'available') {
    const votes = t('card.voteCount', { count, n: formatCount(count) });
    return (
      <div
        role="img"
        aria-label={t('card.votesClosed', { votes })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 40,
          border: '1px solid var(--us-border)',
          borderRadius: 'var(--us-radius-control)',
          backgroundColor: 'var(--us-muted)',
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <ArrowUp size={16} color="var(--us-status-available)" aria-hidden="true" />
        {votes}
      </div>
    );
  }

  // The button shows the outcome at once and the request catches up. A refusal
  // puts the button and the count back and says why.
  const send = async (wantVoted: boolean) => {
    const before = { voted, count };
    setBusy(true);
    setMessage(null);
    setVoted(wantVoted);
    setCount((current) => Math.max(0, current + (wantVoted ? 1 : -1)));
    const outcome = await setVote(props.service.slug, wantVoted);
    setBusy(false);
    if (!outcome.ok) {
      setVoted(before.voted);
      setCount(before.count);
      setMessage(outcome.message);
      return;
    }
    setVoted(outcome.voted);
    // No count means the server was already in that state, so the count before still holds.
    const settled = outcome.voteCount ?? before.count;
    if (outcome.voteCount !== null) latestVoteCounts.set(props.service.slug, settled);
    setCount(settled);
  };

  const click = () => {
    if (busy) return;
    if (voted !== true) {
      void send(true);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer.current);
    setConfirming(false);
    void send(false);
  };

  const state = voted === true ? (confirming ? 'confirm' : 'voted') : 'idle';
  const look: Record<
    typeof state,
    { variant: 'gold' | 'primary' | 'danger'; icon: React.ReactNode; label: string; chip: string }
  > = {
    idle: { variant: 'gold', icon: <ArrowUp size={16} />, label: t('card.voteIdle'), chip: 'rgba(9, 39, 36, 0.15)' },
    voted: {
      variant: 'primary',
      icon: <Check size={16} />,
      label: t('card.voteVoted'),
      chip: 'rgba(255, 255, 255, 0.2)',
    },
    confirm: {
      variant: 'danger',
      icon: <ArrowDown size={16} />,
      label: t('card.voteRemove'),
      chip: 'rgba(255, 255, 255, 0.2)',
    },
  };
  const current = look[state];

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <VerificationSlot>
        <Button
          variant={current.variant}
          size="md"
          fullWidth
          onClick={click}
          // Starts verification on the way to a click, so the vote goes out sooner.
          onPointerEnter={() => voted !== null && prefetchTurnstileToken('vote')}
          onFocus={() => voted !== null && prefetchTurnstileToken('vote')}
          disabled={voted === null}
          aria-busy={busy}
          icon={busy ? <LoaderCircle size={16} style={{ animation: 'spin 1s linear infinite' }} /> : current.icon}
          aria-pressed={voted === true}
          title={state === 'voted' ? t('card.voteRemoveHint') : undefined}
          style={{ justifyContent: 'flex-start' }}
        >
          {current.label}
          <span style={{ ...countChip, backgroundColor: current.chip }}>{formatCount(count)}</span>
        </Button>
      </VerificationSlot>
      {/* In place, because the message is there for the reader as much as the eye. */}
      <div aria-live="polite" style={{ display: 'contents' }}>
        {message !== null ? (
          <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{message}</p>
        ) : (
          <p style={{ ...hintStyle, textAlign: 'center' }}>
            {state === 'confirm' ? t('card.voteConfirm') : t('card.votePriority')}
          </p>
        )}
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 13,
  color: 'var(--us-link)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  textDecorationColor: 'var(--us-border-hover)',
};

/** The parts this browser reported for a service in the last 30 days, by slug, kept current. */
function useReportedParts(slug: string): Map<string, number> {
  const [history, setHistory] = useState<SentEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    void sentHistory().then((list) => {
      if (!cancelled) setHistory(list);
    });
    const stop = watchSentHistory(setHistory);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return recentlyReported(history, slug);
}

const actionStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--us-link)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  textDecorationColor: 'var(--us-border-hover)',
};

/**
 * The site's "What works" table, as stacked rows the narrow panel can hold.
 * The gaps are where a tester helps most, so an unchecked part offers "Test
 * this", a failing part due a recheck offers "Still fails?", and both open the
 * report with that part already added.
 */
function WorksSection(props: {
  parts: ServiceFunctionality[];
  recheck: boolean;
  reported: Map<string, number>;
  onTest: (slug: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <h2 style={{ ...titleStyle, fontSize: 15 }}>{t('card.worksTitle')}</h2>
        <p style={hintStyle}>{t('card.worksHint')}</p>
      </div>
      <div style={{ display: 'grid', borderTop: '1px solid var(--us-border)' }}>
        {props.parts.map((part, index) => {
          // "Since" is when the level last changed. An unchecked part never had one.
          const since = part.level === 'unknown' ? null : sinceText(part.changedAt);
          const checked = checkedText(part.lastObservedAt ?? null);
          const reportedAt = props.reported.get(part.slug);
          const action =
            reportedAt !== undefined
              ? null
              : part.level === 'unknown'
                ? t('card.testThis')
                : props.recheck && needsRecheck(part)
                  ? t('card.stillFails')
                  : null;
          // The newest check is the part's current state. The ones before it are history.
          const earlier = partChecks(part).slice(1, 3);
          return (
            <div
              key={part.slug}
              style={{
                display: 'grid',
                gap: 3,
                padding: '10px 0',
                borderTop: index === 0 ? undefined : '1px solid var(--us-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{part.name}</span>
                <span
                  style={{
                    marginInlineStart: 'auto',
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    color: LEVEL_COLOR[part.level],
                  }}
                >
                  {t(LEVEL_LABEL[part.level])}
                </span>
              </div>
              {part.description != null && part.description !== '' && (
                <p dir="auto" style={{ ...hintStyle, fontSize: 12.5, textAlign: 'start' }}>
                  {part.description}
                </p>
              )}
              {(since !== null || checked !== null || action !== null || reportedAt !== undefined) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
                  {(since !== null || checked !== null) && (
                    <span style={{ ...hintStyle, fontSize: 11.5 }}>{[since, checked].filter(Boolean).join(' · ')}</span>
                  )}
                  {reportedAt !== undefined && (
                    <span style={{ ...hintStyle, fontSize: 11.5, color: 'var(--us-accent-text)' }}>
                      <Check size={11} aria-hidden="true" style={{ verticalAlign: '-1px', marginInlineEnd: 3 }} />
                      {t('card.reportedOn', { date: shortDate(new Date(reportedAt).toISOString()) })}
                    </span>
                  )}
                  {action !== null && (
                    <button
                      type="button"
                      style={{ ...actionStyle, marginInlineStart: 'auto' }}
                      onClick={() => props.onTest(part.slug)}
                      onPointerEnter={() => void loadFunctionalities()}
                      aria-label={`${action} ${part.name}`}
                    >
                      {action}
                    </button>
                  )}
                </div>
              )}
              {earlier.length > 0 && (
                <details>
                  <summary style={{ ...hintStyle, fontSize: 11.5, cursor: 'pointer', width: 'fit-content' }}>
                    {t('card.earlierChecks')}
                  </summary>
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                    {earlier.map((check) => (
                      <li key={check.observedAt} style={{ display: 'grid', gap: 2 }}>
                        <span style={{ ...hintStyle, fontSize: 11.5 }}>
                          {shortDate(check.observedAt)} ·{' '}
                          <span style={{ fontWeight: 700, color: LEVEL_COLOR[check.level] }}>
                            {t(LEVEL_LABEL[check.level])}
                          </span>
                        </span>
                        {check.description != null && check.description !== '' && (
                          <p dir="auto" style={{ ...hintStyle, textAlign: 'start' }}>
                            {check.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Asks for the recheck that clears `needsRetesting`, naming the parts that need it. */
function RecheckPrompt(props: { parts: ServiceFunctionality[]; onTest: (slugs: string[]) => void }) {
  const { t } = useTranslation();
  const date = shortDate(RETEST_SINCE);
  const names = new Intl.ListFormat(intlLocale(activeLanguage()), { type: 'conjunction' }).format(
    props.parts.map((part) => part.name),
  );
  return (
    <div className="us-callout us-callout-gold" role="note">
      <RefreshCw size={16} aria-hidden="true" />
      <span style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
        <span>
          <strong style={{ fontWeight: 600 }}>{t('card.retestTitle')} </strong>
          {props.parts.length > 0
            ? t('card.retestParts', { count: props.parts.length, parts: names, date })
            : t('card.retestGeneric', { date })}
        </span>
        {props.parts.length > 0 && (
          <button
            type="button"
            style={actionStyle}
            onClick={() => props.onTest(props.parts.map((part) => part.slug))}
            onPointerEnter={() => void loadFunctionalities()}
          >
            {t('card.retestAction')}
          </button>
        )}
      </span>
    </div>
  );
}

const PROGRESS: ProgressStatus[] = [
  'no_outreach',
  'contacted',
  'no_response',
  'in_review',
  'partially_resolved',
  'unblocked',
  'declined',
];

/** How far outreach to the company has gone, and the story so far (issue 47). */
function OutreachSection(props: { record: ServiceRecord }) {
  const { t } = useTranslation();
  const status = PROGRESS.find((value) => value === props.record.progressStatus);
  const summary = props.record.timelineSummary?.trim();
  if (status === undefined && (summary === undefined || summary === '')) return null;
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ ...titleStyle, fontSize: 15 }}>{t('card.outreachTitle')}</h2>
        {status !== undefined && <span className="us-tag">{t(`card.progress.${status}` as const)}</span>}
      </div>
      {summary !== undefined && summary !== '' ? (
        <p dir="auto" className="us-clamp" style={{ ...hintStyle, fontSize: 12.5, textAlign: 'start' }}>
          {summary}
        </p>
      ) : (
        status !== undefined && (
          <p style={{ ...hintStyle, fontSize: 12.5 }}>{t(`card.progressHint.${status}` as const)}</p>
        )
      )}
    </section>
  );
}

/** Where to ask the company about the block (issue 41). */
function ContactRow(props: { name: string; record: ServiceRecord }) {
  const { t } = useTranslation();
  const page = webUrl(props.record.supportUrl);
  const email = props.record.supportEmail?.trim();
  const mail = email !== undefined && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
  if (page === null && mail === null) return null;
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h2 style={{ ...titleStyle, fontSize: 15 }}>{t('card.contact', { name: props.name })}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {page !== null && (
          <a href={page} target="_blank" rel="noreferrer" style={linkStyle}>
            {t('card.supportPage')} <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
        {mail !== null && (
          <a href={`mailto:${mail}`} style={linkStyle}>
            <Mail size={13} aria-hidden="true" /> <bdi dir="ltr">{mail}</bdi>
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Tests only count from a Syrian connection, so a tester abroad or on a VPN
 * hears it here, before writing a report, and is pointed at the vote.
 */
function AbroadNotice(props: { country: string; checking: boolean; recheck: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="us-callout us-callout-warning" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        <strong style={{ fontWeight: 600 }}>{t('card.abroadTitle')} </strong>
        {t('card.abroadBody', { country: countryName(props.country, intlLocale(activeLanguage())) })}{' '}
        <button
          type="button"
          className="us-text-link"
          onClick={props.recheck}
          disabled={props.checking}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
        >
          {props.checking ? t('vpn.checking') : t('vpn.checkAgain')}
        </button>
      </span>
    </div>
  );
}

/** The site's "What works instead", for a blocked service only. Each row opens the site. */
function AlternativesSection(props: { service: CatalogService; alternatives: CatalogService[] }) {
  const { t } = useTranslation();
  const siteLanguage = sitePathSegment(activeLanguage());
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <h2 style={{ ...titleStyle, fontSize: 15 }}>{t('card.alternativesTitle')}</h2>
        <p style={hintStyle}>{t('card.alternativesHint', { name: serviceName(props.service) })}</p>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {props.alternatives.map((item) => (
          <ServiceRow
            key={item.id}
            service={item}
            href={`${SITE_BASE}${siteLanguage}/services/${encodeURIComponent(item.slug)}`}
          />
        ))}
      </div>
    </section>
  );
}

/** A way off a card that may not be the service the tester is using. */
interface CardExit {
  label: string;
  onLeave: () => void;
  /** `back` shows as a back link above the card; `notThis` as a question under the status. */
  kind: 'back' | 'notThis';
}

function ServiceView(props: {
  service: CatalogService;
  details: DetailsState;
  parentDomain: boolean;
  exit: CardExit | null;
  onReport: (parts?: string[]) => void;
  onCorrect: () => void;
}) {
  const { t } = useTranslation();
  const { service, details } = props;
  const checked = checkedText(service.statusCheckedAt);
  // Show the company only when it differs from the service name.
  const company = service.company !== null && service.company.name !== service.name ? service.company.name : null;
  const siteLanguage = sitePathSegment(activeLanguage());
  const record = details.status === 'ready' ? details.record : null;
  const parts = record?.functionalities ?? [];
  const status = knownStatus(service.availability);
  const reported = useReportedParts(service.slug);
  const location = useBrowsingCountry();
  const abroad = location.country !== null && location.country !== 'SY';
  // Only what works from Syria is worth pointing a blocked service's tester at.
  const alternatives = (record?.alternatives ?? []).filter(
    (item) => item.slug !== service.slug && (item.availability === 'available' || item.availability === 'usable'),
  );
  const offerAlternatives = status === 'blocked' && alternatives.length > 0;
  const needsRetesting = service.needsRetesting === true || record?.needsRetesting === true;
  const recheckParts = needsRetesting ? parts.filter((part) => needsRecheck(part) && !reported.has(part.slug)) : [];
  // Nobody has checked core use, so a test is worth more than a vote, unless tests can't count from here.
  const testFirst = status === 'unknown' && !abroad;
  const Back = directionOf(activeLanguage()) === 'rtl' ? ArrowRight : ArrowLeft;

  const reportButton = (
    <Button
      variant={testFirst ? 'primary' : 'outline'}
      size="md"
      fullWidth
      onClick={() => props.onReport(testFirst ? ['core_use', 'landing_page'] : undefined)}
      // The report form needs the parts catalogue; start fetching it on the way to a click.
      onPointerEnter={() => void loadFunctionalities()}
      onFocus={() => void loadFunctionalities()}
      icon={<ClipboardCheck size={16} />}
    >
      {testFirst ? t('card.testIt') : t('card.reportWhatWorks')}
    </Button>
  );

  return (
    <section className="us-animate-fade" style={cardStyle}>
      {props.exit?.kind === 'back' && (
        <button
          type="button"
          onClick={props.exit.onLeave}
          style={{ ...linkStyle, justifySelf: 'start', textDecoration: 'none' }}
        >
          <Back size={14} aria-hidden="true" /> {props.exit.label}
        </button>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ServiceLogo key={service.id} service={service} size={44} />
        <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
          <h1 ref={rememberFallbackHeading} tabIndex={-1} style={titleStyle}>
            {serviceName(service)}
          </h1>
          {(company !== null || checked !== null) && (
            <span style={{ fontSize: 12, color: 'var(--us-text-muted)' }}>
              {[company, checked].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <StatusBadge availability={service.availability} />
        <p style={{ ...hintStyle, fontSize: 13 }}>
          {t(`card.status.${status}.meaning` as const)}
          {props.parentDomain && ` ${t('card.subdomain', { name: isolate(service.name) })}`}
        </p>
        {props.exit?.kind === 'notThis' && (
          <button type="button" onClick={props.exit.onLeave} style={linkStyle}>
            {props.exit.label}
          </button>
        )}
      </div>

      {abroad && location.country !== null && (
        <AbroadNotice country={location.country} checking={location.checking} recheck={location.recheck} />
      )}
      {needsRetesting && !abroad && (details.status !== 'loading' || recheckParts.length > 0) && (
        <RecheckPrompt parts={recheckParts} onTest={(slugs) => props.onReport(slugs)} />
      )}

      {testFirst && reportButton}
      <VoteButton key={service.slug} service={service} />
      {!testFirst && reportButton}

      {parts.length > 0 && (
        <WorksSection
          parts={parts}
          recheck={needsRetesting}
          reported={reported}
          onTest={(slug) => props.onReport([slug])}
        />
      )}
      {record !== null && status !== 'available' && <OutreachSection record={record} />}
      {offerAlternatives && <AlternativesSection service={service} alternatives={alternatives} />}
      {record !== null && (status === 'blocked' || status === 'usable') && (
        <ContactRow name={serviceName(service)} record={record} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={props.onCorrect} style={linkStyle}>
          {t('card.suggestCorrection')}
        </button>
        <a
          href={`${SITE_BASE}${siteLanguage}/services/${encodeURIComponent(service.slug)}`}
          target="_blank"
          rel="noreferrer"
          style={linkStyle}
        >
          {t('card.viewOnSite')} <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}

function PickView(props: {
  alternatives: CatalogService[];
  onPick: (service: CatalogService) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 ref={rememberFallbackHeading} tabIndex={-1} style={titleStyle}>
          {t('card.pickTitle')}
        </h1>
        <p style={hintStyle}>{t('card.pickHint')}</p>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {props.alternatives.map((service) => (
          <ServiceRow key={service.id} service={service} onPick={() => props.onPick(service)} />
        ))}
      </div>
      <button type="button" onClick={props.onNew} style={{ ...linkStyle, justifySelf: 'center' }}>
        {t('card.noneOfThese')}
      </button>
    </section>
  );
}

/** The pause after a keystroke before the card searches, so typing stays cheap. */
const SEARCH_DELAY_MS = 300;
/** The shortest search: below it, the picker would ask for the whole catalogue. */
const SEARCH_MIN_CHARS = 2;

/**
 * The "not tracked" card. The catalogue may still track the service under
 * another address, so the card searches by name and offers what it finds,
 * with reporting a new service as the last resort.
 */
function UntrackedView(props: {
  host: string;
  onPick: (service: CatalogService) => void;
  onNew: () => void;
  /** Set when the tester said the matched service was not the one they use. */
  onBack?: { label: string; onLeave: () => void };
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<
    | { term: string; state: 'searching' }
    | { term: string; state: 'ready'; items: CatalogService[] }
    | { term: string; state: 'failed' }
    | null
  >(null);

  const term = query.trim();
  const activeTerm = term.length >= SEARCH_MIN_CHARS ? term : '';
  // An answer belongs to the term on the field, so a reply for an older term
  // that arrives late is dropped rather than shown.
  const shown = answer !== null && answer.term === activeTerm ? answer : null;

  useEffect(() => {
    if (activeTerm === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setAnswer({ term: activeTerm, state: 'searching' });
      void searchServices(activeTerm, controller.signal).then((outcome) => {
        if (outcome.ok) setAnswer({ term: activeTerm, state: 'ready', items: outcome.data });
        else setAnswer({ term: activeTerm, state: 'failed' });
      });
    }, SEARCH_DELAY_MS);
    // A newer keystroke owns the request, so the older one is cancelled.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeTerm]);

  const rows = shown?.state === 'ready' ? shown.items : [];
  const Back = directionOf(activeLanguage()) === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <section className="us-animate-fade" style={cardStyle}>
      {props.onBack !== undefined && (
        <button
          type="button"
          onClick={props.onBack.onLeave}
          style={{ ...linkStyle, justifySelf: 'start', textDecoration: 'none' }}
        >
          <Back size={14} aria-hidden="true" /> {props.onBack.label}
        </button>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 3, color: 'var(--us-accent-text)' }}>
          <PlusCircle size={20} />
        </span>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 ref={rememberFallbackHeading} tabIndex={-1} style={{ ...titleStyle, fontSize: 17 }}>
            {t('card.untrackedTitle', { host: props.host })}
          </h1>
          <p style={{ ...hintStyle, fontSize: 13 }}>{t('card.untrackedDetail')}</p>
          <p style={{ ...hintStyle, fontSize: 13 }}>{t('card.searchHint')}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <Input
          label={t('card.searchLabel')}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('card.searchPlaceholder')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-busy={shown?.state === 'searching'}
        />
        {/* Announced, because the rows and the refusals replace one another below the field. */}
        <div aria-live="polite" style={{ display: 'contents' }}>
          {rows.length > 0 ? (
            rows.map((service) => (
              <ServiceRow key={service.id} service={service} onPick={() => props.onPick(service)} />
            ))
          ) : shown?.state === 'failed' ? (
            <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{t('card.searchFailed')}</p>
          ) : shown?.state === 'ready' && rows.length === 0 ? (
            <p style={hintStyle}>{t('card.searchEmpty')}</p>
          ) : shown?.state === 'searching' ? (
            <p style={hintStyle}>{t('card.searching')}</p>
          ) : null}
        </div>
      </div>
      <Button variant="primary" size="md" fullWidth onClick={props.onNew} icon={<PlusCircle size={16} />}>
        {t('common.reportAService')}
      </Button>
    </section>
  );
}

function MessageView(props: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 3, color: 'var(--us-accent-text)' }}>{props.icon}</span>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 ref={rememberFallbackHeading} tabIndex={-1} style={{ ...titleStyle, fontSize: 17 }}>
            {props.title}
          </h1>
          <p style={{ ...hintStyle, fontSize: 13 }}>{props.detail}</p>
        </div>
      </div>
      {props.action}
    </section>
  );
}

export function PageCard(props: {
  pageUrl: string | null;
  state: MatchState;
  /** A service picked from the candidate list or the search. Overrides the match. */
  picked: CatalogService | null;
  onPick: (service: CatalogService) => void;
  /** Forgets the pick, back to the list or the search it came from. */
  onUnpick: () => void;
  onRetry: () => void;
  /** Opens the report, with `parts` already added when the tester came for them. */
  onReport: (service: CatalogService, parts?: string[]) => void;
  onCorrect: (service: CatalogService) => void;
  onReportNew: () => void;
}) {
  const { state } = props;
  const { t } = useTranslation();
  // The page on which the tester said the matched service isn't theirs.
  const [notThisOn, setNotThisOn] = useState<string | null>(null);
  const rejected = notThisOn !== null && notThisOn === props.pageUrl;
  // Hooks first: the card asks for the record behind whatever it is showing.
  const matched = state.status === 'ready' && !rejected ? state.match.service : null;
  const service = props.picked ?? matched;
  const details = useServiceDetails(service === null ? null : service.slug);
  const queue = <TestQueue />;

  if (state.status === 'no-page') {
    return (
      <>
        <MessageView icon={<Globe size={20} />} title={t('card.emptyTitle')} detail={t('card.emptyDetail')} />
        {queue}
      </>
    );
  }
  if (state.status === 'loading') {
    return (
      <MessageView
        icon={<RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />}
        title={t('card.loadingTitle')}
        detail={hostOf(props.pageUrl ?? '')}
      />
    );
  }
  if (state.status === 'error') {
    return (
      <MessageView
        icon={<Globe size={20} />}
        title={t('card.errorTitle')}
        detail={state.message}
        action={
          <Button
            variant="surface"
            size="sm"
            onClick={props.onRetry}
            icon={<RefreshCw size={13} />}
            style={{ justifySelf: 'start' }}
          >
            {t('common.tryAgain')}
          </Button>
        }
      />
    );
  }

  const fromList = state.match.alternatives.length > 0;
  if (service !== null) {
    const parentDomain = props.picked === null && state.match.matchType === 'parent_domain';
    const exit: CardExit | null =
      props.picked !== null
        ? { kind: 'back', label: fromList ? t('card.backToList') : t('card.backToSearch'), onLeave: props.onUnpick }
        : parentDomain
          ? {
              kind: 'notThis',
              label: t('card.notThis', { name: isolate(serviceName(service)) }),
              onLeave: () => setNotThisOn(props.pageUrl),
            }
          : null;
    return (
      <ServiceView
        service={service}
        details={details}
        parentDomain={parentDomain}
        exit={exit}
        onReport={(parts) => props.onReport(service, parts)}
        onCorrect={() => props.onCorrect(service)}
      />
    );
  }
  if (fromList) {
    return <PickView alternatives={state.match.alternatives} onPick={props.onPick} onNew={props.onReportNew} />;
  }
  return (
    <>
      <UntrackedView
        host={hostOf(props.pageUrl ?? '').replace(/^www\./, '')}
        onPick={props.onPick}
        onNew={props.onReportNew}
        onBack={
          rejected && state.match.service !== null
            ? {
                label: t('common.backTo', { name: serviceName(state.match.service) }),
                onLeave: () => setNotThisOn(null),
              }
            : undefined
        }
      />
      {queue}
    </>
  );
}
