import type { PendingEvidence } from '../../../lib/evidence';
import { ExternalLink, SquarePen, X } from 'lucide-react';

export function EvidenceThumbs(props: {
  evidence: PendingEvidence[];
  onRemove?: (id: string) => void;
  onEdit?: (item: PendingEvidence, label: string) => void;
  /** The screenshot open in the editor window, marked so it can be found again. */
  editingId?: string | null;
}) {
  if (props.evidence.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {props.evidence.map((item, index) => (
        <div
          key={item.id}
          className="us-thumb"
          data-editing={item.id === props.editingId}
          style={{
            width: 96,
            height: 72,
            borderRadius: 'var(--us-radius-control)',
            border: '1px solid var(--us-border)',
            backgroundColor: 'var(--us-card-nested)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {props.onEdit !== undefined ? (
            <button
              type="button"
              className="us-thumb-edit"
              title="Crop or hide personal details"
              aria-label={`Edit evidence #${index + 1}`}
              onClick={() => props.onEdit?.(item, `evidence #${index + 1}`)}
            >
              {/* Keyed by the preview, so an edited screenshot fades in rather than jumping. */}
              <img key={item.previewUrl} src={item.previewUrl} alt={`Evidence #${index + 1}`} />
              {item.id === props.editingId ? (
                <span className="us-thumb-editing">Editing…</span>
              ) : (
                <span className="us-thumb-edit-badge">
                  <SquarePen size={10} /> Edit
                </span>
              )}
            </button>
          ) : (
            <img
              src={item.previewUrl}
              alt={`Evidence #${index + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {props.onRemove !== undefined && (
            <button
              type="button"
              title="Remove from report"
              aria-label={`Remove evidence #${index + 1}`}
              onClick={() => props.onRemove?.(item.id)}
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                color: '#FFFFFF',
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <X size={11} />
            </button>
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: 4,
              background: 'linear-gradient(transparent 55%, rgba(0, 0, 0, 0.6))',
              pointerEvents: 'none',
            }}
          >
            {item.uploadedUrl !== undefined && (
              <a
                // The #claim= fragment is the upload's one-time key, not part of its address.
                href={item.uploadedUrl.split('#')[0]}
                target="_blank"
                rel="noreferrer"
                title="View uploaded screenshot"
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
                  pointerEvents: 'auto',
                }}
              >
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
