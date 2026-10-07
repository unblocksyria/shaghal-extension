import { formErrorMessage, type ApiError } from '../../../lib/api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EVIDENCE_ACCEPT,
  captureScreenshot,
  fromFile,
  uploadPendingEvidence,
  withEdits,
  type PendingEvidence,
} from '../../../lib/evidence';
import { directionOf, activeLanguage, i18next } from '../../../lib/i18n';
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
import { ArrowLeft, ArrowRight, Camera, Check, Upload } from 'lucide-react';

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
  /** A restored draft counts as unsaved work, so Back and unload still ask before it goes. */
  restored?: boolean;
  /** Runs when the tester confirms they want the stored draft gone. */
  onDiscardDraft?: () => void;
  /** Fires the first time the tester changes anything, so the draft can be kept. */
  onTouched?: () => void;
}) {
  const trackDraft = props.trackDraft !== false;
  const [changed, setChanged] = useState(false);
  // Restored work never fires a change event, so it counts as work too.
  const dirty = props.restored === true || changed;
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
  // Back points left in LTR and right in RTL.
  const Back = directionOf(activeLanguage()) === 'rtl' ? ArrowRight : ArrowLeft;
  const { t } = useTranslation();
  // Anything the tester changes counts as work, both for the guard and for the draft.
  const touch = () => {
    if (!trackDraft) return;
    setChanged(true);
    props.onTouched?.();
  };
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
        <Back size={14} /> {props.backLabel}
      </button>
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={titleStyle}>{props.title}</h1>
        <p style={{ ...hintStyle, fontSize: 13 }}>{props.intro}</p>
      </div>
      <fieldset
        onChangeCapture={touch}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('button')) touch();
        }}
        // A dropped file adds work without a change event, so it counts as touched.
        onDropCapture={(event) => {
          if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) touch();
        }}
        disabled={props.busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 18 }}
      >
        {props.children}
      </fieldset>
      {trackDraft && <p style={hintStyle}>{t('form.stayOpen')}</p>}
      {confirming && (
        <dialog
          ref={discard}
          aria-labelledby="discard-draft-title"
          onCancel={() => setConfirming(false)}
          style={{ ...cardStyle, color: 'var(--us-text-primary)', maxWidth: 300 }}
        >
          <h2 id="discard-draft-title" style={titleStyle}>
            {t('form.discardTitle')}
          </h2>
          <p style={hintStyle}>{t('form.discardText')}</p>
          <Button onClick={() => setConfirming(false)} autoFocus>
            {t('form.keepEditing')}
          </Button>
          <Button
            onClick={() => {
              props.onDiscardDraft?.();
              props.onBack();
            }}
          >
            {t('form.discardDraft')}
          </Button>
        </dialog>
      )}
    </section>
  );
}

// Shared across forms. Together with isEditorOpen(), these block new captures
// and uploads while a capture or an inline editor is in progress.
let pendingCaptures = 0;
const inlineEditors = new Set<symbol>();

export interface ScreenshotList {
  items: PendingEvidence[];
  error: string | null;
  /** Captures the active tab. Resolves to the new screenshot, or null if none was added. */
  take: () => Promise<PendingEvidence | null>;
  /** Adds files picked from disk or dropped on the form. Resolves to what was added, in order. */
  add: (files: File[], room: number) => PendingEvidence[];
  remove: (id: string) => void;
  /** Records a screenshot's upload URL so a retry does not upload it again. */
  replace: (item: PendingEvidence) => void;
  /** Applies new edits to a screenshot. `null` removes all edits. */
  edit: (id: string, edited: EditedScreenshot | null) => void;
  clear: () => void;
}

/** The list key the forms with a single screenshot list use. */
export const SINGLE_LIST_KEY = 'form';

/**
 * Screenshot lists by key, e.g. one per report part.
 *
 * With `pageUrl`, capturing a different site needs a second press. The panel
 * stays open across tabs, so a capture can hit the wrong site, but services
 * also route through other sites (sign-in, payment) on purpose.
 */
