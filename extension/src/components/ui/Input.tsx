import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  requiredMark?: boolean;
  helperText?: string;
  /** What is wrong with the value. Shown under the field and tied to it, which marks the field invalid. */
  error?: string | null;
  ref?: React.Ref<HTMLInputElement>;
}

/** The asterisk after a required field's label. Screen readers hear the field's own required state instead. */
export function RequiredMark() {
  return (
    <span style={{ color: 'var(--us-accent-text)' }} aria-hidden="true">
      *
    </span>
  );
}

export const Input: React.FC<InputProps> = ({
  label,
  requiredMark = false,
  helperText,
  error = null,
  id,
  className,
  ...props
}) => {
  const uniqueId = React.useId();
  const generatedId = id ?? uniqueId;
  const helpId = `${generatedId}-help`;
  const errorId = `${generatedId}-error`;
  const describedBy = [error !== null ? errorId : null, helperText ? helpId : null].filter(Boolean).join(' ');
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
        aria-describedby={describedBy || undefined}
        aria-invalid={error !== null ? true : undefined}
        // The asterisk is hidden from screen readers, so they hear "required" from the field.
        aria-required={requiredMark ? true : undefined}
        className={['us-field', className].filter(Boolean).join(' ')}
        {...props}
      />
      {error !== null && (
        <p id={errorId} role="alert" className="us-help us-help-error">
          {error}
        </p>
      )}
      {helperText && (
        <p id={helpId} className="us-help">
          {helperText}
        </p>
      )}
    </div>
  );
};
