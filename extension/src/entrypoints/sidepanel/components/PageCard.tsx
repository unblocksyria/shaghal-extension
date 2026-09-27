import { useEffect, useRef, useState } from 'react';
import type { Availability, CatalogService } from '../../../lib/endpoints';
import { SITE_BASE } from '../../../lib/config';
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

const STATUS: Record<Availability, { label: string; meaning: string; fill: string; icon: typeof Ban }> = {
  available: {
    label: 'Available',
    meaning: 'Core use and every other part we track work from Syria.',
    fill: 'var(--us-status-available)',
    icon: Star,
  },
  usable: {
    label: 'Usable',
    meaning: 'Core use works from Syria. Some other functionality may not.',
    fill: 'var(--us-status-available)',
    icon: CircleCheckBig,
  },
  blocked: {
    label: 'Blocked',
    meaning: 'Core use does not work from Syria.',
    fill: 'var(--us-status-blocked)',
    icon: Ban,
  },
  unknown: {
    label: 'Unknown',
    meaning: 'Nobody has tested core use from Syria yet.',
    fill: 'var(--us-status-unknown)',
    icon: CircleHelp,
  },
};

/** The API may add a status this build does not know yet; it reads as unknown. */
function statusOf(availability: Availability) {
  return Object.hasOwn(STATUS, availability) ? STATUS[availability] : STATUS.unknown;
}

function formatCount(count: number): string {
  return count.toLocaleString('en');
}

function checkedText(iso: string | null): string | null {
  if (iso === null || !Number.isFinite(Date.parse(iso))) return null;
  return `Checked ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function StatusBadge(props: { availability: Availability; small?: boolean }) {
  const { label, fill, icon: Icon } = statusOf(props.availability);
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
  marginLeft: 'auto',
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
    const votes = count === 1 ? '1 vote' : `${formatCount(count)} votes`;
    return (
      <div
        role="img"
        aria-label={`${votes}. Voting is closed because this service is available.`}
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
    idle: { variant: 'gold', icon: <ArrowUp size={16} />, label: 'I need this', chip: 'rgba(9, 39, 36, 0.15)' },
    voted: { variant: 'primary', icon: <Check size={16} />, label: 'Voted', chip: 'rgba(255, 255, 255, 0.2)' },
    confirm: {
      variant: 'danger',
      icon: <ArrowDown size={16} />,
      label: 'Remove vote',
      chip: 'rgba(255, 255, 255, 0.2)',
    },
    busy: {
      variant: voted === true ? 'primary' : 'gold',
      icon: <LoaderCircle size={16} style={{ animation: 'spin 1s linear infinite' }} />,
      label: voted === true ? 'Removing…' : 'Voting…',
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
        title={state === 'voted' ? 'Click to remove your vote' : undefined}
        style={{ justifyContent: 'flex-start' }}
      >
        {current.label}
        <span style={{ ...countChip, backgroundColor: current.chip }}>{formatCount(count)}</span>
      </Button>
      {message !== null ? (
        <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{message}</p>
      ) : (
        <p style={{ ...hintStyle, textAlign: 'center' }}>
          {state === 'confirm'
            ? 'Click again to remove your vote.'
            : 'High-vote services get prioritized for outreach.'}
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
  const { service } = props;
  const checked = checkedText(service.statusCheckedAt);
  // "Netflix · Netflix" says nothing: the company shows only when it differs.
  const company = service.company !== null && service.company.name !== service.name ? service.company.name : null;
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ServiceLogo key={service.id} service={service} size={44} />
        <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
          <h1 style={titleStyle}>{service.name}</h1>
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
          {statusOf(service.availability).meaning}
          {props.parentDomain && ` This page is on a subdomain of ${service.name}'s site, so it may differ.`}
        </p>
      </div>

      <VoteButton key={service.slug} service={service} />

      <Button variant="outline" size="md" fullWidth onClick={props.onReport} icon={<ClipboardCheck size={16} />}>
        Report what works
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={props.onCorrect} style={linkStyle}>
          Suggest Correction
        </button>
        <a
          href={`${SITE_BASE}/en/services/${encodeURIComponent(service.slug)}`}
          target="_blank"
          rel="noreferrer"
          style={linkStyle}
        >
          View on Unblock Syria <ArrowUpRight size={13} />
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
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 style={titleStyle}>Which service is this?</h1>
        <p style={hintStyle}>This site has several services we track. Pick the one you are using.</p>
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
              textAlign: 'left',
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
              {service.name}
            </span>
            <StatusBadge availability={service.availability} small />
          </button>
        ))}
      </div>
      <button type="button" onClick={props.onNew} style={{ ...linkStyle, justifySelf: 'center' }}>
        None of these? Report a Service
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

  if (state.status === 'no-page') {
    return (
      <MessageView
        icon={<Globe size={20} />}
        title="Open a website"
        detail="Go to any website in this window to see whether it works from Syria."
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <MessageView
        icon={<RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />}
        title="Checking this site…"
        detail={hostOf(props.pageUrl ?? '')}
      />
    );
  }
  if (state.status === 'error') {
    return (
      <MessageView
        icon={<Globe size={20} />}
        title="Could not check this site"
        detail={state.message}
        action={
          <Button
            variant="surface"
            size="sm"
            onClick={props.onRetry}
            icon={<RefreshCw size={13} />}
            style={{ justifySelf: 'start' }}
          >
            Try again
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
      title={`${hostOf(props.pageUrl ?? '').replace(/^www\./, '')} isn't tracked yet`}
      detail="If it blocks Syria, tell us about it. We verify it, then track it."
      action={
        <Button variant="primary" size="md" fullWidth onClick={props.onReportNew} icon={<PlusCircle size={16} />}>
          Report a Service
        </Button>
      }
    />
  );
}