export function useScreenshotLists(pageUrl?: string | null): {
  list: (key: string) => ScreenshotList;
  /** Every list as it stands, for reading into a draft. */
  entries: () => Record<string, PendingEvidence[]>;
  /** Puts a restored draft's screenshots back, freeing the previews it replaces. */
  restore: (next: Record<string, PendingEvidence[]>) => void;
} {
  const { t } = useTranslation();
  const [byKey, setByKey] = useState<Record<string, PendingEvidence[]>>({});
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // `${key} ${site}` of the last held-back capture. A second press for it captures.
  const [heldFor, setHeldFor] = useState<string | null>(null);

  // Previews are object URLs, so revoke them all on unmount.
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
            message: t('form.wrongTab', {
              site: site === '' ? t('form.anotherPage') : site,
              expected,
            }),
          });
          return null;
        }
        setHeldFor(null);
        const item = await captureScreenshot(tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT);
        const [after] = await chrome.tabs.query({ active: true, windowId: tab?.windowId });
        if (!mounted.current || after?.id !== tab?.id || after?.url !== tab?.url) {
          URL.revokeObjectURL(item.previewUrl);
          if (mounted.current) setFailure({ key, message: t('form.tabChanged') });
          return null;
        }
        setByKey((lists) => ({ ...lists, [key]: [...(lists[key] ?? []), item] }));
        return item;
      } catch (captureError) {
        setFailure({
          key,
          message: t('form.captureFailed', {
            error: captureError instanceof Error ? captureError.message : String(captureError),
          }),
        });
        return null;
      } finally {
        pendingCaptures -= 1;
      }
    },
    add: (files: File[], room: number) => {
      if (files.length === 0) return [];
      const added: PendingEvidence[] = [];
      let message: string | null = null;
      for (const file of files) {
        if (added.length >= room) {
          message = i18next.t('form.listFull');
          break;
        }
        try {
          added.push(fromFile(file));
        } catch (pickError) {
          if (message === null) message = pickError instanceof Error ? pickError.message : String(pickError);
        }
      }
      setFailure(message === null ? null : { key, message });
      if (added.length > 0) setByKey((lists) => ({ ...lists, [key]: [...(lists[key] ?? []), ...added] }));
      return added;
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
    // Copies only the upload URL, and only if the blob is unchanged. An edit made
    // during the upload is kept and uploaded on the next send.
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
      // Read the latest list. The edit returns from its window long after the click.
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

  const entries = (): Record<string, PendingEvidence[]> => byKey;

  const restore = (next: Record<string, PendingEvidence[]>): void => {
    const kept = new Set(
      Object.values(next)
        .flat()
        .map((item) => item.id),
    );
    for (const items of Object.values(byKey))
      for (const item of items) if (!kept.has(item.id)) URL.revokeObjectURL(item.previewUrl);
    setByKey(next);
  };

  return { list, entries, restore };
}

/** The forms with one screenshot list. `restore` puts a draft's list back in one go. */
export function useScreenshots(pageUrl?: string | null): ScreenshotList & {
  restore: (next: Record<string, PendingEvidence[]>) => void;
} {
  const lists = useScreenshotLists(pageUrl);
  return { ...lists.list(SINGLE_LIST_KEY), restore: lists.restore };
}

/**
 * Upload URLs are kept in the list, so a resend after a refusal reuses them.
 * Refuses while a capture or editor is open, since that screenshot would go unedited.
 */
export async function uploadScreenshots(
  screenshots: ScreenshotList,
  type: 'submission' | 'correction' | 'functionality_report',
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  if (pendingCaptures > 0 || inlineEditors.size > 0) {
    return { ok: false, message: i18next.t('form.finishCapturing') };
  }
  if (isEditorOpen()) {
    focusEditorWindow();
    return { ok: false, message: i18next.t('form.editorOpen') };
  }
  const urls: string[] = [];
  for (const item of screenshots.items) {
    const result = await uploadPendingEvidence(item, type);
    if (!result.ok)
      return { ok: false, message: i18next.t('form.uploadFailed', { message: formErrorMessage(result.error) }) };
    if (result.data !== item) screenshots.replace(result.data);
    urls.push(result.data.uploadedUrl as string);
  }
  return { ok: true, urls };
}

