import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  requiredMark?: boolean;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({ label, requiredMark = false, helperText, id, className, ...props }) => {
  const generatedId = id ?? (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, width: '100%' }}>
      {label && (
        <label htmlFor={generatedId} className="us-label">
          {label}
          {requiredMark && (
            <span style={{ color: 'var(--us-accent-text)' }} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <input id={generatedId} className={['us-field', className].filter(Boolean).join(' ')} {...props} />
      {helperText && <p className="us-help">{helperText}</p>}
    </div>
  );
};
