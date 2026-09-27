import { useEffect, useState } from 'react';
import { getFunctionalities, type FunctionalityItem, type ServiceRecord } from '../../../lib/endpoints';
import { submitFunctionalityReport } from '../../../lib/submit';
import { SITE_BASE } from '../../../lib/config';
import { Textarea } from '../../../components/ui/Textarea';
import {
  EmailField,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  hintStyle,
  uploadScreenshots,
  useSavedEmail,
  useScreenshotLists,
} from './FormParts';
import { VpnWarning } from './VpnWarning';
import { ArrowUpRight, BookOpen, X } from 'lucide-react';

type Level = 'working' | 'failing' | 'unknown';

const LEVELS: { level: Level; label: string }[] = [
  { level: 'working', label: 'Works' },
  { level: 'failing', label: 'Fails' },
  { level: 'unknown', label: 'Not checked' },
];

/** Every service has these two. Offered when it records no parts yet, even if the catalogue cannot be loaded. */
const DEFAULT_PARTS: Record<string, string> = { core_use: 'Core use', landing_page: 'Landing page' };

const TESTING_GUIDE_URL = `${SITE_BASE}/en/articles/how-to-test-a-service-from-syria`;

interface Part {
  slug: string;
  name: string;
  /** What the service records today; null for a part the service does not record. */
  recorded: Level | null;
}

