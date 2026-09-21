import type { DuplicateCheck } from '../../../lib/endpoints';
import { Button } from '../../../components/ui/Button';
import { RefreshCw } from 'lucide-react';

export function CheckView(props: {
  activeUrl: string | null;
  checking: boolean;
  duplicate: DuplicateCheck | null;
  onCheck: () => void;
}) {
  return (
    <div
      style={{
        backgroundColor: '#141416',
        border: '1px solid var(--us-border)',
        borderRadius: 'var(--us-radius-card)',
        padding: '24px 20px',
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--shadow-syrian-card)',
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          Catalog Check
        </h1>
        <p style={{ fontSize: 13, color: 'var(--us-text-muted)', margin: 0, lineHeight: 1.6 }}>
          {props.activeUrl === null
            ? 'Open the service website in your active browser tab to begin testing.'
            : props.checking
              ? 'Checking whether this service is already tracked on unblocksyria.com…'
              : 'Check if this service already exists in the catalog or needs a new submission.'}
        </p>
      </div>

      {props.duplicate?.message !== undefined && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--us-text-muted)',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            padding: '10px 14px',
            borderRadius: 'var(--us-radius-control)',
            border: '1px solid var(--us-border)',
          }}
        >
          {props.duplicate.message}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={props.onCheck}
        disabled={props.checking || props.activeUrl === null}
        icon={<RefreshCw size={14} style={{ animation: props.checking ? 'spin 1s linear infinite' : 'none' }} />}
        fullWidth
      >
        {props.checking ? 'Checking catalog…' : 'Check Active Service'}
      </Button>
    </div>
  );
}
