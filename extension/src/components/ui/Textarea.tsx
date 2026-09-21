import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  requiredMark?: boolean;
  helperText?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  requiredMark = false,
  helperText,
  error,
  style,
  id,
  rows = 3,
  ...props
}) => {
  const generatedId = id ?? (label ? `textarea-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, width: '100%' }}>
      {label && (
        <label
          htmlFor={generatedId}
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--us-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {label}
          {requiredMark && (
            <span style={{ color: 'var(--us-gold)', fontWeight: 700 }} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <textarea
        id={generatedId}
        rows={rows}
        style={{
          width: '100%',
          minHeight: 88,
          backgroundColor: '#0F0F10',
          border: error ? '1px solid var(--us-failing)' : '1px solid var(--us-border)',
          borderRadius: 'var(--us-radius-control)',
          padding: '10px 12px',
          color: 'var(--us-text-primary)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
          resize: 'vertical',
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          transition: 'border-color 0.2s cubic-bezier(0.215, 0.61, 0.355, 1), box-shadow 0.2s ease',
          ...style,
        }}
        onMouseEnter={(e) => {
          if (document.activeElement !== e.currentTarget && !error) {
            e.currentTarget.style.borderColor = 'rgba(185, 168, 123, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.currentTarget && !error) {
            e.currentTarget.style.borderColor = 'var(--us-border)';
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--us-gold)';
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(185, 168, 123, 0.35)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--us-failing)' : 'var(--us-border)';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
        }}
        {...props}
      />
      {helperText && !error && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.4 }}>
          {helperText}
        </p>
      )}
      {error && <span style={{ fontSize: 12, color: 'var(--us-failing)' }}>{error}</span>}
    </div>
  );
};
