import { useEffect, useRef, useState } from 'react';
import { captureScreenshot, uploadPendingEvidence, type PendingEvidence } from '../../../lib/evidence';
import { getSavedEmail } from '../../../lib/settings';
import { siteOf } from '../../../lib/url';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EvidenceThumbs } from './EvidenceThumbs';
import { ArrowLeft, Camera, Check } from 'lucide-react';

export const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--us-card)',
  border: '1px solid var(--us-border)',
  borderRadius: 'var(--us-radius-card)',
  padding: '20px 18px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 18,
  boxShadow: 'var(--shadow-syrian-card)',
};

export const titleStyle: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 500,
  margin: 0,
  color: 'var(--us-text-primary)',
  letterSpacing: '-0.01em',
  lineHeight: 1.3,
};

export const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--us-text-muted)',
  lineHeight: 1.5,
};

export function FormShell(props: {
  backLabel: string;
  onBack: () => void;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <button
        type="button"
        onClick={props.onBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--us-link)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          padding: 0,
          justifySelf: 'start',
          fontFamily: 'inherit',
        }}
      >
        <ArrowLeft size={14} /> {props.backLabel}
      </button>
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={titleStyle}>{props.title}</h1>
        <p style={{ ...hintStyle, fontSize: 13 }}>{props.intro}</p>
      </div>
      {props.children}
    </section>
  );
}

export interface ScreenshotList {
  items: PendingEvidence[];
  error: string | null;
  take: () => Promise<void>;
  remove: (id: string) => void;
  /** Swap in the uploaded copy of a screenshot, so a retry does not upload it again. */
  replace: (item: PendingEvidence) => void;
  clear: () => void;
}

/**
 * Screenshots kept in separate lists by key, such as one per part of a report.
 *
 * With `pageUrl`, a capture on a different site needs a second press: the panel
 * stays open across tabs, but a service can also send you through another site
 * (sign-in, payment) on purpose.
 */
export function useScreenshotLists(pageUrl?: string | null): { list: (key: string) => ScreenshotList } {
  const [byKey, setByKey] = useState<Record<string, PendingEvidence[]>>({});
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // `${key} ${site}` of the last capture held back; pressing again for it captures.
  const [heldFor, setHeldFor] = useState<string | null>(null);

  // Previews are object URLs, which live until revoked.
  const current = useRef(byKey);
  useEffect(() => {
    current.current = byKey;
  }, [byKey]);
  useEffect(
    () => () => {
      for (const items of Object.values(current.current))
        for (const item of items) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const expected = siteOf(pageUrl);

  const list = (key: string): ScreenshotList => ({
    items: byKey[key] ?? [],
    error: failure?.key === key ? failure.message : null,
    take: async () => {
      setFailure(null);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = siteOf(tab?.url);
        if (expected !== '' && site !== expected && heldFor !== `${key} ${site}`) {
          setHeldFor(`${key} ${site}`);
          setFailure({
            key,
            message: `This tab shows ${site || 'another page'}, not ${expected}. Switch back to it, or press again to capture this tab anyway.`,
          });
          return;
        }
        setHeldFor(null);
        const item = await captureScreenshot(tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT);
        setByKey((lists) => ({ ...lists, [key]: [...(lists[key] ?? []), item] }));
      } catch (captureError) {
        setFailure({ key, message: `Could not take a screenshot: ${String(captureError)}` });
      }
    },
    remove: (id: string) => {
      const removed = (byKey[key] ?? []).find((item) => item.id === id);
      if (removed !== undefined) URL.revokeObjectURL(removed.previewUrl);
      setByKey((lists) => ({ ...lists, [key]: (lists[key] ?? []).filter((item) => item.id !== id) }));
    },
    clear: () => {
      for (const item of byKey[key] ?? []) URL.revokeObjectURL(item.previewUrl);
      setByKey((lists) => ({ ...lists, [key]: [] }));
    },
    replace: (next: PendingEvidence) =>
      setByKey((lists) => ({
        ...lists,
        [key]: (lists[key] ?? []).map((item) => (item.id === next.id ? next : item)),
      })),
  });

  return { list };
}

export function useScreenshots(pageUrl?: string | null): ScreenshotList {
  return useScreenshotLists(pageUrl).list('form');
}

/** Uploaded screenshots stay in the list, so sending again after a refusal reuses them. */
export async function uploadScreenshots(
  screenshots: ScreenshotList,
  type: 'submission' | 'correction' | 'functionality_report',
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  const urls: string[] = [];
  for (const item of screenshots.items) {
    const result = await uploadPendingEvidence(item, type);
    if (!result.ok) return { ok: false, message: `A screenshot could not be uploaded: ${result.error.message}` };
    if (item.uploadedUrl === undefined) screenshots.replace(result.data);
    urls.push(result.data.uploadedUrl as string);
  }
  return { ok: true, urls };
}

export function ScreenshotField(props: { screenshots: ScreenshotList; label?: string; hint?: string; max?: number }) {
  const { items, error, take, remove } = props.screenshots;
  const full = items.length >= (props.max ?? 10);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {props.label !== undefined && <span className="us-label">{props.label}</span>}
      <EvidenceThumbs evidence={items} onRemove={remove} />
      <Button
        variant="surface"
        size="sm"
        onClick={() => void take()}
        disabled={full}
        icon={<Camera size={13} />}
        style={{ justifySelf: 'start' }}
      >
        {items.length === 0 ? 'Add screenshot' : 'Add another screenshot'}
      </Button>
      {props.hint !== undefined && <p style={hintStyle}>{props.hint}</p>}
      {error !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{error}</p>}
    </div>
  );
}

export function useSavedEmail(): [string, (value: string) => void] {
  const [email, setEmail] = useState('');
  useEffect(() => {
    void getSavedEmail().then(setEmail);
  }, []);
  return [email, setEmail];
}

export function EmailField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      label="Your email"
      type="email"
      placeholder="your@email.com"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      helperText="Optional. Never shown. Credits your volunteer profile."
    />
  );
}

export function FormFooter(props: {
  label: string;
  busyLabel: string;
  busy: boolean;
  /** Why it cannot be sent yet, or null when it can. */
  blocker: string | null;
  note: string;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {props.error !== null && (
        <p style={{ ...hintStyle, color: 'var(--us-danger)', fontSize: 13 }} role="alert">
          {props.error}
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={props.busy || props.blocker !== null}
        onClick={props.onSubmit}
      >
        {props.busy ? props.busyLabel : props.label}
      </Button>
      <p style={{ ...hintStyle, textAlign: 'center' }}>{props.blocker ?? props.note}</p>
    </div>
  );
}

export function SentState(props: { title: string; message: string; actionLabel: string; onAction: () => void }) {
  return (
    <section className="us-animate-fade" style={{ ...cardStyle, justifyItems: 'center', textAlign: 'center', gap: 12 }}>
      <div className="us-toast-badge" style={{ width: 40, height: 40 }}>
        <Check size={20} strokeWidth={3} />
      </div>
      <h1 style={{ ...titleStyle, fontSize: 18 }}>{props.title}</h1>
      <p style={{ ...hintStyle, fontSize: 13 }}>{props.message}</p>
      <Button variant="surface" size="md" onClick={props.onAction}>
        {props.actionLabel}
      </Button>
    </section>
  );
}
