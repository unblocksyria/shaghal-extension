import { useEffect, useRef, useState } from 'react';
import { captureScreenshot, uploadPendingEvidence, type PendingEvidence } from '../../../lib/evidence';
import { composeNoteWithDigest } from '../../../lib/logs';
import { resolveTurnstileToken } from '../../../lib/turnstile';
import { getSavedEmail } from '../../../lib/settings';
import { getFunctionalities, type FunctionalityItem, type ServiceRecord } from '../../../lib/endpoints';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import type { EvidenceItem } from '../types';
import { EvidenceThumbs } from './EvidenceThumbs';
import { ArrowLeft, Camera, Check, Plus, Undo2, WifiOff } from 'lucide-react';

interface PartEntry {
  slug: string;
  name: string;
  isCore: boolean;
  trackedLevel: 'working' | 'failing' | 'unknown' | 'not_tracked';
  level?: 'working' | 'failing' | 'unknown';
  description: string;
  evidence: PendingEvidence[];
}

export const SUGGESTABLE_PARTS = new Set(['core_use', 'landing_page']);

export interface PartSuggestion {
  level: 'working' | 'failing';
  evidence: string;
}

export function FunctionalityReportForm(props: {
  service: ServiceRecord;
  evidence: EvidenceItem[];
  suggestions?: Partial<Record<string, PartSuggestion>>;
  onBack: () => void;
  onError: (message: string | null) => void;
  onTakeScreenshot: () => Promise<void>;
}) {
  const [parts, setParts] = useState<PartEntry[]>(() =>
    (props.service.functionalities ?? []).map((functionality) => ({
      slug: functionality.slug,
      name: functionality.name,
      isCore: functionality.isCore,
      trackedLevel: functionality.level,
      level:
        functionality.level === 'working'
          ? 'working'
          : functionality.level === 'failing'
            ? 'failing'
            : undefined,
      description: '',
      evidence: [],
    })),
  );
  const [editedSlugs, setEditedSlugs] = useState<Set<string>>(new Set());
  const preEditStateRef = useRef<Map<string, Omit<PartEntry, 'slug' | 'name' | 'isCore' | 'trackedLevel'>>>(new Map());
  const [catalogue, setCatalogue] = useState<FunctionalityItem[] | null>(null);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    void getSavedEmail().then(setEmail);
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const updatePart = (slug: string, update: (part: PartEntry) => PartEntry) => {
    setParts((current) => current.map((part) => (part.slug === slug ? update(part) : part)));
  };

  const ensurePreEditSnapshot = (slug: string) => {
    setParts((current) => {
      const part = current.find((item) => item.slug === slug);
      if (part !== undefined && !preEditStateRef.current.has(slug)) {
        preEditStateRef.current.set(slug, {
          level: part.level,
          description: part.description,
          evidence: [...part.evidence],
        });
      }
      return current;
    });
  };

  const openEditor = (slug: string) => {
    ensurePreEditSnapshot(slug);
  };

  const chooseLevel = (slug: string, level: 'working' | 'failing') => {
    openEditor(slug);
    setEditedSlugs((prev) => new Set(prev).add(slug));
    updatePart(slug, (current) => ({ ...current, level }));
  };

  const clearLevel = (slug: string) => {
    setEditedSlugs((prev) => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
    updatePart(slug, (current) => ({ ...current, level: undefined }));
  };

  const cancelEdit = (slug: string) => {
    const snapshot = preEditStateRef.current.get(slug);
    if (snapshot !== undefined) {
      updatePart(slug, (current) => ({ ...current, ...snapshot, evidence: [...snapshot.evidence] }));
      preEditStateRef.current.delete(slug);
    }
    setEditedSlugs((prev) => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
  };

  const addCataloguePart = (functionality: FunctionalityItem) => {
    setParts((current) => [
      ...current,
      {
        slug: functionality.slug,
        name: functionality.name,
        isCore: functionality.isCore,
        trackedLevel: 'not_tracked',
        level: undefined,
        description: '',
        evidence: [],
      },
    ]);
    setCatalogue((current) => current?.filter((item) => item.slug !== functionality.slug) ?? current);
  };

  const loadCatalogue = async () => {
    const result = await getFunctionalities();
    if (result.ok) {
      setCatalogue(result.data.filter((item) => !parts.some((part) => part.slug === item.slug)));
    } else {
      props.onError(`Could not load part catalogue: ${result.error.message}`);
    }
  };

  const addPartEvidence = async (slug: string) => {
    const currentWindow = await chrome.windows.getCurrent();
    try {
      const captured = await captureScreenshot(currentWindow.id ?? 0);
      updatePart(slug, (part) => ({ ...part, evidence: [...part.evidence, captured] }));
    } catch (captureError) {
      props.onError(`Screenshot failed: ${String(captureError)}`);
    }
  };

  const testedParts = parts.filter((part) => editedSlugs.has(part.slug));

  const uploadAllEvidence = async (token: string): Promise<string[] | null> => {
    const uploadedUrls: string[] = [];
    for (const item of props.evidence) {
      const result = await uploadPendingEvidence(item, 'functionality_report', token);
      if (!result.ok) {
        props.onError(`Evidence upload failed for ${item.filename}: ${result.error.message}`);
        return [];
      }
      uploadedUrls.push(result.data.uploadedUrl as string);
    }
    for (const part of testedParts) {
      for (const item of part.evidence) {
        const result = await uploadPendingEvidence(item, 'functionality_report', token);
        if (!result.ok) {
          props.onError(`Evidence upload failed for ${item.filename}: ${result.error.message}`);
          return [];
        }
        uploadedUrls.push(result.data.uploadedUrl as string);
      }
    }
    return uploadedUrls;
  };

  const submit = async () => {
    setSubmitting(true);
    const { submitFunctionalityReport } = await import('../../../lib/submit');
    const { resolveTurnstileToken } = await import('../../../lib/turnstile');
    const token = await resolveTurnstileToken();

    const uploadedUrls = await uploadAllEvidence(token);
    if (
      uploadedUrls === null ||
      (uploadedUrls.length === 0 && (props.evidence.length > 0 || testedParts.some((part) => part.evidence.length > 0)))
    ) {
      setSubmitting(false);
      return;
    }

    const noteWithDigest = await composeNoteWithDigest(note.length > 0 ? note : undefined);
    const result = await submitFunctionalityReport({
      serviceId: props.service.id,
      items: testedParts.map((part) => ({
        slug: part.slug,
        level: part.level as 'working' | 'failing' | 'unknown',
        description: part.description.length > 0 ? part.description : undefined,
        evidenceUrls: part.evidence.length > 0 ? part.evidence.map((item) => item.uploadedUrl as string) : undefined,
      })),
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      submitterNote: noteWithDigest,
      evidenceUrls: props.evidence.map((item) => item.uploadedUrl as string),
    });
    setSubmitting(false);
    if (!result.ok) {
      props.onError(`Report failed: ${result.error.message}`);
      return;
    }
    props.onError(null);
    setSuccess(`Accepted ${result.data.accepted ?? testedParts.length} items. ${result.data.message}`);
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
          Catalog Entry
        </span>
      </div>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          Test: {props.service.name}
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--us-text-muted)', lineHeight: 1.6 }}>
          Report what works and what fails from Syria. Every report is reviewed before updating the catalog.
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
          Ensure your VPN is disabled so testing accurately reflects access from Syria.
        </div>
      </div>

      {parts.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            backgroundColor: '#0F0F10',
            borderRadius: 'var(--us-radius-control)',
            border: '1px solid var(--us-border)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--us-text-dim)' }}>
            No specific parts registered on this service record yet.
          </span>
          <Button variant="surface" size="sm" onClick={() => void loadCatalogue()} icon={<Plus size={13} />}>
            Load Standard Parts Catalogue
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {parts.map((part) => {
            const isWorks = part.level === 'working';
            const isFails = part.level === 'failing';
            const isNotChecked = part.level === undefined;
            const isEdited = editedSlugs.has(part.slug);
            const partSuggestion =
              props.suggestions?.[part.slug] !== undefined &&
              SUGGESTABLE_PARTS.has(part.slug) &&
              part.level !== props.suggestions[part.slug]?.level
                ? props.suggestions[part.slug]
                : undefined;
            const showTextBox =
              (isEdited && part.level !== undefined) || part.description.length > 0 || part.evidence.length > 0;

            return (
              <div key={part.slug} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <div className="us-func-row">
                  <div className="us-func-label">
                    <span>{part.name}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="us-seg-container" role="group" aria-label={`Status for ${part.name}`}>
                      <button
                        type="button"
                        className={`us-seg-btn ${isWorks ? 'active-works' : ''}`}
                        onClick={() => chooseLevel(part.slug, 'working')}
                      >
                        Works
                      </button>
                      <button
                        type="button"
                        className={`us-seg-btn ${isFails ? 'active-fails' : ''}`}
                        onClick={() => chooseLevel(part.slug, 'failing')}
                      >
                        Fails
                      </button>
                      <button
                        type="button"
                        className={`us-seg-btn ${isNotChecked ? 'active-notchecked' : ''}`}
                        onClick={() => clearLevel(part.slug)}
                      >
                        Not checked
                      </button>
                    </div>
                  </div>
                </div>

                {partSuggestion !== undefined && (
                  <div style={{ padding: '0 2px 10px 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--us-text-dim)', minWidth: 0 }}>
                      Suggested: <strong style={{ color: 'var(--us-gold)' }}>{partSuggestion.level}</strong> — {partSuggestion.evidence}
                    </span>
                    <button
                      type="button"
                      onClick={() => chooseLevel(part.slug, partSuggestion.level)}
                      style={{
                        background: 'rgba(185, 168, 123, 0.12)',
                        border: '1px solid rgba(185, 168, 123, 0.3)',
                        borderRadius: 'var(--us-radius-pill)',
                        padding: '2px 10px',
                        color: 'var(--us-gold)',
                        fontSize: 11,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Apply
                    </button>
                  </div>
                )}

                {showTextBox && (
                  <div
                    style={{
                      padding: '8px 2px 14px 2px',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr)',
                      gap: 8,
                      animation: 'usFadeIn 0.15s ease-out forwards',
                    }}
                  >
                    <Textarea
                      placeholder="What did you observe? (optional)"
                      value={part.description}
                      onChange={(event) =>
                        updatePart(part.slug, (current) => ({ ...current, description: event.target.value }))
                      }
                      rows={2}
                    />

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <Button
                        variant="surface"
                        size="sm"
                        onClick={() => void addPartEvidence(part.slug)}
                        icon={<Camera size={13} />}
                      >
                        Screenshot for this part ({part.evidence.length})
                      </Button>
                      <button
                        type="button"
                        title="Revert this part to its previous state and exclude it from the report"
                        onClick={() => cancelEdit(part.slug)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--us-text-dim)',
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Undo2 size={12} /> Cancel edit
                      </button>
                    </div>
                    {part.evidence.length > 0 && (
                      <EvidenceThumbs
                        evidence={part.evidence}
                        onRemove={(id) =>
                          updatePart(part.slug, (current) => ({
                            ...current,
                            evidence: current.evidence.filter((existing) => existing.id !== id),
                          }))
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {catalogue === null ? (
        <Button variant="ghost" size="sm" onClick={() => void loadCatalogue()} icon={<Plus size={13} />}>
          Add another part from catalogue
        </Button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: 'var(--us-text-muted)' }}>Additional Parts:</span>
          {catalogue.length === 0 ? (
            <span style={{ color: 'var(--us-text-dim)' }}>All catalogue parts added.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {catalogue.map((item) => (
                <button
                  key={item.slug}
                  onClick={() => addCataloguePart(item)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--us-border)',
                    borderRadius: 'var(--us-radius-pill)',
                    padding: '4px 10px',
                    color: 'var(--us-text-muted)',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--us-gold)';
                    e.currentTarget.style.borderColor = 'var(--us-gold)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--us-text-muted)';
                    e.currentTarget.style.borderColor = 'var(--us-border)';
                  }}
                >
                  <Plus size={11} /> {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Input
        label="Your Email"
        placeholder="Optional, in case we need to contact you"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Textarea
        label="General Report Note"
        placeholder="Summary of testing conditions, ISP used, or observations..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        helperText="Optional context attached to the review note"
        rows={2}
      />

      {success !== null ? (
        <div className="us-toast-green">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="us-toast-badge">
              <Check size={16} strokeWidth={3} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--us-working-text)', marginBottom: 2 }}>
                Report Submitted
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
            disabled={submitting || testedParts.length === 0}
            onClick={() => void submit()}
            fullWidth
          >
            {submitting ? 'Submitting report…' : `Submit Functionality Report (${testedParts.length} tested)`}
          </Button>
          <p style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: 'var(--us-text-muted)' }}>
            We review all reports before publishing. Usually within 24 hours.
          </p>
        </div>
      )}
    </div>
  );
}
