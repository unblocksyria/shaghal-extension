import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Availability, CatalogService } from '../../../lib/endpoints';
import { serviceName } from '../../../lib/serviceName';
import { ArrowUpRight, Ban, CircleCheckBig, CircleHelp, Star } from 'lucide-react';

/** Badge colour and icon per status. Labels come from the locale catalog. */
const STATUS: Record<Availability, { fill: string; icon: typeof Ban }> = {
  available: { fill: 'var(--us-status-available)', icon: Star },
  usable: { fill: 'var(--us-status-available)', icon: CircleCheckBig },
  blocked: { fill: 'var(--us-status-blocked)', icon: Ban },
  unknown: { fill: 'var(--us-status-unknown)', icon: CircleHelp },
};

/** A status this build doesn't know renders as unknown. */
export function knownStatus(availability: Availability): Availability {
  return Object.hasOwn(STATUS, availability) ? availability : 'unknown';
}

export function StatusBadge(props: { availability: Availability; small?: boolean }) {
  const { t } = useTranslation();
  const status = knownStatus(props.availability);
  const { fill, icon: Icon } = STATUS[status];
  const label = t(`card.status.${status}.label` as const);
  const small = props.small === true;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? 4 : 6,
        flexShrink: 0,
        fontSize: small ? 'var(--us-text-xs)' : 'var(--us-text-sm)',
        lineHeight: small ? '16px' : '18px',
        fontWeight: 500,
        padding: small ? '2px 8px' : '3px 10px',
        borderRadius: small ? 6 : 'var(--us-radius-badge)',
        color: 'var(--us-on-color)',
        backgroundColor: fill,
        boxShadow: props.availability === 'available' ? 'inset 0 0 0 2px rgba(255, 255, 255, 0.4)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon
        size={small ? 12 : 14}
        fill={props.availability === 'available' ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function ServiceLogo(props: { service: CatalogService; size: number }) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: props.size,
    height: props.size,
    // The corner grows with the logo: 6px on a list row, 8px on the card.
    borderRadius: Math.max(6, Math.round(props.size / 6)),
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

/** One service in a list: a candidate to pick, or an alternative to open. */
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 48,
  textAlign: 'start',
  backgroundColor: 'var(--us-card)',
  border: '1px solid var(--us-border)',
  borderRadius: 'var(--us-radius-control)',
  padding: '8px 12px',
  transition: 'background-color 0.15s ease, border-color 0.15s ease',
  cursor: 'pointer',
  color: 'inherit',
  fontFamily: 'inherit',
  textDecoration: 'none',
};

export function ServiceRow(props: {
  service: CatalogService;
  onPick?: () => void;
  href?: string;
  /** Runs as a link row opens its site in a new tab. */
  onOpen?: () => void;
  /** A short line under the name, such as why the service needs a check. */
  detail?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const style: React.CSSProperties = hovered
    ? { ...rowStyle, borderColor: 'var(--us-border-hover)', backgroundColor: 'var(--us-hover-tint)' }
    : rowStyle;
  const hover = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
  const body = (
    <>
      <ServiceLogo service={props.service} size={28} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
        <span
          style={{
            fontSize: 'var(--us-text-md)',
            lineHeight: '20px',
            fontWeight: 500,
            color: 'var(--us-text-primary)',
          }}
        >
          {serviceName(props.service)}
        </span>
        {props.detail !== undefined && (
          <span style={{ fontSize: 'var(--us-text-xs)', lineHeight: '16px', color: 'var(--us-text-muted)' }}>
            {props.detail}
          </span>
        )}
      </span>
      <StatusBadge availability={props.service.availability} small />
      {props.href !== undefined && (
        <ArrowUpRight size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--us-text-muted)' }} />
      )}
    </>
  );
  if (props.href !== undefined) {
    return (
      <a href={props.href} target="_blank" rel="noreferrer" onClick={props.onOpen} style={style} {...hover}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={props.onPick} style={style} {...hover}>
      {body}
    </button>
  );
}
