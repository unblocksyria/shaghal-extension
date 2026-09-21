import { formatDigest, buildDigest, toSessionJson } from '../../../lib/logs';
import type { TesterSession } from '../../../lib/session';
import { Button } from '../../../components/ui/Button';
import { Download, Play, Radio, Square } from 'lucide-react';

export function SessionCard(props: {
  tabId: number | null;
  session: TesterSession | null;
  endedSession: TesterSession | null;
  onStartTest: () => void;
  onEndTest: () => void;
  onExport: () => void;
}) {
  const displayed = props.session ?? props.endedSession;

  return (
    <div
      style={{
        backgroundColor: '#141416',
        border: '1px solid var(--us-border)',
        borderRadius: 'var(--us-radius-card)',
        padding: '18px 20px',
        display: 'grid',
        gap: 12,
        boxShadow: 'var(--shadow-syrian-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={16} color={props.session !== null ? 'var(--us-working)' : 'var(--us-text-muted)'} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>Network Diagnostics</h2>
        </div>
        {props.session !== null ? (
          <Button variant="danger" size="sm" onClick={props.onEndTest} icon={<Square size={12} />}>
            End Test
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={props.onStartTest}
            disabled={props.tabId === null}
            icon={<Play size={12} />}
          >
            Start Test
          </Button>
        )}
      </div>

      {props.session !== null ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'var(--us-working-bg)',
              border: '1px solid var(--us-working-border)',
              borderRadius: 'var(--us-radius-control)',
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--us-working)',
            }}
          >
            <span
              className="us-pulse-recording"
              style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--us-working)', display: 'inline-block' }}
            />
            <span>
              Recording Tab #{props.session.tabId} &mdash; <strong>{props.session.logs.length}</strong> network requests captured
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--us-text-dim)', lineHeight: 1.5 }}>
            Only requests made after starting are captured. Refresh the page to log initial load requests.
          </p>
        </div>
      ) : props.endedSession !== null ? (
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--us-border)',
            borderRadius: 'var(--us-radius-control)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--us-gold)', marginBottom: 4, textTransform: 'uppercase' }}>
            Last Session Log Summary
          </div>
          <pre
            style={{
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              margin: 0,
              color: 'var(--us-text-muted)',
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}
          >
            {formatDigest(buildDigest(props.endedSession.logs))}
          </pre>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--us-text-dim)' }}>
          No active test session. Start a test to capture network logs while you browse the service.
        </p>
      )}

      {displayed !== null && (
        <Button variant="surface" size="sm" onClick={props.onExport} icon={<Download size={13} />} fullWidth>
          Export Redacted Logs (.JSON)
        </Button>
      )}
    </div>
  );
}

export function downloadSessionJson(source: TesterSession): void {
  const blob = new Blob([toSessionJson(source)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `unblocksyria-test-${new Date(source.startedAt).toISOString()}.json`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}
