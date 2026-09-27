import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Availability, CatalogService } from '../../../lib/endpoints';
import { SITE_BASE } from '../../../lib/config';
import { activeLanguage, i18next, intlLocale, sitePathSegment } from '../../../lib/i18n';
import { serviceName } from '../../../lib/serviceName';
import { hostOf } from '../../../lib/url';
import { hasVoted, setVote, watchVote } from '../../../lib/votes';
import type { MatchState } from '../hooks/useServiceMatch';
import { Button } from '../../../components/ui/Button';
import { cardStyle, hintStyle, titleStyle } from './FormParts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Ban,
  Check,
  CircleCheckBig,
  CircleHelp,
  ClipboardCheck,
  Globe,
  LoaderCircle,
  PlusCircle,
  RefreshCw,
  Star,
} from 'lucide-react';

/** Fills and icons per status; the words come from the catalog (spec 0002, AC-4). */
const STATUS: Record<Availability, { fill: string; icon: typeof Ban }> = {
  available: { fill: 'var(--us-status-available)', icon: Star },
  usable: { fill: 'var(--us-status-available)', icon: CircleCheckBig },
  blocked: { fill: 'var(--us-status-blocked)', icon: Ban },
  unknown: { fill: 'var(--us-status-unknown)', icon: CircleHelp },
};

/** The API may add a status this build does not know yet; it reads as unknown. */
function statusOf(availability: Availability) {
  return Object.hasOwn(STATUS, availability) ? STATUS[availability] : STATUS.unknown;
}

function formatCount(count: number): string {
  return count.toLocaleString(intlLocale(activeLanguage()));
}

/** "Checked 1 Sep 2026", in the active locale (spec 0002, AC-8). */
function checkedText(iso: string | null): string | null {
  if (iso === null || !Number.isFinite(Date.parse(iso))) return null;
  const date = new Date(iso).toLocaleDateString(intlLocale(activeLanguage()), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return i18next.t('card.checked', { date });
}

function StatusBadge(props: { availability: Availability; small?: boolean }) {
  const { t } = useTranslation();
  const { fill, icon: Icon } = statusOf(props.availability);
  const label = t(`card.status.${props.availability}.label` as const);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: props.small === true ? 11.5 : 12.5,
        fontWeight: 500,
        padding: props.small === true ? '2px 8px' : '3px 10px',
        borderRadius: 'var(--us-radius-badge)',
        color: 'var(--us-on-color)',
        backgroundColor: fill,
        boxShadow: props.availability === 'available' ? 'inset 0 0 0 2px rgba(255, 255, 255, 0.4)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon
        size={props.small === true ? 12 : 13}
        fill={props.availability === 'available' ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function ServiceLogo(props: { service: CatalogService; size: number }) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: props.size,
    height: props.size,
    borderRadius: 'var(--us-radius-control)',
    flexShrink: 0,
    backgroundColor: 'var(--us-card-nested)',
    border: '1px solid var(--us-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    color: 'var(--us-accent-text)',
    fontWeight: 500,
    fontSize: props.size * 0.42,
  };
  if (props.service.logoUrl === null || failed) {
    return <div style={box}>{props.service.name.slice(0, 1).toUpperCase()}</div>;
  }
  return (
    <div style={box}>
      <img
        src={props.service.logoUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

const countChip: React.CSSProperties = {
  // Logical, so the chip still sits at the end of the row in a right to left layout.
  marginInlineStart: 'auto',
  borderRadius: 6,
  padding: '1px 8px',
  fontSize: 12,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

/** How long "Remove vote" waits for the confirming second click. */
const CONFIRM_MS = 3000;

/** Counts from this panel's own votes, newer than the cached lookups they would otherwise show. */
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

  const send = async (wantVoted: boolean) => {
    setBusy(true);
    setMessage(null);
    const outcome = await setVote(props.service.slug, wantVoted);
    setBusy(false);
    if (!outcome.ok) {
      setMessage(outcome.message);
      return;
    }
    setVoted(outcome.voted);
    if (outcome.voteCount !== null) {
      latestVoteCounts.set(props.service.slug, outcome.voteCount);
      setCount(outcome.voteCount);
    }
  };

  const click = () => {
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

  const state = busy ? 'busy' : voted === true ? (confirming ? 'confirm' : 'voted') : 'idle';
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
    busy: {
      variant: voted === true ? 'primary' : 'gold',
      icon: <LoaderCircle size={16} style={{ animation: 'spin 1s linear infinite' }} />,
      label: voted === true ? t('card.voteRemoving') : t('card.voteVoting'),
      chip: 'rgba(255, 255, 255, 0.2)',
    },
  };
  const current = look[state];

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Button
        variant={current.variant}
        size="md"
        fullWidth
        onClick={click}
        disabled={busy || voted === null}
        icon={current.icon}
        aria-pressed={voted === true}
        title={state === 'voted' ? t('card.voteRemoveHint') : undefined}
        style={{ justifyContent: 'flex-start' }}
      >
        {current.label}
        <span style={{ ...countChip, backgroundColor: current.chip }}>{formatCount(count)}</span>
      </Button>
      {message !== null ? (
        <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{message}</p>
      ) : (
        <p style={{ ...hintStyle, textAlign: 'center' }}>
          {state === 'confirm' ? t('card.voteConfirm') : t('card.votePriority')}
        </p>
      )}
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

function ServiceView(props: {
  service: CatalogService;
  parentDomain: boolean;
  onReport: () => void;
  onCorrect: () => void;
}) {
  const { t } = useTranslation();
  const { service } = props;
  const checked = checkedText(service.statusCheckedAt);
  // "Netflix · Netflix" says nothing: the company shows only when it differs.
  const company = service.company !== null && service.company.name !== service.name ? service.company.name : null;
  const siteLanguage = sitePathSegment(activeLanguage());
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ServiceLogo key={service.id} service={service} size={44} />
        <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
          <h1 style={titleStyle}>{serviceName(service)}</h1>
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
          {t(`card.status.${service.availability}.meaning` as const)}
          {props.parentDomain && ` ${t('card.subdomain', { name: service.name })}`}
        </p>
      </div>

      <VoteButton key={service.slug} service={service} />

      <Button variant="outline" size="md" fullWidth onClick={props.onReport} icon={<ClipboardCheck size={16} />}>
        {t('card.reportWhatWorks')}
      </Button>

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
        <h1 style={titleStyle}>{t('card.pickTitle')}</h1>
        <p style={hintStyle}>{t('card.pickHint')}</p>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {props.alternatives.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => props.onPick(service)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textAlign: 'start',
              backgroundColor: 'var(--us-card)',
              border: '1px solid var(--us-border)',
              borderRadius: 'var(--us-radius-control)',
              padding: '8px 10px',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--us-border-hover)';
              e.currentTarget.style.backgroundColor = 'var(--us-hover-tint)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--us-border)';
              e.currentTarget.style.backgroundColor = 'var(--us-card)';
            }}
          >
            <ServiceLogo service={service} size={28} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--us-text-primary)' }}>
              {serviceName(service)}
            </span>
            <StatusBadge availability={service.availability} small />
          </button>
        ))}
      </div>
      <button type="button" onClick={props.onNew} style={{ ...linkStyle, justifySelf: 'center' }}>
        {t('card.noneOfThese')}
      </button>
    </section>
  );
}