function LevelPicker(props: { name: string; value: Level; onChange: (level: Level) => void }) {
  return (
    <div className="us-level-picker" role="radiogroup" aria-label={props.name}>
      {LEVELS.map(({ level, label }) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={props.value === level}
          data-level={level}
          onClick={() => props.onChange(level)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Each part opens at the level the service records. A part is sent when it
 * says something new, or when it repeats the record with a note or a
 * screenshot. A part that contradicts the record needs a note or a screenshot.
 */
export function ReportForm(props: { service: ServiceRecord; pageUrl: string | null; onBack: () => void }) {
  const [parts, setParts] = useState<Part[]>(() =>
    (props.service.functionalities ?? []).map((part) => ({ slug: part.slug, name: part.name, recorded: part.level })),
  );
  const [catalogue, setCatalogue] = useState<FunctionalityItem[]>([]);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  // Bumped by "Try again" to fetch the catalogue once more.
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [email, setEmail] = useSavedEmail();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const screenshots = useScreenshotLists(props.pageUrl);

  useEffect(() => {
    let cancelled = false;
    void getFunctionalities().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        // The form still works: the default parts need no catalogue.
        setCatalogueFailed(true);
        setParts((current) =>
          current.length > 0
            ? current
            : Object.entries(DEFAULT_PARTS).map(([slug, name]) => ({ slug, name, recorded: null })),
        );
        return;
      }
      setCatalogueFailed(false);
      setCatalogue(result.data);
      setParts((current) =>
        current.length > 0
          ? current
          : result.data
              .filter((item) => item.slug in DEFAULT_PARTS)
              .map((item) => ({ slug: item.slug, name: item.name, recorded: null })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [catalogueAttempt]);

  const recordedOf = (part: Part): Level => part.recorded ?? 'unknown';
  const levelOf = (part: Part): Level => levels[part.slug] ?? recordedOf(part);
  const matchesRecord = (part: Part) => levelOf(part) === recordedOf(part);
  const hasDetail = (part: Part) =>
    (notes[part.slug] ?? '').trim().length > 0 || screenshots.list(part.slug).items.length > 0;
  const needsDetail = (part: Part) => !matchesRecord(part) && !hasDetail(part);

  const answered = parts.filter((part) => levelOf(part) !== 'unknown' && (!matchesRecord(part) || hasDetail(part)));
  const missingDetail = answered.filter(needsDetail);
  const addable = catalogue.filter((item) => !parts.some((part) => part.slug === item.slug));

  const choose = (part: Part, level: Level) => {
    setTouched((current) => ({ ...current, [part.slug]: true }));
    setLevels((current) => ({ ...current, [part.slug]: level }));
  };

  const removePart = (slug: string) => {
    setParts((current) => current.filter((part) => part.slug !== slug));
    screenshots.list(slug).clear();
    const drop = <T,>(record: Record<string, T>) => {
      const next = { ...record };
      delete next[slug];
      return next;
    };
    setLevels(drop);
    setTouched(drop);
    setNotes(drop);
  };

  const submit = async () => {
    if (missingDetail.length > 0) {
      setShowMissing(true);
      setError('Add a note or a screenshot to every part you marked.');
      return;
    }
    setBusy(true);
    setError(null);
    const items = [];
    for (const part of answered) {
      const uploaded = await uploadScreenshots(screenshots.list(part.slug), 'functionality_report');
      if (!uploaded.ok) {
        setBusy(false);
        setError(uploaded.message);
        return;
      }
      const note = (notes[part.slug] ?? '').trim();
      items.push({
        slug: part.slug,
        level: levelOf(part) as 'working' | 'failing',
        description: note.length > 0 ? note : undefined,
        evidenceUrls: uploaded.urls.length > 0 ? uploaded.urls : undefined,
      });
    }
    const result = await submitFunctionalityReport({
      serviceId: props.service.id,
      items,
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error.status === 429 ? 'Too many reports from this network. Try again later.' : result.error.message,
      );
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <SentState
        title="Report sent"
        message="Thank you. A volunteer reviews every report before it changes the record."
        actionLabel={`Back to ${props.service.name}`}
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      backLabel={`Back to ${props.service.name}`}
      onBack={props.onBack}
      title="Report what works"
      intro={`${props.service.name}: mark what worked and what failed from Syria, without a VPN.`}
    >
      <VpnWarning />

      <p className="us-callout">
        <BookOpen size={16} aria-hidden="true" />
        <span>
          <span style={{ color: 'var(--us-text-muted)' }}>New to testing? </span>
          <a
            className="us-text-link"
            href={TESTING_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            style={{ whiteSpace: 'nowrap' }}
          >
            Read the guide
            <ArrowUpRight size={13} style={{ verticalAlign: '-2px', marginLeft: 2 }} aria-hidden="true" />
          </a>
        </span>
      </p>

      <div
        style={{ display: 'grid', borderTop: '1px solid var(--us-border)', borderBottom: '1px solid var(--us-border)' }}
      >
        {parts.length === 0 && <p style={{ ...hintStyle, padding: '16px 0' }}>Loading the parts to check…</p>}
        {parts.map((part, index) => {
          const level = levelOf(part);
          return (
            <div
              key={part.slug}
              style={{
                display: 'grid',
                gap: 12,
                padding: '16px 0',
                borderTop: index === 0 ? undefined : '1px solid var(--us-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{part.name}</span>
                {part.recorded === null && (
                  <>
                    <span className="us-tag">Not recorded yet</span>
                    <button
                      type="button"
                      onClick={() => removePart(part.slug)}
                      aria-label={`Remove ${part.name}`}
                      title={`Remove ${part.name}`}
                      style={{
                        display: 'inline-flex',
                        padding: 4,
                        border: 'none',
                        borderRadius: 6,
                        background: 'none',
                        color: 'var(--us-text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              <LevelPicker name={part.name} value={level} onChange={(next) => choose(part, next)} />
              {touched[part.slug] === true && level !== 'unknown' && (
                <div className="us-animate-fade" style={{ display: 'grid', gap: 10 }}>
                  <Textarea
                    placeholder="What happened?"
                    value={notes[part.slug] ?? ''}
                    maxLength={2000}
                    onChange={(event) => setNotes((current) => ({ ...current, [part.slug]: event.target.value }))}
                    rows={2}
                  />
                  <ScreenshotField screenshots={screenshots.list(part.slug)} max={5} locked={busy} />
                  {matchesRecord(part) && !hasDetail(part) && (
                    <p style={hintStyle}>Same as recorded. Add a note or a screenshot to confirm it again.</p>
                  )}
                  {needsDetail(part) && (
                    <p
                      style={{
                        ...hintStyle,
                        color: showMissing ? 'var(--us-danger)' : 'var(--us-text-muted)',
                        fontWeight: showMissing ? 500 : 400,
                      }}
                    >
                      Required: a note or a screenshot showing this.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {catalogueFailed && (
        <p style={hintStyle}>
          Could not load the other parts you can add.{' '}
          <button
            type="button"
            className="us-text-link"
            onClick={() => setCatalogueAttempt((attempt) => attempt + 1)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
          >
            Try again
          </button>
        </p>
      )}

      {addable.length > 0 && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="us-label">Add a part you tried</span>
          <select
            className="us-field"
            value=""
            onChange={(event) => {
              const item = catalogue.find((entry) => entry.slug === event.target.value);
              if (item !== undefined)
                setParts((current) => [...current, { slug: item.slug, name: item.name, recorded: null }]);
            }}
          >
            <option value="" disabled>
              Choose a part
            </option>
            {addable.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <EmailField value={email} onChange={setEmail} />

      <FormFooter
        label="Send report"
        busyLabel="Sending…"
        busy={busy}
        blocker={answered.length === 0 ? 'Mark at least one as working or failing.' : null}
        note="Anything you mark is reviewed before it changes the record."
        error={error}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
