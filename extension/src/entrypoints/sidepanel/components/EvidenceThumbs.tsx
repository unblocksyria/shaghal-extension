import type { EvidenceItem } from '../types';
import { ExternalLink } from 'lucide-react';

export function EvidenceThumbs(props: { evidence: EvidenceItem[]; onRemove?: (url: string) => void }) {
  if (props.evidence.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {props.evidence.map((item, index) => (
        <div
          key={item.url}
          style={{
            width: 96,
            height: 72,
            borderRadius: 'var(--us-radius-control)',
            border: '1px solid var(--us-border)',
            backgroundColor: '#0F0F10',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <img
            src={item.url}
            alt={`Evidence #${index + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: 4,
              background: 'linear-gradient(transparent 55%, rgba(0, 0, 0, 0.6))',
            }}
          >
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              title="View full screenshot"
              style={{
                color: 'var(--us-gold)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                textDecoration: 'none',
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                borderRadius: 4,
                padding: '2px 5px',
              }}
            >
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
