import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'nested' | 'subtle';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  style,
  ...props
}) => {
  const getBg = () => {
    switch (variant) {
      case 'nested':
        return 'var(--us-card-nested)';
      case 'subtle':
        return 'rgba(255, 255, 255, 0.02)';
      case 'default':
      default:
        return 'var(--us-card)';
    }
  };

  const getPadding = () => {
    switch (padding) {
      case 'none':
        return 0;
      case 'sm':
        return '10px 12px';
      case 'lg':
        return '18px 20px';
      case 'md':
      default:
        return '14px 16px';
    }
  };

  return (
    <div
      style={{
        backgroundColor: getBg(),
        border: '1px solid var(--us-border)',
        borderRadius: 'var(--us-radius-card)',
        padding: getPadding(),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
