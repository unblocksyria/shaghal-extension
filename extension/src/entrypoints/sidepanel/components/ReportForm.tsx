import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RadioGroup } from '../../../components/ui/RadioGroup';
import { Input } from '../../../components/ui/Input';
import type { FunctionalityItem, ServiceRecord } from '../../../lib/endpoints';
import { loadFunctionalities } from '../../../lib/reads';
import { submitFunctionalityReport, type ReportItem } from '../../../lib/submit';
import { recordSent } from '../../../lib/history';
import { SITE_BASE } from '../../../lib/config';
import { testedHostOf } from '../../../lib/url';
import { activeLanguage, i18next, intlLocale, sitePathSegment } from '../../../lib/i18n';
import { serviceName } from '../../../lib/serviceName';
import { Textarea } from '../../../components/ui/Textarea';
import { storedList, storedRecord, storedStrings } from '../../../lib/drafts';
import { useDraft, type RestoredDraft } from '../hooks/useDraft';
import {
  EmailField,
  emailError,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  SINGLE_LIST_KEY,
  hintStyle,
  uploadScreenshots,
  useSavedEmail,
  useScreenshotLists,
  useFormError,
} from './FormParts';
import { VpnWarning } from './VpnWarning';
import { ArrowUpRight, BookOpen, Plus, X } from 'lucide-react';

type Level = 'working' | 'failing' | 'unknown';
type Answer = 'working' | 'failing';

/** Parts every service has. Offered when the record lists none, even if the catalogue fails to load. */
const DEFAULT_PART_SLUGS = ['core_use', 'landing_page'] as const;

/** Translation keys for the default parts' fallback names. */
const DEFAULT_PART_KEYS: Record<string, 'report.partCoreUse' | 'report.partLandingPage'> = {
  core_use: 'report.partCoreUse',
  landing_page: 'report.partLandingPage',
};

/**
 * The catalogue's catch-all part. A named part (issue 49) takes its place, so
 * the picker never offers two ways to say "something else".
 */
const CATCH_ALL_SLUG = 'unspecified';

/** Prefix of a part the tester named. Never a catalogue slug, so it can't be sent as one. */
const NAMED = 'named:';
const isNamed = (key: string) => key.startsWith(NAMED);

/** The longest name the API takes for a named part. */
const NAME_MAX = 80;

/** Parts that count as failing when sign-in fails, as reviewers record them. */
const NEEDS_SIGN_IN = ['payment', 'upgrade', 'payout', 'otp', 'identity_verification'];

/** How the tester was connected, sent to reviewers in English whatever the panel's language. */
const CONNECTIONS = { home: 'home internet (ADSL or fibre)', mobile: 'mobile data' } as const;
type Connection = keyof typeof CONNECTIONS;

/** The site's testing guide in the active language. */
function testingGuideUrl(): string {
  return `${SITE_BASE}${sitePathSegment(activeLanguage())}/articles/how-to-test-a-service-from-syria`;
}

interface Part {
  /** A catalogue slug, or `named:<n>` for a part the tester named. */
  key: string;
  name: string;
  /** Recorded level, or null if the service does not record this part. */
  recorded: Level | null;
  /** When the recorded level was last checked. */
  checkedAt?: string | null;
}

/** What the draft keeps of this form. Part names and recorded levels come from the service. */
interface ReportDraftFields {
  /** The parts the tester chose, in order. Named parts keep their `named:` key. */
  chosen: string[];
  answers: Record<string, Answer>;
  notes: Record<string, string>;
  /** Names the tester gave their own parts, by key. */
  names: Record<string, string>;
  connection?: Connection | null;
  email?: string;
  /**
   * The host the report was started on, so a restored draft keeps its notes
   * and screenshots with the address they came from.
   */
  testedHost?: string | null;
}

