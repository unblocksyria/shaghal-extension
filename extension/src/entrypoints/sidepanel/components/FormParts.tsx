import { formErrorMessage } from '../../../lib/api';
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
  busy?: boolean;
  trackDraft?: boolean;
}) {
  const trackDraft = props.trackDraft !== false;
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const discard = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirming) {
      if (typeof discard.current?.showModal === 'function') discard.current.showModal();
      else discard.current?.setAttribute('open', '');
    }
  }, [confirming]);
  useEffect(() => {
    if (!trackDraft || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, trackDraft]);
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <button
        type="button"
        onClick={() => (trackDraft && dirty ? setConfirming(true) : props.onBack())}
        disabled={props.busy}
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
      <fieldset
        onChangeCapture={() => trackDraft && setDirty(true)}
        onClickCapture={(event) => {
          if (trackDraft && (event.target as HTMLElement).closest('button')) setDirty(true);
        }}
        disabled={props.busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 18 }}
      >
        {props.children}
      </fieldset>
      {trackDraft && <p style={hintStyle}>Keep this panel open until you finish. Unsent drafts stay here only.</p>}
      {confirming && (
        <dialog
          ref={discard}
          aria-labelledby="discard-draft-title"
          onCancel={() => setConfirming(false)}
          style={{ ...cardStyle, color: 'var(--us-text-primary)', maxWidth: 300 }}
        >
          <h2 id="discard-draft-title" style={titleStyle}>
            Discard this draft?
          </h2>
          <p style={hintStyle}>Your unsent text and screenshots will be removed from this panel.</p>
          <Button onClick={() => setConfirming(false)} autoFocus>
            Keep editing
          </Button>
          <Button onClick={props.onBack}>Discard draft</Button>
        </dialog>
      )}
    </section>
  );
}

// Covers capture and the inline fallback editor as well as the separate window.
let pendingCaptures = 0;
const inlineEditors = new Set<symbol>();

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

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const expected = siteOf(pageUrl);

  const list = (key: string): ScreenshotList => ({
    items: byKey[key] ?? [],
    error: failure?.key === key ? failure.message : null,
    take: async () => {
      if (pendingCaptures > 0 || isEditorOpen() || inlineEditors.size > 0) return null;
      pendingCaptures += 1;
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
        const [after] = await chrome.tabs.query({ active: true, windowId: tab?.windowId });
        if (!mounted.current || after?.id !== tab?.id || after?.url !== tab?.url) {
          URL.revokeObjectURL(item.previewUrl);
          if (mounted.current)
            setFailure({ key, message: 'The tab changed during capture. Take the screenshot again.' });
          return null;
        }
        setByKey((lists) => ({ ...lists, [key]: [...(lists[key] ?? []), item] }));
        return item;
      } catch (captureError) {
        setFailure({ key, message: `Could not take a screenshot: ${String(captureError)}` });
        return null;
      } finally {
        pendingCaptures -= 1;
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
          item.id === next.id && item.blob === next.blob
            ? { ...item, uploadedUrl: next.uploadedUrl, uploadedAt: next.uploadedAt }
            : item,
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
  if (pendingCaptures > 0 || inlineEditors.size > 0) {
    return { ok: false, message: 'Finish capturing or editing your screenshot first.' };
  }
  if (isEditorOpen()) {
    focusEditorWindow();
    return { ok: false, message: 'Save or cancel the screenshot open in the editor first.' };
  }
  const urls: string[] = [];
  for (const item of screenshots.items) {
    const result = await uploadPendingEvidence(item, type);
    if (!result.ok)
      return { ok: false, message: `A screenshot could not be uploaded: ${formErrorMessage(result.error)}` };
    if (result.data !== item) screenshots.replace(result.data);
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
  const [capturing, setCapturing] = useState(false);
  const alive = useRef(true);
  const inlineId = useRef(Symbol());
  useEffect(() => {
    alive.current = true;
    const id = inlineId.current;
    return () => {
      alive.current = false;
      inlineEditors.delete(id);
    };
  }, []);
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
      } else if (alive.current) {
        inlineEditors.add(inlineId.current);
        setEditing({ item, label, where: 'panel' });
      }
    }
  };

  // Every new screenshot opens straight in the editor, so hiding what is private is the natural next step.
  const capture = async () => {
    if (capturing || locked || full) return;
    setCapturing(true);
    try {
      const item = await take();
      if (item !== null && alive.current) await openEditor(item, `evidence #${items.length + 1}`);
    } finally {
      setCapturing(false);
    }
  };

  const discard = (id: string) => {
    if (editing?.item.id === id) {
      if (editing.where === 'window') closeEditorWindow();
      inlineEditors.delete(inlineId.current);
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
          onCancel={() => {
            inlineEditors.delete(inlineId.current);
            setEditing(null);
          }}
          onSave={(edited: EditedScreenshot | null) => {
            inlineEditors.delete(inlineId.current);
            edit(editing.item.id, edited);
            setEditing(null);
          }}
        />
      )}
      <Button
        variant="surface"
        size="sm"
        onClick={() => void capture()}
        disabled={full || locked || editorOpen || capturing || editing !== null}
        icon={<Camera size={13} />}
        style={{ justifySelf: 'start' }}
      >
        {capturing && editing === null
          ? 'Capturing…'
          : items.length === 0
            ? 'Add screenshot'
            : 'Add another screenshot'}
      </Button>
      {props.hint !== undefined && <p style={hintStyle}>{props.hint}</p>}
      {error !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{error}</p>}
    </div>
  );
}

export function useSavedEmail(): [string, (value: string) => void] {
  const [email, setEmail] = useState('');
  const changed = useRef(false);
  useEffect(() => {
    let active = true;
    void getSavedEmail().then((value) => {
      if (active && !changed.current) setEmail(value);
    });
    // A form stays open under Settings, so an email saved there fills it in.
    const stop = watchSavedEmail(setEmail);
    return () => {
      active = false;
      stop();
    };
  }, []);
  return [
    email,
    (value) => {
      changed.current = true;
      setEmail(value);
    },
  ];
}

export function EmailField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      label="Your email"
      type="email"
      maxLength={254}
      placeholder="your@email.com"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      helperText="Optional. Never shown publicly. Remembered in this browser after you send."
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

/** Validate before uploading screenshots or spending a verification token. */
export function emailError(email: string): string | null {
  const value = email.trim();
  return value === '' || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    ? null
    : 'Enter a valid email address, or leave it blank.';
}