/** Whether the editor window is open. Re-renders when it opens or closes. */
function useEditorOpen(): boolean {
  return useSyncExternalStore(watchEditor, isEditorOpen);
}

/**
 * A form's screenshot list, from a capture, a picked file or a dropped one.
 * Each new image opens in the editor. `locked` freezes the list while sending,
 * so what is sent matches what is shown.
 */
export function ScreenshotField(props: {
  screenshots: ScreenshotList;
  label?: string;
  hint?: string;
  max?: number;
  locked?: boolean;
}) {
  const { t } = useTranslation();
  const { items, error, take, add, remove, edit } = props.screenshots;
  const locked = props.locked ?? false;
  const max = props.max ?? 10;
  const full = items.length >= max;
  const editorOpen = useEditorOpen();
  // The screenshot being edited and where. 'panel' is the fallback when no window can open.
  const [editing, setEditing] = useState<{ item: PendingEvidence; label: string; where: 'window' | 'panel' } | null>(
    null,
  );
  const [capturing, setCapturing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // How many file drags are over the field, so passing over a child keeps it lit.
  const dragDepth = useRef(0);
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
  // Resolves the openEditor that fell back to the panel editor, once it closes.
  const settleInline = useRef<(() => void) | null>(null);

  const closeInlineEditor = () => {
    inlineEditors.delete(inlineId.current);
    setEditing(null);
    const settle = settleInline.current;
    settleInline.current = null;
    settle?.();
  };

  // Close this form's editor window on unmount.
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
    // Only one editor at a time. If a window editor is open, focus it instead.
    if (isEditorOpen()) {
      focusEditorWindow();
      return;
    }
    if (editing !== null) return;
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
        // No window would open, so edit in the panel and hold whoever opened
        // this until the editor closes, so a queue of files opens in turn.
        inlineEditors.add(inlineId.current);
        setEditing({ item, label, where: 'panel' });
        await new Promise<void>((resolve) => {
          settleInline.current = resolve;
        });
      }
    }
  };

  // Open each capture in the editor right away so private details can be hidden.
  const capture = async () => {
    if (capturing || picking || locked || full) return;
    setCapturing(true);
    try {
      const item = await take();
      if (item !== null && alive.current) await openEditor(item, t('evidence.item', { n: items.length + 1 }));
    } finally {
      setCapturing(false);
    }
  };

  /**
   * Picked and dropped files land in the list like a capture does, then open in
   * the editor one at a time so the tester can crop them and hide details.
   */
  const pick = (files: File[]) => {
    if (locked || full || editorOpen || capturing || picking || editing !== null || files.length === 0) return;
    const added = add(files, max - items.length);
    if (added.length === 0) return;
    setRefusal(null);
    setPicking(true);
    void (async () => {
      try {
        for (const [index, item] of added.entries()) {
          if (!alive.current) return;
          await openEditor(item, t('evidence.item', { n: items.length + index + 1 }));
        }
      } finally {
        if (alive.current) setPicking(false);
      }
    })();
  };

  const overFiles = (event: React.DragEvent) =>
    !locked && Array.from(event.dataTransfer?.types ?? []).includes('Files');

  // Why a drop is refused right now, or null while it can come in.
  const dropRefusal = (): string | null => {
    if (editorOpen) return t('form.finishEditorFirst');
    if (capturing || picking || editing !== null) return t('form.finishCapturing');
    if (full) return t('form.listFull');
    return null;
  };

  const discard = (id: string) => {
    if (editing?.item.id === id) {
      if (editing.where === 'window') closeEditorWindow();
      closeInlineEditor();
    }
    remove(id);
  };

  const status = inWindow
    ? t('form.editingWindow', { label: editing.label })
    : editorOpen
      ? t('form.finishEditorFirst')
      : items.length > 0
        ? t('form.cropHint')
        : null;

  const busy = full || locked || editorOpen || capturing || picking || editing !== null;

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        // The dashed edge is always there, so nothing moves when a file arrives.
        border: '2px dashed',
        borderColor: dropping ? 'var(--us-border-hover)' : 'transparent',
        borderRadius: 'var(--us-radius-control)',
        backgroundColor: dropping ? 'var(--us-hover-tint)' : undefined,
        padding: 4,
      }}
      onDragEnter={(event) => {
        if (!overFiles(event)) return;
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(event) => {
        if (overFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(event) => {
        dragDepth.current = 0;
        setDropping(false);
        if (!overFiles(event)) return;
        event.preventDefault();
        const refusal = dropRefusal();
        setRefusal(refusal);
        if (refusal !== null) return;
        pick(Array.from(event.dataTransfer?.files ?? []));
      }}
    >
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
          onCancel={closeInlineEditor}
          onSave={(edited: EditedScreenshot | null) => {
            edit(editing.item.id, edited);
            closeInlineEditor();
          }}
        />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="surface" size="sm" onClick={() => void capture()} disabled={busy} icon={<Camera size={13} />}>
          {capturing && editing === null
            ? t('form.capturing')
            : items.length === 0
              ? t('form.addScreenshot')
              : t('form.addAnother')}
        </Button>
        <Button
          variant="surface"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          icon={<Upload size={13} />}
        >
          {t('form.uploadImages')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={EVIDENCE_ACCEPT}
          multiple
          aria-label={t('form.uploadImages')}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Let the same file be chosen again after it was taken out.
            event.target.value = '';
            pick(files);
          }}
        />
      </div>
      <p style={hintStyle}>{t('form.dropHint')}</p>
      {props.hint !== undefined && <p style={hintStyle}>{props.hint}</p>}
      {error !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{error}</p>}
      {error === null && refusal !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{refusal}</p>}
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
    // Forms stay mounted under Settings, so pick up an email saved there.
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
  const { t } = useTranslation();
  return (
    <Input
      label={t('common.yourEmail')}
      type="email"
      maxLength={254}
      placeholder={t('common.emailPlaceholder')}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      helperText={t('form.emailHelp')}
    />
  );
}

export function FormFooter(props: {
  label: string;
  busyLabel: string;
  busy: boolean;
  /** Why the form can't be sent yet, or null if it can. */
  blocker: string | null;
  note: string;
  error: string | null;
  /** Shown with the error when an earlier send could not be confirmed. */
  onDiscard?: (() => void) | null;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {props.error !== null && (
        <p style={{ ...hintStyle, color: 'var(--us-danger)', fontSize: 13 }} role="alert">
          {props.error}
        </p>
      )}
      {props.onDiscard != null && (
        <Button size="md" fullWidth disabled={props.busy} onClick={props.onDiscard}>
          {t('receipts.discard')}
        </Button>
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

/**
 * A form's error line. `showApiError` also offers to discard an earlier send the
 * API could not confirm; discarding risks a duplicate if that send did arrive.
 */
export function useFormError() {
  const [error, setMessage] = useState<string | null>(null);
  const [discard, setDiscard] = useState<(() => Promise<void>) | null>(null);
  const setError = (message: string | null) => {
    setMessage(message);
    setDiscard(null);
  };
  const showApiError = (apiError: ApiError) => {
    setMessage(formErrorMessage(apiError));
    setDiscard(apiError.discard === undefined ? null : () => apiError.discard!);
  };
  const onDiscard =
    discard === null
      ? null
      : () => {
          setDiscard(null);
          discard().then(
            () => setMessage(i18next.t('receipts.discarded')),
            () => setMessage(i18next.t('receipts.storageFailed')),
          );
        };
  return { error, setError, showApiError, onDiscard };
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
    : i18next.t('form.emailInvalid');
}
