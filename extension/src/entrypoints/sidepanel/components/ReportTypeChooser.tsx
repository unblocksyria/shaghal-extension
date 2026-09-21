import type { ServiceRecord } from '../../../lib/endpoints';
import { CheckCircle2, ClipboardList } from 'lucide-react';

export function ReportTypeChooser(props: {
  service: ServiceRecord;
  onChooseFunctionality: () => void;
  onChooseCorrection: () => void;
}) {
  return (
    <div
      style={{
        backgroundColor: '#141416',
        border: '1px solid var(--us-border)',
        borderRadius: 'var(--us-radius-card)',
        padding: '24px 20px',
        display: 'grid',
        gap: 14,
        boxShadow: 'var(--shadow-syrian-card)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          Report on: {props.service.name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--us-text-muted)', margin: 0, lineHeight: 1.6 }}>
          What would you like to report?
        </p>
      </div>

      <button
        onClick={props.onChooseFunctionality}
        style={{
          textAlign: 'left',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--us-border)',
          borderRadius: 'var(--us-radius-control)',
          padding: '14px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--us-gold)';
          e.currentTarget.style.backgroundColor = 'rgba(185, 168, 123, 0.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--us-border)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
        }}
      >
        <CheckCircle2 size={20} color="var(--us-working)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>What works from Syria</span>
          <span style={{ fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.5 }}>
            Which parts work and which fail: core use, sign-up, payment, and the rest.
          </span>
        </div>
      </button>

      <button
        onClick={props.onChooseCorrection}
        style={{
          textAlign: 'left',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--us-border)',
          borderRadius: 'var(--us-radius-control)',
          padding: '14px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--us-gold)';
          e.currentTarget.style.backgroundColor = 'rgba(185, 168, 123, 0.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--us-border)';
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
        }}
      >
        <ClipboardList size={20} color="var(--us-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Service details</span>
          <span style={{ fontSize: 12, color: 'var(--us-text-muted)' }}>
            The website URL, description, categories or support contacts.
          </span>
        </div>
      </button>
    </div>
  );
}