function shortDate(iso: string | null | undefined): string | null {
  if (iso == null || !Number.isFinite(Date.parse(iso))) return null;
  return new Date(iso).toLocaleDateString(intlLocale(activeLanguage()), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** A one-line testing hint for a catalogue part, from what reviewers correct most often. */
function hintFor(slug: string): string | null {
  const hints: Record<string, string | undefined> = i18next.t('report.hints', { returnObjects: true });
  return hints[slug] ?? null;
}

/** The two answers a part offers, worded against what the record says. */
function answerLabels(recorded: Level | null): Record<Answer, string> {
  if (recorded === 'failing') return { failing: i18next.t('report.stillFails'), working: i18next.t('report.worksNow') };
  if (recorded === 'working') return { working: i18next.t('report.stillWorks'), failing: i18next.t('report.failsNow') };
  return { working: i18next.t('report.levelWorking'), failing: i18next.t('report.levelFailing') };
}

function AnswerPicker(props: {
  name: string;
  recorded: Level | null;
  value: Answer | undefined;
  onChange: (answer: Answer) => void;
}) {
  useTranslation();
  const labels = answerLabels(props.recorded);
  // The record's own level comes first, so "Still fails" reads before "Works now".
  const order: Answer[] = props.recorded === 'failing' ? ['failing', 'working'] : ['working', 'failing'];
  return (
    <RadioGroup className="us-level-picker" aria-label={props.name}>
      {order.map((answer) => (
        <button
          key={answer}
          type="button"
          role="radio"
          aria-checked={props.value === answer}
          tabIndex={props.value === answer || (props.value === undefined && answer === order[0]) ? 0 : -1}
          data-level={answer}
          onClick={() => props.onChange(answer)}
        >
          {labels[answer]}
        </button>
      ))}
    </RadioGroup>
  );
}

/**
 * "Report what works", built around what the tester tried.
 *
 * The form opens with nothing chosen, or with the parts the tester came for
 * from the card. The tester picks each part they tried, says whether it works
 * with the record shown beside it, and adds a note or screenshot: the API
 * requires one of the two for every part sent. Parts not chosen are not sent,
 * so a report says only what was tested.
 */
export function ReportForm(props: {
  service: ServiceRecord;
  /** The service's slug, for the local record of what was sent. */
  slug: string;
  pageUrl: string | null;
  /** Parts to add from the start, such as the one whose "Test this" opened the form. */
  parts?: string[];
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const recordParts = props.service.functionalities ?? [];
  const [catalogue, setCatalogue] = useState<FunctionalityItem[]>([]);
  // The language the catalogue was loaded in. Until it matches the panel's, the
  // default parts use the extension's own names and the rest keep their old ones.
  const [catalogueLanguage, setCatalogueLanguage] = useState<string | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  // Bumped by "Try again" to fetch the catalogue once more.
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const [showAllParts, setShowAllParts] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() => (props.parts ?? []).filter((key) => !isNamed(key)));
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [connection, setConnection] = useState<Connection | null>(null);
  const [email, setEmail] = useSavedEmail();
  const [busy, setBusy] = useState(false);
  const { error, setError, showApiError, onDiscard } = useFormError();
  const [sent, setSent] = useState<{
    parts: { key: string; name: string; answer: Answer }[];
    host: string | null;
  } | null>(null);

  const screenshots = useScreenshotLists(props.pageUrl);
  // `pageUrl` is the page the form was opened on and does not follow later
  // navigation, so this is the host the tester was on when they chose to report.
  // A restored draft replaces it with the host the draft was started on.
  const [testedHost, setTestedHost] = useState<string | null>(() => testedHostOf(props.pageUrl));

  // Everything the tester can choose from: the service's own parts, core use
  // first, then the rest of the catalogue. Named parts are added on top.
  const catalogueNames = new Map(catalogue.map((item) => [item.slug, item.name]));
  const catalogueCurrent = catalogueLanguage === language;
  const nameFor = (slug: string, fallback: string): string => {
    const own = DEFAULT_PART_KEYS[slug];
    if (catalogueCurrent) return catalogueNames.get(slug) ?? (own === undefined ? fallback : t(own));
    return own === undefined ? (catalogueNames.get(slug) ?? fallback) : t(own);
  };
  const ownParts: Part[] = (
    recordParts.length > 0
      ? recordParts.map((part) => ({
          key: part.slug,
          name: nameFor(part.slug, part.name),
          recorded: part.level,
          checkedAt: part.lastObservedAt,
        }))
      : DEFAULT_PART_SLUGS.map((slug) => ({ key: slug, name: nameFor(slug, slug), recorded: null }))
  ).sort((a, b) => Number(b.key === 'core_use') - Number(a.key === 'core_use'));
  const extraParts: Part[] = catalogue
    .filter((item) => item.slug !== CATCH_ALL_SLUG && !ownParts.some((part) => part.key === item.slug))
    .map((item) => ({ key: item.slug, name: item.name, recorded: null }));
  const allParts = [...ownParts, ...extraParts];
  const partOf = (key: string): Part | undefined =>
    isNamed(key) ? { key, name: names[key] ?? '', recorded: null } : allParts.find((part) => part.key === key);
  // A chosen part the catalogue hasn't named yet waits for it rather than showing a slug.
  const chosenParts = chosen.map(partOf).filter((part): part is Part => part !== undefined);

  const onRestore = ({ fields, shots }: RestoredDraft<ReportDraftFields>) => {
    setChosen(storedList(fields.chosen));
    const restoredAnswers: Record<string, Answer> = {};
    for (const [key, value] of Object.entries(storedRecord(fields.answers)))
      if (value === 'working' || value === 'failing') restoredAnswers[key] = value;
    setAnswers(restoredAnswers);
    setNotes(storedStrings(fields.notes));
    setNames(storedStrings(fields.names));
    setConnection(fields.connection === 'home' || fields.connection === 'mobile' ? fields.connection : null);
    // Through the saved email's own setter, which stops it overwriting this with the stored one.
    if (typeof fields.email === 'string') setEmail(fields.email);
    // A draft without a readable host sends none rather than the current page's,
    // which may not be where its evidence came from.
    setTestedHost(typeof fields.testedHost === 'string' ? testedHostOf(`https://${fields.testedHost}/`) : null);
    screenshots.restore(Object.fromEntries(shots.map((group) => [group.partSlug ?? SINGLE_LIST_KEY, group.items])));
  };

  const draft = useDraft<ReportDraftFields>({
    form: 'report',
    serviceKey: props.service.id,
    fields: { chosen, answers, notes, names, connection, email, testedHost },
    shots: chosen.map((key) => ({ partSlug: key, items: screenshots.list(key).items })),
    onRestore,
  });

  useEffect(() => {
    let cancelled = false;
    void loadFunctionalities().then((result) => {
      if (cancelled) return;
      // The service's own parts and the defaults need no catalogue, so the form still works.
      setCatalogueFailed(!result.ok);
      if (result.ok) {
        setCatalogue(result.data);
        setCatalogueLanguage(language);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogueAttempt, language]);

  const hasDetail = (key: string) => (notes[key] ?? '').trim().length > 0 || screenshots.list(key).items.length > 0;
  const nameOf = (part: Part) => (isNamed(part.key) ? (names[part.key] ?? '').trim() : part.name);
  const signInFails = answers.sign_in === 'failing';
  // Parts reviewers count as failing once sign-in fails need no answer of their own.
  const implied = (part: Part) => signInFails && NEEDS_SIGN_IN.includes(part.key) && answers[part.key] === undefined;
  const unanswered = chosenParts.find((part) => answers[part.key] === undefined && !implied(part));
  const unnamed = chosenParts.find((part) => isNamed(part.key) && nameOf(part) === '');
  const missingDetail = chosenParts.filter((part) => answers[part.key] !== undefined && !hasDetail(part.key));
  // Parts left unanswered because sign-in failed are not sent; reviewers fill them in.
  const answered = chosenParts.filter((part) => answers[part.key] !== undefined);

  const blocker =
    chosenParts.length === 0
      ? t('report.chooseFirst')
      : unnamed !== undefined
        ? t('report.nameMissing')
        : unanswered !== undefined
          ? t('report.answerEach', { name: nameOf(unanswered) })
          : missingDetail.length > 0
            ? t('report.needDetail', { name: nameOf(missingDetail[0]!) })
            : null;

  const toggle = (key: string) => {
    setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const addNamed = () => {
    const used = new Set(chosen.filter(isNamed));
    let n = 1;
    while (used.has(`${NAMED}${n}`)) n += 1;
    setChosen((current) => [...current, `${NAMED}${n}`]);
  };

  const removeNamed = (key: string) => {
    setChosen((current) => current.filter((item) => item !== key));
    screenshots.list(key).clear();
    const drop = <T,>(record: Record<string, T>) => {
      const next = { ...record };
      delete next[key];
      return next;
    };
    setAnswers(drop);
    setNotes(drop);
    setNames(drop);
  };

  const submit = async () => {
    if (busy) return;
    const invalidEmail = emailError(email);
    if (invalidEmail !== null) {
      setError(invalidEmail);
      return;
    }
    if (blocker !== null) return;
    if (
      answered.length > 30 ||
      answered.reduce((total, part) => total + screenshots.list(part.key).items.length, 0) > 100
    ) {
      setError(t('report.tooMany'));
      return;
    }
    setBusy(true);
    setError(null);
    const uploaded = await uploadScreenshots(
      answered.map((part) => screenshots.list(part.key)),
      'functionality_report',
      'report',
    );
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.message);
      return;
    }
    const items: ReportItem[] = answered.map((part, index) => {
      const note = (notes[part.key] ?? '').trim();
      const urls = uploaded.urls[index] ?? [];
      return {
        ...(isNamed(part.key) ? { proposedName: nameOf(part).slice(0, NAME_MAX) } : { slug: part.key }),
        level: answers[part.key]!,
        description: note.length > 0 ? note : undefined,
        evidenceUrls: urls.length > 0 ? urls : undefined,
      };
    });
    const result = await submitFunctionalityReport({
      serviceId: props.service.id,
      items,
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      submitterNote: connection === null ? undefined : `Connection: ${CONNECTIONS[connection]}`,
      testedHost: testedHost ?? undefined,
    });
    setBusy(false);
    if (!result.ok) {
      showApiError(result.error);
      return;
    }
    // Only a confirmed send lets the draft go, so a refusal keeps it for a retry.
    draft.clear();
    void recordSent({
      kind: 'report',
      serviceSlug: props.slug,
      serviceName: serviceName(props.service),
      parts: answered.map((part) => ({
        ...(isNamed(part.key) ? {} : { slug: part.key }),
        name: nameOf(part),
        level: answers[part.key]!,
      })),
      testedHost,
    });
    setSent({
      parts: answered.map((part) => ({ key: part.key, name: nameOf(part), answer: answers[part.key]! })),
      host: testedHost,
    });
  };

  /** A new, empty report for the same service, from the sent screen. */
  const again = () => {
    // Every list, not only the chosen ones: a part unchosen before sending keeps its screenshots otherwise.
    for (const key of Object.keys(screenshots.entries())) screenshots.list(key).clear();
    setChosen([]);
    setAnswers({});
    setNotes({});
    setNames({});
    setError(null);
    setSent(null);
  };

  if (sent !== null) {
    // Another part is worth testing when one the record lacks or shows failing is left.
    const untried = ownParts.filter(
      (part) => part.recorded !== 'working' && !sent.parts.some((done) => done.key === part.key),
    );
    return (
      <SentState
        title={t('report.sentTitle')}
        message={t('report.sentMessage')}
        actionLabel={t('common.backTo', { name: serviceName(props.service) })}
        onAction={props.onBack}
        secondary={untried.length > 0 ? { label: t('report.testAnother'), onAction: again } : undefined}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, justifyItems: 'center' }}>
          {sent.parts.map((part) => (
            <li key={part.key} style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{part.name}</span>
              {': '}
              <span
                style={{ color: part.answer === 'working' ? 'var(--us-level-working)' : 'var(--us-level-failing)' }}
              >
                {part.answer === 'working' ? t('report.levelWorking') : t('report.levelFailing')}
              </span>
            </li>
          ))}
        </ul>
        {sent.host !== null && (
          <p style={hintStyle}>
            {t('report.testedOn')} <bdi dir="ltr">{sent.host}</bdi>
          </p>
        )}
        {email.trim() === '' && <p style={hintStyle}>{t('report.creditHint')}</p>}
      </SentState>
    );
  }

  const chip = (part: Part) => (
    <button
      key={part.key}
      type="button"
      className="us-chip"
      aria-pressed={chosen.includes(part.key)}
      onClick={() => toggle(part.key)}
    >
      {part.name}
    </button>
  );

  return (
    <FormShell
      busy={busy}
      backLabel={t('common.backTo', { name: serviceName(props.service) })}
      onBack={props.onBack}
      onDiscardDraft={draft.clear}
      onTouched={draft.markTouched}
      restored={draft.restored}
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

      <div role="group" aria-labelledby="report-tried" style={{ display: 'grid', gap: 8 }}>
        <span id="report-tried" className="us-label">
          {t('report.whatTried')}
        </span>
        <p style={{ ...hintStyle, marginTop: -4 }}>{t('report.whatTriedHint')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ownParts.map(chip)}
          {(showAllParts ? extraParts : extraParts.filter((part) => chosen.includes(part.key))).map(chip)}
          {extraParts.length > 0 && !showAllParts && (
            <button type="button" className="us-chip us-chip-quiet" onClick={() => setShowAllParts(true)}>
              {t('report.moreParts')}
            </button>
          )}
          <button type="button" className="us-chip us-chip-quiet" onClick={addNamed}>
            <Plus size={13} aria-hidden="true" /> {t('report.somethingElse')}
          </button>
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
      </div>

      {chosenParts.length > 0 && (
        <div
          style={{
            display: 'grid',
            borderTop: '1px solid var(--us-border)',
            borderBottom: '1px solid var(--us-border)',
          }}
        >
          {chosenParts.map((part, index) => {
            const named = isNamed(part.key);
            const answer = answers[part.key];
            const label = named ? nameOf(part) || t('report.namedPart') : part.name;
            const hint = named ? null : hintFor(part.key);
            const recordedDate = shortDate(part.checkedAt);
            const recordedLevel =
              part.recorded === 'working'
                ? t('report.levelWorking')
                : part.recorded === 'failing'
                  ? t('report.levelFailing')
                  : null;
            const missing = answer !== undefined && !hasDetail(part.key);
            return (
              <div
                key={part.key}
                role="group"
                aria-label={label}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: '16px 0',
                  borderTop: index === 0 ? undefined : '1px solid var(--us-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                  {named && (
                    <button
                      type="button"
                      onClick={() => removeNamed(part.key)}
                      aria-label={t('report.remove', { name: label })}
                      title={t('report.remove', { name: label })}
                      style={{
                        display: 'inline-flex',
                        marginInlineStart: 'auto',
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
                  )}
                </div>
                {named && (
                  <Input
                    label={t('report.namedLabel')}
                    maxLength={NAME_MAX}
                    requiredMark
                    placeholder={t('report.namedPlaceholder')}
                    value={names[part.key] ?? ''}
                    onChange={(event) => setNames((current) => ({ ...current, [part.key]: event.target.value }))}
                  />
                )}
                {hint !== null && <p style={hintStyle}>{hint}</p>}
                {!named && (
                  <p style={{ ...hintStyle, fontWeight: 500 }}>
                    {recordedLevel === null
                      ? t('report.nothingRecorded')
                      : recordedDate === null
                        ? t('report.onRecord', { level: recordedLevel })
                        : t('report.onRecordChecked', { level: recordedLevel, date: recordedDate })}
                  </p>
                )}
                {implied(part) ? (
                  <p style={hintStyle}>{t('report.impliedBySignIn')}</p>
                ) : (
                  <AnswerPicker
                    name={label}
                    recorded={part.recorded}
                    value={answer}
                    onChange={(next) => setAnswers((current) => ({ ...current, [part.key]: next }))}
                  />
                )}
                {part.key === 'sign_in' && answer === 'failing' && (
                  <p style={hintStyle}>{t('report.signInDependents')}</p>
                )}
                {answer !== undefined && (
                  <div className="us-animate-fade" style={{ display: 'grid', gap: 10 }}>
                    <Textarea
                      aria-label={t('report.notesFor', { name: label })}
                      placeholder={t('report.notePlaceholder')}
                      value={notes[part.key] ?? ''}
                      maxLength={2000}
                      onChange={(event) => setNotes((current) => ({ ...current, [part.key]: event.target.value }))}
                      rows={2}
                    />
                    <p style={{ ...hintStyle, marginTop: -4 }}>{t('report.notePrivacy')}</p>
                    <ScreenshotField screenshots={screenshots.list(part.key)} max={5} locked={busy} pasteFromParent />
                    {missing && <p style={{ ...hintStyle, fontWeight: 500 }}>{t('report.required')}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div role="group" aria-labelledby="report-connection" style={{ display: 'grid', gap: 8 }}>
        <span id="report-connection" className="us-label">
          {t('report.connection')}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(Object.keys(CONNECTIONS) as Connection[]).map((value) => (
            <button
              key={value}
              type="button"
              className="us-chip"
              aria-pressed={connection === value}
              onClick={() => setConnection((current) => (current === value ? null : value))}
            >
              {value === 'home' ? t('report.connectionHome') : t('report.connectionMobile')}
            </button>
          ))}
        </div>
      </div>

      <EmailField value={email} onChange={setEmail} />

      {testedHost !== null && (
        <p style={hintStyle}>
          {t('report.testedOn')} <bdi dir="ltr">{testedHost}</bdi>
        </p>
      )}

      <FormFooter
        label={t('report.send')}
        busyLabel={t('report.sending')}
        busy={busy}
        verify={
          answered.some((part) => screenshots.list(part.key).items.some((item) => item.uploadedUrl === undefined))
            ? 'upload'
            : 'report'
        }
        blocker={blocker}
        note={t('report.note')}
        error={error}
        onDiscard={onDiscard}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
