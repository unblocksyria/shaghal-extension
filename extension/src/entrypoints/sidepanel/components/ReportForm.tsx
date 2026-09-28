import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RadioGroup } from '../../../components/ui/RadioGroup';
import { getFunctionalities, type FunctionalityItem, type ServiceRecord } from '../../../lib/endpoints';
import { submitFunctionalityReport } from '../../../lib/submit';
import { SITE_BASE } from '../../../lib/config';
import { activeLanguage, sitePathSegment } from '../../../lib/i18n';
import { serviceName } from '../../../lib/serviceName';
import { Textarea } from '../../../components/ui/Textarea';
import {
  EmailField,
  emailError,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  hintStyle,
  uploadScreenshots,
  useSavedEmail,
  useScreenshotLists,
  useFormError,
} from './FormParts';
import { VpnWarning } from './VpnWarning';
import { ArrowUpRight, BookOpen, X } from 'lucide-react';

type Level = 'working' | 'failing' | 'unknown';

const LEVELS: Level[] = ['working', 'failing', 'unknown'];

/** Parts every service has. Offered when the record lists none, even if the catalogue fails to load. */
const DEFAULT_PART_SLUGS = ['core_use', 'landing_page'] as const;

/** Translation keys for the default parts' fallback names. */
const DEFAULT_PART_KEYS: Record<string, 'report.partCoreUse' | 'report.partLandingPage'> = {
  core_use: 'report.partCoreUse',
  landing_page: 'report.partLandingPage',
};

/** The site's testing guide in the active language. */
function testingGuideUrl(): string {
  return `${SITE_BASE}${sitePathSegment(activeLanguage())}/articles/how-to-test-a-service-from-syria`;
}

interface Part {
  slug: string;
  name: string;
  /** Recorded level, or null if the service does not record this part. */
  recorded: Level | null;
}

function LevelPicker(props: { name: string; value: Level; onChange: (level: Level) => void }) {
  const { t } = useTranslation();
  const labels: Record<Level, string> = {
    working: t('report.levelWorking'),
    failing: t('report.levelFailing'),
    unknown: t('report.levelUnknown'),
  };
  return (
    <RadioGroup className="us-level-picker" aria-label={props.name}>
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={props.value === level}
          tabIndex={props.value === level ? 0 : -1}
          data-level={level}
          onClick={() => props.onChange(level)}
        >
          {labels[level]}
        </button>
      ))}
    </RadioGroup>
  );
}

/**
 * Each part starts at its recorded level. A part is sent when it differs from
 * the record, or repeats it with a note or screenshot. A part that contradicts
 * the record needs a note or screenshot.
 */
