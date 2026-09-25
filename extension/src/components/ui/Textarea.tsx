import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, helperText, id, rows = 3, className, ...props }) => {
  const generatedId = id ?? (label ? `textarea-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, width: '100%' }}>
      {label && (
        <label htmlFor={generatedId} className="us-label">
          {label}
        </label>
      )}
      <textarea id={generatedId} rows={rows} className={['us-field', className].filter(Boolean).join(' ')} {...props} />
      {helperText && <p className="us-help">{helperText}</p>}
    </div>
  );
};
