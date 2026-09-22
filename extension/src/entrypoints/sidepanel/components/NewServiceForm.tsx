import { useEffect, useState } from 'react';
import { composeNoteWithDigest } from '../../../lib/logs';
import { getSavedEmail } from '../../../lib/settings';
import { type SessionMetadata } from '../../../lib/session';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import type { EvidenceItem } from '../types';
import { EvidenceThumbs } from './EvidenceThumbs';
import { useVpnWarning } from '../hooks/useVpnWarning';
import { ArrowLeft, Camera, Check, WifiOff, Image as ImageIcon } from 'lucide-react';

export function NewServiceForm(props: {
  url: string;
  notice?: string;
  evidence: EvidenceItem[];
  metadata?: SessionMetadata;
  onBack: () => void;
  onError: (message: string | null) => void;
  onTakeScreenshot: () => Promise<void>;
  onRemoveEvidence: (id: string) => void;
  onEvidenceUploaded: (id: string, uploadedUrl: string) => void;
}) {
  const [name, setName] = useState(props.metadata?.name ?? '');
  const [description, setDescription] = useState(props.metadata?.description ?? '');
  const [email, setEmail] = useState('');

  useEffect(() => {
    void getSavedEmail().then(setEmail);
  }, []);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const vpnWarning = useVpnWarning();

  const submit = async () => {
    setSubmitting(true);
    const { submitService } = await import('../../../lib/submit');
    const { uploadPendingEvidence } = await import('../../../lib/evidence');
    const { resolveTurnstileToken } = await import('../../../lib/turnstile');
    const token = await resolveTurnstileToken();

    const uploadedUrls: string[] = [];
    for (const item of props.evidence) {
      const result = await uploadPendingEvidence(item, 'submission', token);
      if (!result.ok) {
        setSubmitting(false);
        props.onError(`Evidence upload failed for ${item.filename}: ${result.error.message}`);
        return;
      }
      uploadedUrls.push(result.data.uploadedUrl as string);
      props.onEvidenceUploaded(item.id, result.data.uploadedUrl as string);
    }

    const noteWithDigest = await composeNoteWithDigest(note.length > 0 ? note : undefined);
    const result = await submitService({
      name,
      url: props.url,
      description: description.length > 0 ? description : undefined,
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      submitterNote: noteWithDigest,
      evidenceUrls: uploadedUrls,
    });
    setSubmitting(false);
    if (!result.ok) {
      props.onError(`Submission failed: ${result.error.message}`);
      return;
    }
    props.onError(null);
    setSuccess(result.data.message);
  };

  return (
    <div
      style={{
        backgroundColor: '#141416',
        border: '1px solid var(--us-border)',
        borderRadius: 'var(--us-radius-card)',
        padding: '24px 20px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 20,
        boxShadow: 'var(--shadow-syrian-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={props.onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--us-text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--us-text-muted)')}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span style={{ fontSize: 11, color: 'var(--us-gold)', fontWeight: 600, textTransform: 'uppercase' }}>
          New Service Submission
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          Report a Service
        </h1>
        <p style={{ fontSize: 13, color: 'var(--us-text-muted)', margin: 0, lineHeight: 1.6 }}>
          Report a service that&apos;s blocking Syria. Help us build a complete picture of what Syrians can and can&apos;t access.
        </p>
      </div>

      {vpnWarning !== null && (
        <div
          role="alert"
          style={{
            border: '1px solid rgba(185, 168, 123, 0.4)',
            backgroundColor: 'rgba(185, 168, 123, 0.10)',
            borderRadius: 'var(--us-radius-control)',
            padding: '12px 14px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <WifiOff size={18} color="var(--us-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>VPN detected</span>
            <span style={{ fontSize: 12, color: 'var(--us-gold-light)', lineHeight: 1.5 }}>{vpnWarning}</span>
          </div>
        </div>
      )}

      {props.notice !== undefined && (
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
          {props.notice}
        </div>
      )}

      <Input
        label="Service Name"
        requiredMark
        placeholder="e.g., Coursera, PayPal"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <Input label="Website URL" requiredMark value={props.url} disabled helperText="The official website of the service" />

      <Textarea
        label="Description"
        placeholder="Brief description of the service..."
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        helperText="What does this service do? Why do Syrians need it?"
        rows={3}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--us-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Evidence Screenshots
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                borderRadius: 6,
                border: '1px solid rgba(185, 168, 123, 0.3)',
                backgroundColor: 'rgba(185, 168, 123, 0.1)',
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--us-gold)',
              }}
            >
              <Camera size={11} /> Needed for approval
            </span>
          </label>
        </div>

        <div
          onClick={() => void props.onTakeScreenshot()}
          style={{
            border: '2px dashed var(--us-border)',
            borderRadius: 'var(--us-radius-control)',
            padding: '16px 14px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--us-gold)';
            e.currentTarget.style.backgroundColor = 'rgba(185, 168, 123, 0.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--us-border)';
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.25)';
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <ImageIcon size={18} color="var(--us-text-muted)" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 2 }}>
            Click to Capture Screen Evidence
          </div>
          <div style={{ fontSize: 11, color: 'var(--us-text-dim)' }}>
            Takes instant screenshot of active tab. ({props.evidence.length}/10 captured)
          </div>
        </div>

        {props.evidence.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <EvidenceThumbs evidence={props.evidence} onRemove={props.onRemoveEvidence} />
          </div>
        )}

        <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.4 }}>
          Screenshots are how we verify a report. Reviewers reject reports they cannot verify, so add a screenshot of the block or error message.
        </p>
      </div>

      <Input
        label="Your Email"
        placeholder="Optional, in case we need to contact you"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Textarea
        label="Additional Notes"
        placeholder="Any additional context..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        helperText="Any other context or test observations (optional)"
        rows={3}
      />

      {success !== null ? (
        <div className="us-toast-green">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="us-toast-badge">
              <Check size={16} strokeWidth={3} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--us-working-text)', marginBottom: 2 }}>
                Submission Received
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--us-working-text-soft)', lineHeight: 1.4 }}>
                {success}
              </div>
            </div>
          </div>
          <button type="button" className="us-toast-btn-action" onClick={() => setSuccess(null)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div>
          <Button variant="primary" size="lg" disabled={submitting || name.trim().length === 0} onClick={() => void submit()} fullWidth>
            {submitting ? 'Submitting report…' : 'Submit Report'}
          </Button>
          <p style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: 'var(--us-text-muted)' }}>
            We review all submissions before publishing. Usually within 24 hours.
          </p>
        </div>
      )}
    </div>
  );
}
