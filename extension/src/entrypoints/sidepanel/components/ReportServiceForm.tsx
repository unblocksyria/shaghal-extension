import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { submitService } from '../../../lib/submit';
import { normalizeServiceUrl } from '../../../lib/url';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useDraft, type RestoredDraft } from '../hooks/useDraft';
import {
  EmailField,
  emailError,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  SINGLE_LIST_KEY,
  uploadScreenshots,
  useSavedEmail,
  useScreenshots,
  useFormError,
} from './FormParts';
import { VpnWarning } from './VpnWarning';

/** What the draft keeps of this form. The url comes from the page it was opened on. */
interface ServiceDraftFields {
  name: string;
  description: string;
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
  const screenshots = useScreenshots(props.url);
  const [email, setEmail] = useSavedEmail();
  const [busy, setBusy] = useState(false);
  const { error, setError, showApiError, onDiscard } = useFormError();
  const [sent, setSent] = useState(false);

  const onRestore = ({ fields, shots }: RestoredDraft<ServiceDraftFields>) => {
    setName(typeof fields.name === 'string' ? fields.name : '');
    setDescription(typeof fields.description === 'string' ? fields.description : '');
    // Through the saved email's own setter, which stops it overwriting this with the stored one.
    if (typeof fields.email === 'string') setEmail(fields.email);
    screenshots.restore(Object.fromEntries(shots.map((group) => [group.partSlug ?? SINGLE_LIST_KEY, group.items])));
  };

  const draft = useDraft<ServiceDraftFields>({
    form: 'report-service',
    serviceKey: normalizeServiceUrl(props.url) ?? props.url,
    fields: { name, description, email },
    shots: [{ partSlug: null, items: screenshots.items }],
    onRestore,
  });

  const submit = async () => {
    if (busy) return;
    const invalidEmail = emailError(email);
    if (invalidEmail !== null) {
      setError(invalidEmail);
      return;
    }
    if (name.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const uploaded = await uploadScreenshots(screenshots, 'submission');
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.message);
      return;
    }
    const result = await submitService({
      name: name.trim(),
      url: props.url,
      description: description.trim().length > 0 ? description.trim() : undefined,
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      evidenceUrls: uploaded.urls,
    });
    setBusy(false);
    if (!result.ok) {
      showApiError(result.error);
      return;
    }
    // Only a confirmed send lets the draft go, so a refusal keeps it for a retry.
    draft.clear();
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
    >
      <VpnWarning />
      <Input
        label={t('reportService.name')}
        maxLength={200}
        requiredMark
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input label={t('reportService.url')} value={props.url} disabled />
      <Textarea
        label={t('reportService.description')}
        maxLength={2000}
        placeholder={t('reportService.descriptionPlaceholder')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
      />
      <ScreenshotField
        screenshots={screenshots}
        locked={busy}
        label={t('reportService.evidenceLabel')}
        hint={t('reportService.evidenceHint')}
      />
      <EmailField value={email} onChange={setEmail} />
      <FormFooter
        label={t('reportService.submit')}
        busyLabel={t('reportService.submitting')}
        busy={busy}
        blocker={name.trim().length === 0 ? t('reportService.blocker') : null}
        note={t('reportService.note')}
        error={error}
        onDiscard={onDiscard}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
