import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { submitService } from '../../../lib/submit';
import { checkDuplicate } from '../../../lib/endpoints';
import { recordSent } from '../../../lib/history';
import { normalizeServiceUrl } from '../../../lib/url';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { needsUpload } from '../../../lib/evidence';
import { useDraft, type RestoredDraft } from '../hooks/useDraft';
import {
  EmailField,
  emailError,
  FormFooter,
  FormShell,
  hintStyle,
  NoEvidencePrompt,
  ScreenshotField,
  SentState,
  SINGLE_LIST_KEY,
  uploadScreenshots,
  useSavedEmail,
  useScreenshots,
  useFormError,
} from './FormParts';
import { VpnWarning } from './VpnWarning';

/** What happens from Syria, as the first line reviewers read. Sent in English, as reviewers work in it. */
const SYMPTOMS = {
  noLoad: "The site doesn't load.",
  region: 'It says it is not available in this country or region.',
  refused: 'Sign-up or payment is refused.',
} as const;
type Symptom = keyof typeof SYMPTOMS;

/** What the draft keeps of this form. The url comes from the page it was opened on. */
interface ServiceDraftFields {
  name: string;
  description: string;
  symptom?: Symptom | null;
  email?: string;
}

/** First segment of the page title, which usually names the site. At most 80 characters. */
function nameFromTitle(title: string | null): string {
  if (title === null) return '';
  const first = title.split(/\s[|–—-]\s/)[0] ?? title;
  return first.trim().slice(0, 80);
}

export function ReportServiceForm(props: { url: string; pageTitle: string | null; onBack: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => nameFromTitle(props.pageTitle));
  const [description, setDescription] = useState('');
  const [symptom, setSymptom] = useState<Symptom | null>(null);
  // Reviewers verify a new service by its screenshots, so a send without one asks once.
  const [askedEvidence, setAskedEvidence] = useState(false);
  // Someone already sent this site and it is waiting for review (issue 48). Never blocks.
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void checkDuplicate(props.url, controller.signal).then((result) => {
      if (result.ok) setPending(result.data.duplicateType === 'pending');
    });
    return () => controller.abort();
  }, [props.url]);
  const screenshots = useScreenshots(props.url);
  const [email, setEmail] = useSavedEmail();
  const [busy, setBusy] = useState(false);
  const { error, setError, showApiError, onDiscard } = useFormError();
  // Shown under the email field, which it marks invalid.
  const [emailProblem, setEmailProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onRestore = ({ fields, shots }: RestoredDraft<ServiceDraftFields>) => {
    setName(typeof fields.name === 'string' ? fields.name : '');
    setDescription(typeof fields.description === 'string' ? fields.description : '');
    setSymptom(typeof fields.symptom === 'string' && fields.symptom in SYMPTOMS ? fields.symptom : null);
    // Through the saved email's own setter, which stops it overwriting this with the stored one.
    if (typeof fields.email === 'string') setEmail(fields.email);
    screenshots.restore(Object.fromEntries(shots.map((group) => [group.partSlug ?? SINGLE_LIST_KEY, group.items])));
  };

  const draft = useDraft<ServiceDraftFields>({
    form: 'report-service',
    serviceKey: normalizeServiceUrl(props.url) ?? props.url,
    fields: { name, description, symptom, email },
    shots: [{ partSlug: null, items: screenshots.items }],
    onRestore,
  });

  const submit = async (withoutEvidence = false) => {
    if (busy) return;
    const invalidEmail = emailError(email);
    if (invalidEmail !== null) {
      setError(null);
      setEmailProblem(invalidEmail);
      return;
    }
    if (name.trim().length === 0) return;
    if (screenshots.items.length === 0 && !withoutEvidence) {
      setAskedEvidence(true);
      return;
    }
    setAskedEvidence(false);
    setBusy(true);
    setError(null);
    const uploaded = await uploadScreenshots([screenshots], 'submission', 'submission');
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.message);
      return;
    }
    const result = await submitService({
      name: name.trim(),
      url: props.url,
      description:
        [symptom === null ? '' : `From Syria: ${SYMPTOMS[symptom]}`, description.trim()]
          .filter((line) => line !== '')
          .join('\n')
          .slice(0, 2000) || undefined,
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      evidenceUrls: uploaded.urls[0] ?? [],
    });
    setBusy(false);
    if (!result.ok) {
      showApiError(result.error);
      return;
    }
    // Only a confirmed send lets the draft go, so a refusal keeps it for a retry.
    draft.clear();
    void recordSent({ kind: 'service', serviceName: name.trim() });
    setSent(true);
  };

  if (sent) {
    return (
      <SentState
        title={t('reportService.sentTitle')}
        message={t('reportService.sentMessage')}
        actionLabel={t('reportService.done')}
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      busy={busy}
      backLabel={t('common.back')}
      onBack={props.onBack}
      onDiscardDraft={draft.clear}
      onTouched={draft.markTouched}
      restored={draft.restored}
      title={t('reportService.title')}
      intro={t('reportService.intro')}
      footer={
        <FormFooter
          label={t('reportService.submit')}
          busyLabel={t('reportService.submitting')}
          busy={busy}
          verify={screenshots.items.some(needsUpload) ? 'upload' : 'submission'}
          blocker={name.trim().length === 0 ? t('reportService.blocker') : null}
          note={t('reportService.note')}
          error={error}
          onDiscard={onDiscard}
          onSubmit={() => void submit()}
        />
      }
    >
      <VpnWarning />
      {pending && (
        <p className="us-callout" role="status">
          {t('reportService.pending')}
        </p>
      )}
      <Input
        label={t('reportService.name')}
        maxLength={200}
        dir="auto"
        requiredMark
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input label={t('reportService.url')} value={props.url} dir="ltr" disabled />
      <div role="group" aria-labelledby="service-symptom" style={{ display: 'grid', gap: 8 }}>
        <span id="service-symptom" className="us-label">
          {t('reportService.symptom')}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(SYMPTOMS) as Symptom[]).map((value) => (
            <button
              key={value}
              type="button"
              className="us-chip"
              aria-pressed={symptom === value}
              onClick={() => setSymptom((current) => (current === value ? null : value))}
            >
              {t(`reportService.symptoms.${value}` as const)}
            </button>
          ))}
        </div>
        <p style={hintStyle}>{t('reportService.symptomHint')}</p>
      </div>
      <Textarea
        label={t('reportService.description')}
        maxLength={2000}
        placeholder={t('reportService.descriptionPlaceholder')}
        dir="auto"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
      />
      <div id="service-evidence">
        <ScreenshotField
          screenshots={screenshots}
          locked={busy}
          label={t('reportService.evidenceLabel')}
          hint={t('reportService.evidenceHint')}
        />
      </div>
      <EmailField value={email} onChange={setEmail} error={emailProblem} onClearError={() => setEmailProblem(null)} />
      {askedEvidence && screenshots.items.length === 0 && (
        <NoEvidencePrompt
          message={t('reportService.noEvidence')}
          fieldId="service-evidence"
          onSendAnyway={() => void submit(true)}
        />
      )}
    </FormShell>
  );
}