function MessageView(props: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 3, color: 'var(--us-accent-text)' }}>{props.icon}</span>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ ...titleStyle, fontSize: 17 }}>{props.title}</h1>
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
  /** A service picked from the list, which wins over the match. */
  picked: CatalogService | null;
  onPick: (service: CatalogService) => void;
  onRetry: () => void;
  onReport: (service: CatalogService) => void;
  onCorrect: (service: CatalogService) => void;
  onReportNew: () => void;
}) {
  const { state } = props;
  const { t } = useTranslation();

  if (state.status === 'no-page') {
    return <MessageView icon={<Globe size={20} />} title={t('card.emptyTitle')} detail={t('card.emptyDetail')} />;
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

  const service = props.picked ?? state.match.service;
  if (service !== null) {
    return (
      <ServiceView
        service={service}
        parentDomain={props.picked === null && state.match.matchType === 'parent_domain'}
        onReport={() => props.onReport(service)}
        onCorrect={() => props.onCorrect(service)}
      />
    );
  }
  if (state.match.alternatives.length > 0) {
    return <PickView alternatives={state.match.alternatives} onPick={props.onPick} onNew={props.onReportNew} />;
  }
  return (
    <MessageView
      icon={<PlusCircle size={20} />}
      title={t('card.untrackedTitle', {
        host: hostOf(props.pageUrl ?? '').replace(/^www\./, ''),
      })}
      detail={t('card.untrackedDetail')}
      action={
        <Button variant="primary" size="md" fullWidth onClick={props.onReportNew} icon={<PlusCircle size={16} />}>
          {t('common.reportAService')}
        </Button>
      }
    />
  );
}
