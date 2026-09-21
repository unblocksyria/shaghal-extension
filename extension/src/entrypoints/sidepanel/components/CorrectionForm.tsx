import { useState } from 'react';
import { composeNoteWithDigest } from '../../../lib/logs';
import { submitCorrection, type CorrectionType } from '../../../lib/submit';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { getCategories, type CategoryItem, type ServiceRecord } from '../../../lib/endpoints';
import { CategoryPicker } from './CategoryPicker';
import type { EvidenceItem } from '../types';
import { ArrowLeft, Camera, Check, ExternalLink, FileText, WifiOff, Image as ImageIcon } from 'lucide-react';

const CORRECTION_FIELDS: { type: CorrectionType; label: string }[] = [
  { type: 'url', label: 'Website URL' },
  { type: 'description', label: 'Description' },
  { type: 'category', label: 'Categories (comma-separated names)' },
  { type: 'support_email', label: 'Support Email' },
  { type: 'support_url', label: 'Support URL' },
  { type: 'other', label: 'Other Information' },
];

function currentValue(service: ServiceRecord, type: CorrectionType): string {
  switch (type) {
    case 'url':
      return service.url ?? '';
    case 'description':
      return service.description ?? '';
    case 'category':
      return (service.categories ?? []).map((category) => category.name).join(', ');
    case 'support_email':
      return service.supportEmail ?? '';
    case 'support_url':
      return service.supportUrl ?? '';
    case 'other':
      return '';
  }
}

export function CorrectionForm(props: {
  service: ServiceRecord;
  evidence: EvidenceItem[];
  onBack: () => void;
  onError: (message: string | null) => void;
  onTakeScreenshot: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<CorrectionType>>(new Set());
  const [proposals, setProposals] = useState<Partial<Record<CorrectionType, string>>>({});
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryItem[]>([]);

  const loadCategoryOptions = async () => {
    if (categoryOptions.length > 0) return;
    const result = await getCategories();
    if (result.ok) {
      setCategoryOptions(result.data);
    } else {
      props.onError(`Could not load categories: ${result.error.message}`);
    }
  };

  const selectedCategoryNames = (proposals['category'] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const setSelectedCategoryNames = (names: Set<string>) => {
    setProposals((prev) => ({ ...prev, category: [...names].join(', ') }));
  };

  const toggleField = (type: CorrectionType) => {
    setProposals((current) => (current[type] === undefined ? { ...current, [type]: currentValue(props.service, type) } : current));
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    if (type === 'category') void loadCategoryOptions();
  };

  const changes = CORRECTION_FIELDS.filter((field) => selected.has(field.type)).map((field) => ({
    correctionType: field.type,
    proposedValue: (proposals[field.type] ?? '').trim(),
  }));
  const validChanges = changes.filter((change) => change.proposedValue.length > 0);

  const submit = async () => {
    setSubmitting(true);
    const { submitCorrection } = await import('../../../lib/submit');
    const noteWithDigest = await composeNoteWithDigest(note.length > 0 ? note : undefined);
    const result = await submitCorrection({
      serviceId: props.service.id,
      changes: validChanges.slice(0, 6),
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      submitterNote: noteWithDigest,
      evidenceUrls: props.evidence.map((item) => item.url),
    });
    setSubmitting(false);
    if (!result.ok) {
      props.onError(`Correction failed: ${result.error.message}`);
      return;
    }
    props.onError(null);
    setSuccess(
      `${result.data.count ?? validChanges.length} correction(s) accepted for ${result.data.serviceName}. ${result.data.message}`,
    );
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
        gap: 18,
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
          Suggest a Correction
        </span>
      </div>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          Correct: {props.service.name}
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--us-text-muted)', lineHeight: 1.6 }}>
          Help us keep the service details accurate. Your correction is reviewed before applying.
        </p>
      </div>

      <div
        role="alert"
        style={{
          border: '1px solid rgba(185, 168, 123, 0.4)',
          backgroundColor: 'rgba(185, 168, 123, 0.10)',
          borderRadius: 'var(--us-radius-control)',
          padding: '10px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <WifiOff size={16} color="var(--us-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: 'var(--us-gold-light)', lineHeight: 1.5 }}>
          Verify the details from the official source before proposing a change.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--us-text-primary)' }}>
          What needs to be corrected? <span style={{ color: 'var(--us-gold)', fontWeight: 700 }}>*</span>
        </label>
        {CORRECTION_FIELDS.map((field) => {
          const isSelected = selected.has(field.type);
          const current = currentValue(props.service, field.type);
          return (
            <div key={field.type} style={{ display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--us-text-primary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleField(field.type)} />
                <span>{field.label}</span>
              </label>
              {isSelected && field.type !== 'other' && field.type !== 'category' && (
                <div style={{ paddingLeft: 26 }}>
                  {current.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--us-text-dim)', marginBottom: 4 }}>
                      Current: {current.length > 80 ? `${current.slice(0, 80)}…` : current}
                    </div>
                  )}
                  {field.type === 'description' ? (
                    <Textarea
                      value={proposals[field.type] ?? ''}
                      onChange={(event) => setProposals((prev) => ({ ...prev, [field.type]: event.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <Input
                      value={proposals[field.type] ?? ''}
                      onChange={(event) => setProposals((prev) => ({ ...prev, [field.type]: event.target.value }))}
                    />
                  )}
                </div>
              )}
              {isSelected && field.type === 'category' && (
                <div style={{ paddingLeft: 26, display: 'grid', gap: 4, minWidth: 0 }}>
                  {current.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--us-text-dim)' }}>
                      Current: {current.length > 80 ? `${current.slice(0, 80)}…` : current}
                    </div>
                  )}
                  <CategoryPicker
                    options={categoryOptions}
                    selected={new Set(selectedCategoryNames)}
                    onChange={setSelectedCategoryNames}
                  />
                  <span style={{ fontSize: 11, color: 'var(--us-text-dim)' }}>
                    Select all categories this service belongs to
                  </span>
                </div>
              )}
              {isSelected && field.type === 'other' && (
                <div style={{ paddingLeft: 26 }}>
                  <Textarea
                    placeholder="What should we know?"
                    value={proposals[field.type] ?? ''}
                    onChange={(event) => setProposals((prev) => ({ ...prev, [field.type]: event.target.value }))}
                    rows={3}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Input
        label="Your Email"
        placeholder="Optional, in case we need to contact you"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <div style={{ display: 'grid', gap: 6 }}>
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
          <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            {props.evidence.map((item, idx) => (
              <div
                key={item.url}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--us-border)',
                  borderRadius: 'var(--us-radius-control)',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--us-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={13} color="var(--us-gold)" />
                  {item.filename || `Evidence #${idx + 1}`}
                </span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--us-gold)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                >
                  <ExternalLink size={12} /> View
                </a>
              </div>
            ))}
          </div>
        )}

        <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.4 }}>
          Please remove or blur any personal information before uploading. Reviewers reject corrections they cannot verify.
        </p>
      </div>

      <Textarea
        label="Additional Notes"
        placeholder="Any other context or information (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
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
                Correction Received
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
          <Button
            variant="primary"
            size="lg"
            disabled={submitting || validChanges.length === 0}
            onClick={() => void submit()}
            fullWidth
          >
            {submitting
              ? 'Submitting correction…'
              : `Submit Correction (${validChanges.length} change${validChanges.length === 1 ? '' : 's'})`}
          </Button>
          <p style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: 'var(--us-text-muted)' }}>
            We review all corrections before applying them. Usually within 24 hours.
          </p>
        </div>
      )}
    </div>
  );
}
