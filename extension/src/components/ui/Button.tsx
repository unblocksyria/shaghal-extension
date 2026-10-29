import React from 'react';

export type ButtonVariant = 'primary' | 'gold' | 'outline' | 'surface' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, { rest: React.CSSProperties; hover: React.CSSProperties }> = {
  primary: {
    rest: {
      backgroundColor: 'var(--us-primary)',
      color: 'var(--us-on-color)',
      border: '1px solid var(--us-primary-border)',
    },
    hover: { backgroundColor: 'var(--us-primary-hover)' },
  },
  gold: {
    rest: { backgroundColor: 'var(--us-gold)', color: 'var(--us-primary)', border: '1px solid var(--us-gold)' },
    hover: { backgroundColor: 'var(--us-gold-dark)', color: 'var(--us-on-color)', borderColor: 'var(--us-gold-dark)' },
  },
  outline: {
    rest: {
      backgroundColor: 'transparent',
      color: 'var(--us-accent-text)',
      border: '2px solid rgba(185, 168, 123, 0.6)',
    },
    hover: { borderColor: 'var(--us-gold)', backgroundColor: 'var(--us-hover-tint)' },
  },
  surface: {
    rest: { backgroundColor: 'var(--us-card)', color: 'var(--us-text-primary)', border: '1px solid var(--us-border)' },
    hover: { borderColor: 'var(--us-border-hover)', backgroundColor: 'var(--us-hover-tint)' },
  },
  ghost: {
    rest: { backgroundColor: 'transparent', color: 'var(--us-text-primary)', border: '1px solid transparent' },
    hover: { backgroundColor: 'var(--us-hover-tint)', color: 'var(--us-accent-text)' },
  },
  danger: {
    rest: {
      backgroundColor: 'var(--us-status-blocked)',
      color: 'var(--us-on-color)',
      border: '1px solid var(--us-status-blocked)',
    },
    hover: { filter: 'brightness(1.15)' },
  },
};

const SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '0 12px', fontSize: 'var(--us-text-sm)', minHeight: 36, gap: 6 },
  md: { padding: '0 16px', fontSize: 'var(--us-text-md)', minHeight: 44, gap: 8 },
  lg: { padding: '0 20px', fontSize: 'var(--us-text-lg)', minHeight: 48, gap: 8 },
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'surface',
  size = 'md',
  fullWidth = false,
  icon,
  style,
  disabled,
  ...props
}) => {
  const { rest, hover } = VARIANTS[variant];
  // `aria-disabled` looks the same as `disabled` but keeps the button in the
  // tab order, so a keyboard or screen reader user can still reach it and hear
  // why it does nothing. The caller ignores its clicks.
  const inert = disabled === true || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  const restStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
    cursor: inert ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease',
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'inherit',
    fontWeight: 500,
    lineHeight: '20px',
    borderRadius: 'var(--us-radius-control)',
    opacity: inert ? 0.5 : 1,
    ...rest,
    ...SIZES[size],
    ...style,
  };

  return (
    <button
      disabled={disabled}
      style={restStyle}
      onMouseEnter={(e) => {
        if (!inert) Object.assign(e.currentTarget.style, hover);
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, { ...rest, filter: 'none', ...style });
      }}
      {...props}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
};
