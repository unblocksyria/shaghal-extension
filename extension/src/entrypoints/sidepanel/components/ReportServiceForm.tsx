import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { submitService } from '../../../lib/submit';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import {
  EmailField,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  uploadScreenshots,
  useSavedEmail,
  useScreenshots,
} from './FormParts';
import { VpnWarning } from './VpnWarning';

/** A page title trimmed to the part that usually names the site. */
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
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
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
      setError(result.error.status === 429 ? t('reportService.rateLimited') : result.error.message);
      return;
    }
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
      backLabel={t('common.back')}
      onBack={props.onBack}
      title={t('reportService.title')}
      intro={t('reportService.intro')}
    >
      <VpnWarning />
      <Input
        label={t('reportService.name')}
        requiredMark
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input label={t('reportService.url')} value={props.url} disabled />
      <Textarea
        label={t('reportService.description')}
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
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
