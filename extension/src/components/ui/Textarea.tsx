import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, helperText, id, rows = 3, className, ...props }) => {
  const uniqueId = React.useId();
  const generatedId = id ?? uniqueId;
  const helpId = `${generatedId}-help`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, width: '100%' }}>
      {label && (
        <label htmlFor={generatedId} className="us-label">
          {label}
        </label>
      )}
      <textarea
        id={generatedId}
        rows={rows}
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
