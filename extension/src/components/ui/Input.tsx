import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  requiredMark?: boolean;
  helperText?: string;
}

/** The asterisk after a required field's label. Screen readers hear the field's own required state instead. */
export function RequiredMark() {
  return (
    <span style={{ color: 'var(--us-accent-text)' }} aria-hidden="true">
      *
    </span>
  );
}

export const Input: React.FC<InputProps> = ({ label, requiredMark = false, helperText, id, className, ...props }) => {
  const uniqueId = React.useId();
  const generatedId = id ?? uniqueId;
  const helpId = `${generatedId}-help`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, width: '100%' }}>
      {label && (
        <label htmlFor={generatedId} className="us-label">
          {label}
          {requiredMark && <RequiredMark />}
        </label>
      )}
      <input
        id={generatedId}
        aria-describedby={helperText ? helpId : undefined}
        className={['us-field', className].filter(Boolean).join(' ')}
        {...props}
      />
      {helperText && (
        <p id={helpId} className="us-help">
          {helperText}
        </p>
      )}
    </div>
  );
};