export function ReportForm(props: { service: ServiceRecord; pageUrl: string | null; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
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
  const { error, setError, showApiError, onDiscard } = useFormError();
  const [sent, setSent] = useState(false);

  const screenshots = useScreenshotLists(props.pageUrl);

  // Language of the displayed part names. The catalogue arrives in the active
  // locale, so this advances only when a fetch succeeds.
  const namesLanguage = useRef(language);

  useEffect(() => {
    // Fallback names for the default parts, from the extension's own translations.
    const defaultNames: Record<string, string> = {
      core_use: t('report.partCoreUse'),
      landing_page: t('report.partLandingPage'),
    };
    let cancelled = false;
    void getFunctionalities().then((result) => {
      if (cancelled) return;
      const catalogueNames = new Map(result.ok ? result.data.map((item) => [item.slug, item.name]) : []);
      const nameOf = (slug: string): string => catalogueNames.get(slug) ?? defaultNames[slug] ?? slug;
      if (!result.ok) {
        // The default parts need no catalogue, so the form still works.
        setCatalogueFailed(true);
      } else {
        setCatalogueFailed(false);
        setCatalogue(result.data);
      }
      // Read here. The updater runs after `namesLanguage` is advanced below.
      const rename = namesLanguage.current !== language;
      setParts((current) => {
        if (current.length === 0) {
          return DEFAULT_PART_SLUGS.map((slug) => ({ slug, name: nameOf(slug), recorded: null }));
        }
        // On a language switch, rename every part, not only the defaults.
        // Notes, levels and screenshots are kept.
        if (!rename) return current;
        return current.map((part) =>
          part.slug in DEFAULT_PART_KEYS
            ? { ...part, name: defaultNames[part.slug] ?? part.name }
            : { ...part, name: catalogueNames.get(part.slug) ?? part.name },
        );
      });
      // Only a successful fetch marks the names current, so "Try again" after a
      // failure still renames.
      if (result.ok) namesLanguage.current = language;
    });
    return () => {
      cancelled = true;
    };
  }, [catalogueAttempt, language, t]);

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
    if (busy) return;
    const invalidEmail = emailError(email);
    if (invalidEmail !== null) {
      setError(invalidEmail);
      return;
    }
    if (missingDetail.length > 0) {
      setShowMissing(true);
      setError(t('report.addDetailError'));
      return;
    }
    if (answered.length === 0) return;
    if (
      answered.length > 30 ||
      answered.reduce((total, part) => total + screenshots.list(part.slug).items.length, 0) > 100
    ) {
      setError(t('report.tooMany'));
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
      showApiError(result.error);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <SentState
        title={t('report.sentTitle')}
        message={t('report.sentMessage')}
        actionLabel={t('common.backTo', { name: serviceName(props.service) })}
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      busy={busy}
      backLabel={t('common.backTo', { name: serviceName(props.service) })}
      onBack={props.onBack}
      title={t('report.title')}
      intro={t('report.intro', { name: serviceName(props.service) })}
    >
      <VpnWarning />

      <p className="us-callout">
        <BookOpen size={16} aria-hidden="true" />
        <span>
          <span style={{ color: 'var(--us-text-muted)' }}>{t('report.newToTesting')} </span>
          <a
            className="us-text-link"
            href={testingGuideUrl()}
            target="_blank"
            rel="noreferrer"
            style={{ whiteSpace: 'nowrap' }}
          >
            {t('report.readGuide')}
            <ArrowUpRight size={13} style={{ verticalAlign: '-2px', marginInlineStart: 2 }} aria-hidden="true" />
          </a>
        </span>
      </p>

      <div
        style={{ display: 'grid', borderTop: '1px solid var(--us-border)', borderBottom: '1px solid var(--us-border)' }}
      >
        {parts.length === 0 && <p style={{ ...hintStyle, padding: '16px 0' }}>{t('report.loading')}</p>}
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
                    <span className="us-tag">{t('report.notRecorded')}</span>
                    <button
                      type="button"
                      onClick={() => removePart(part.slug)}
                      aria-label={t('report.remove', { name: part.name })}
                      title={t('report.remove', { name: part.name })}
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
                    aria-label={t('report.notesFor', { name: part.name })}
                    placeholder={t('report.notePlaceholder')}
                    value={notes[part.slug] ?? ''}
                    maxLength={2000}
                    onChange={(event) => setNotes((current) => ({ ...current, [part.slug]: event.target.value }))}
                    rows={2}
                  />
                  <ScreenshotField screenshots={screenshots.list(part.slug)} max={5} locked={busy} />
                  {matchesRecord(part) && !hasDetail(part) && <p style={hintStyle}>{t('report.sameAsRecorded')}</p>}
                  {needsDetail(part) && (
                    <p
                      style={{
                        ...hintStyle,
                        color: showMissing ? 'var(--us-danger)' : 'var(--us-text-muted)',
                        fontWeight: showMissing ? 500 : 400,
                      }}
                    >
                      {t('report.required')}
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
          {t('report.catalogueFailed')}{' '}
          <button
            type="button"
            className="us-text-link"
            onClick={() => setCatalogueAttempt((attempt) => attempt + 1)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
          >
            {t('common.tryAgain')}
          </button>
        </p>
      )}

      {addable.length > 0 && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="us-label">{t('report.addPart')}</span>
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
              {t('report.choosePart')}
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
        label={t('report.send')}
        busyLabel={t('report.sending')}
        busy={busy}
        blocker={answered.length === 0 ? t('report.blocker') : null}
        note={t('report.note')}
        error={error}
        onDiscard={onDiscard}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
