import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { captureScreenshot, uploadPendingEvidence, withEdits, type PendingEvidence } from '../../../lib/evidence';
import { getSavedEmail, watchSavedEmail } from '../../../lib/settings';
import { siteOf } from '../../../lib/url';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
  EditorBusyError,
  closeEditorWindow,
  editInWindow,
  focusEditorWindow,
  isEditorOpen,
  watchEditor,
} from '../../../lib/editorWindow';
import type { EditedScreenshot } from '../../../lib/imageEdits';
import { ScreenshotEditor } from '../../../components/editor/ScreenshotEditor';
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
  /** Capture the tab; resolves to the new screenshot, or null when none was added. */
  take: () => Promise<PendingEvidence | null>;
  remove: (id: string) => void;
  /** Note where a screenshot was uploaded, so a retry does not upload it again. */
  replace: (item: PendingEvidence) => void;
  /** Put a screenshot's new edits in place, or take them all off with null. */
  edit: (id: string, edited: EditedScreenshot | null) => void;
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
          return null;
        }
        setHeldFor(null);
        const item = await captureScreenshot(tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT);
        setByKey((lists) => ({ ...lists, [key]: [...(lists[key] ?? []), item] }));
        return item;
      } catch (captureError) {
        setFailure({ key, message: `Could not take a screenshot: ${String(captureError)}` });
        return null;
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
    // Only the upload's address is taken, and only while the screenshot is still
    // the one uploaded: an edit made meanwhile is kept and uploaded afresh.
    replace: (next: PendingEvidence) =>
      setByKey((lists) => ({
        ...lists,
        [key]: (lists[key] ?? []).map((item) =>
          item.id === next.id && item.blob === next.blob ? { ...item, uploadedUrl: next.uploadedUrl } : item,
        ),
      })),
    edit: (id: string, edited: EditedScreenshot | null) => {
      // The latest list: an edit comes back from its window long after the click.
      const item = (current.current[key] ?? []).find((candidate) => candidate.id === id);
      if (item === undefined) return;
      const next = withEdits(item, edited);
      URL.revokeObjectURL(item.previewUrl);
      setByKey((lists) => ({
        ...lists,
        [key]: (lists[key] ?? []).map((candidate) => (candidate.id === id ? next : candidate)),
      }));
    },
  });

  return { list };
}

export function useScreenshots(pageUrl?: string | null): ScreenshotList {
  return useScreenshotLists(pageUrl).list('form');
}

/**
 * Uploaded screenshots stay in the list, so sending again after a refusal reuses them.
 * Nothing is sent while a screenshot is open in the editor: it would go unedited.
 */
export async function uploadScreenshots(
  screenshots: ScreenshotList,
  type: 'submission' | 'correction' | 'functionality_report',
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  if (isEditorOpen()) {
    focusEditorWindow();
    return { ok: false, message: 'Save or cancel the screenshot open in the editor first.' };
  }
  const urls: string[] = [];
  for (const item of screenshots.items) {
    const result = await uploadPendingEvidence(item, type);
    if (!result.ok) return { ok: false, message: `A screenshot could not be uploaded: ${result.error.message}` };
    if (item.uploadedUrl === undefined) screenshots.replace(result.data);
    urls.push(result.data.uploadedUrl as string);
  }
  return { ok: true, urls };
}

/** Whether any screenshot editor window is open, following it as it opens and closes. */
function useEditorOpen(): boolean {
  return useSyncExternalStore(watchEditor, isEditorOpen);
}

/**
 * A form's screenshots. Each new one opens in the editor. `locked` holds the
 * list still while the form is sending, so what is sent is what is shown.
 */
export function ScreenshotField(props: {
  screenshots: ScreenshotList;
  label?: string;
  hint?: string;
  max?: number;
  locked?: boolean;
}) {
  const { items, error, take, remove, edit } = props.screenshots;
  const locked = props.locked ?? false;
  const full = items.length >= (props.max ?? 10);
  const editorOpen = useEditorOpen();
  // Where a screenshot is being edited: its own window, or the panel when no window can open.
  const [editing, setEditing] = useState<{ item: PendingEvidence; label: string; where: 'window' | 'panel' } | null>(
    null,
  );
  const inWindow = editing?.where === 'window';

  // The form going away takes its editor window with it.
  const ownsWindow = useRef(false);
  useEffect(() => {
    ownsWindow.current = inWindow;
  }, [inWindow]);
  useEffect(
    () => () => {
      if (ownsWindow.current) closeEditorWindow();
    },
    [],
  );

  const openEditor = async (item: PendingEvidence, label: string) => {
    // One editor at a time: with one open, it comes to the front instead.
    if (isEditorOpen()) {
      focusEditorWindow();
      return;
    }
    setEditing({ item, label, where: 'window' });
    try {
      const outcome = await editInWindow({ source: item.original ?? item.blob, edits: item.edits, label });
      if (outcome !== undefined) edit(item.id, outcome);
      setEditing((open) => (open?.item.id === item.id && open.where === 'window' ? null : open));
    } catch (openError) {
      if (openError instanceof EditorBusyError) {
        focusEditorWindow();
        setEditing(null);
      } else {
        setEditing({ item, label, where: 'panel' });
      }
    }
  };

  // Every new screenshot opens straight in the editor, so hiding what is private is the natural next step.
  const capture = async () => {
    const item = await take();
    if (item !== null) await openEditor(item, `evidence #${items.length + 1}`);
  };

  const discard = (id: string) => {
    if (editing?.item.id === id) {
      if (editing.where === 'window') closeEditorWindow();
      setEditing(null);
    }
    remove(id);
  };

  const status = inWindow
    ? `Editing ${editing.label} in its own window.`
    : editorOpen
      ? 'Finish the screenshot open in the editor first.'
      : items.length > 0
        ? 'Click a screenshot to crop it or hide personal details.'
        : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {props.label !== undefined && <span className="us-label">{props.label}</span>}
      <EvidenceThumbs
        evidence={items}
        editingId={inWindow ? editing.item.id : null}
        onRemove={locked ? undefined : discard}
        onEdit={locked ? undefined : (item, label) => void openEditor(item, label)}
      />
      {status !== null && (
        <p style={hintStyle} aria-live="polite">
          {status}
        </p>
      )}
      {editing?.where === 'panel' && (
        <ScreenshotEditor
          key={editing.item.id}
          source={editing.item.original ?? editing.item.blob}
          edits={editing.item.edits}
          label={editing.label}
          onCancel={() => setEditing(null)}
          onSave={(edited: EditedScreenshot | null) => {
            edit(editing.item.id, edited);
            setEditing(null);
          }}
        />
      )}
      <Button
        variant="surface"
        size="sm"
        onClick={() => void capture()}
        disabled={full || locked || editorOpen}
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
    // A form stays open under Settings, so an email saved there fills it in.
    return watchSavedEmail(setEmail);
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
