import { useState } from 'react';
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
        title="Report received"
        message="Thank you for helping map Syria's digital access. We'll review your submission and add it to our database."
        actionLabel="Done"
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      backLabel="Back"
      onBack={props.onBack}
      title="Report a Service"
      intro="Tell us about a service that blocks Syria. We verify it, then track it. Browse from Syria without a VPN so we can check it."
    >
      <VpnWarning />
      <Input label="Service name" requiredMark value={name} onChange={(event) => setName(event.target.value)} />
      <Input label="Website URL" value={props.url} disabled />
      <Textarea
        label="Description"
        placeholder="What does it do, and what happens when you use it from Syria?"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
      />
      <ScreenshotField
        screenshots={screenshots}
        label="Evidence screenshots"
        hint="Screenshots are how we verify a report. Add one showing the block or error message."
      />
      <EmailField value={email} onChange={setEmail} />
      <FormFooter
        label="Submit Report"
        busyLabel="Submitting…"
        busy={busy}
        blocker={name.trim().length === 0 ? 'Enter the service name.' : null}
        note="We review all submissions before publishing. Usually within 24 hours."
        error={error}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
