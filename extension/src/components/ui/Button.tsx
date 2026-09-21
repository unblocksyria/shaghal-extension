import React from 'react';

export type ButtonVariant = 'primary' | 'gold' | 'surface' | 'ghost' | 'danger' | 'emerald';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

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
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        // Signature Unblock Syria dark green CTA button
        return {
          backgroundColor: disabled ? 'rgba(9, 39, 36, 0.4)' : 'var(--us-syrian-dark-green)',
          color: disabled ? 'rgba(255, 255, 255, 0.5)' : '#FFFFFF',
          border: '1px solid rgba(26, 74, 69, 0.6)',
          fontWeight: 500,
          boxShadow: disabled ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.3)',
        };
      case 'gold':
        return {
          backgroundColor: disabled ? 'rgba(185, 168, 123, 0.4)' : 'var(--us-gold)',
          color: disabled ? 'rgba(9, 39, 36, 0.6)' : 'var(--us-syrian-dark-green)',
          border: 'none',
          fontWeight: 600,
          boxShadow: disabled ? 'none' : '0 2px 8px rgba(185, 168, 123, 0.25)',
        };
      case 'emerald':
        return {
          backgroundColor: 'var(--us-working-bg)',
          color: 'var(--us-working)',
          border: '1px solid var(--us-working-border)',
          fontWeight: 600,
        };
      case 'danger':
        return {
          backgroundColor: 'var(--us-failing-bg)',
          color: 'var(--us-failing)',
          border: '1px solid var(--us-failing-border)',
          fontWeight: 500,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--us-text-muted)',
          border: 'none',
          fontWeight: 500,
        };
      case 'surface':
      default:
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          color: 'var(--us-text-primary)',
          border: '1px solid var(--us-border)',
          fontWeight: 500,
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '6px 12px', fontSize: 12, borderRadius: 6, minHeight: 32 };
      case 'lg':
        return { padding: '10px 20px', fontSize: 14, borderRadius: 'var(--us-radius-control)', minHeight: 44 };
      case 'md':
      default:
        return { padding: '8px 16px', fontSize: 13, borderRadius: 'var(--us-radius-control)', minHeight: 38 };
    }
  };

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.18s cubic-bezier(0.215, 0.61, 0.355, 1)',
        width: fullWidth ? '100%' : 'auto',
        outline: 'none',
        fontFamily: 'inherit',
        opacity: disabled ? 0.55 : 1,
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === 'primary') {
          e.currentTarget.style.backgroundColor = 'var(--us-syrian-green-light)';
          e.currentTarget.style.borderColor = 'rgba(126, 189, 183, 0.4)';
        } else if (variant === 'gold') {
          e.currentTarget.style.backgroundColor = '#c9ba90';
        } else if (variant === 'surface') {
          e.currentTarget.style.borderColor = 'var(--us-border-hover)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        } else if (variant === 'ghost') {
          e.currentTarget.style.color = 'var(--us-text-primary)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        if (variant === 'primary') {
          e.currentTarget.style.backgroundColor = 'var(--us-syrian-dark-green)';
          e.currentTarget.style.borderColor = 'rgba(26, 74, 69, 0.6)';
        } else if (variant === 'gold') {
          e.currentTarget.style.backgroundColor = 'var(--us-gold)';
        } else if (variant === 'surface') {
          e.currentTarget.style.borderColor = 'var(--us-border)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
        } else if (variant === 'ghost') {
          e.currentTarget.style.color = 'var(--us-text-muted)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(0.98)';
      }}
      onMouseUp={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(1)';
      }}
      {...props}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
};
