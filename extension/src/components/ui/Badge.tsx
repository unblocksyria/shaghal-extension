import React from 'react';

export type BadgeLevel = 'working' | 'failing' | 'unknown' | 'not_tracked' | 'core' | 'gold';

interface BadgeProps {
  level: BadgeLevel;
  label?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ level, label, size = 'md' }) => {
  const getStyles = (): { bg: string; color: string; border: string } => {
    switch (level) {
      case 'working':
        return {
          bg: 'var(--us-working-bg)',
          color: 'var(--us-working-text)',
          border: 'var(--us-working-border)',
        };
      case 'failing':
        return {
          bg: 'var(--us-failing-bg)',
          color: 'var(--us-failing)',
          border: 'var(--us-failing-border)',
        };
      case 'unknown':
        return {
          bg: 'var(--us-unknown-bg)',
          color: 'var(--us-unknown)',
          border: 'var(--us-unknown-border)',
        };
      case 'not_tracked':
        return {
          bg: 'rgba(255, 255, 255, 0.04)',
          color: 'var(--us-text-dim)',
          border: 'rgba(255, 255, 255, 0.08)',
        };
      case 'core':
        return {
          bg: 'rgba(185, 168, 123, 0.1)',
          color: 'var(--us-gold)',
          border: 'rgba(185, 168, 123, 0.25)',
        };
      case 'gold':
      default:
        return {
          bg: 'rgba(185, 168, 123, 0.15)',
          color: 'var(--us-gold)',
          border: 'rgba(185, 168, 123, 0.3)',
        };
    }
  };

  const styleConfig = getStyles();
  const displayLabel = label ?? level.replace('not_tracked', 'not tracked');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 600,
        textTransform: 'capitalize',
        backgroundColor: styleConfig.bg,
        color: styleConfig.color,
        border: `1px solid ${styleConfig.border}`,
        borderRadius: 'var(--us-radius-pill)',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        lineHeight: 1.3,
        letterSpacing: '0.02em',
      }}
    >
      {level === 'working' && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--us-working)' }} />
      )}
      {level === 'failing' && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--us-failing)' }} />
      )}
      {displayLabel}
    </span>
  );
};
