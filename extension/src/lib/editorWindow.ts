import type { EditedScreenshot, ImageEdits } from './imageEdits';

/**
 * The screenshot editor runs in its own window over the browser window, since
 * the side panel is too narrow to hide small text precisely. Panel and editor
 * talk over a BroadcastChannel that carries the screenshot itself, so nothing
 * is stored.
 *
 *   editor → panel  ready     (loaded; repeated until answered)
 *   panel → editor  open      (the screenshot and its edits)
 *   editor → panel  saved | cancelled
 *   panel → editor  dismiss   (screenshot removed; the window closes itself)
 *
 * The panel closes the window after receiving the answer, so a closing window
 * cannot cut a message short. A dismissed window closes itself, because only it
 * can clear its own unsaved-edits warning. The panel treats it as open until
 * chrome.windows.onRemoved fires.
 */
const CHANNEL = 'shaghal-screenshot-editor';

export interface EditRequest {
  source: Blob;
  edits?: ImageEdits;
  label: string;
}

type EditorMessage =
  | { type: 'ready'; session: string }
  | ({ type: 'open'; session: string } & EditRequest)
  | { type: 'saved'; session: string; edited: EditedScreenshot | null }
  | { type: 'cancelled'; session: string }
  | { type: 'dismiss'; session: string };

/** New edits, null when all edits were removed, or undefined when nothing changed. */
export type EditOutcome = EditedScreenshot | null | undefined;

/** Only one editor may be open, so edits in an open one are never discarded unseen. */
export class EditorBusyError extends Error {
  constructor() {
    super('A screenshot is already open in the editor.');
    this.name = 'EditorBusyError';
  }
}

interface OpenEditor {
  /** Unset while the window is still opening. */
  windowId?: number;
  dismiss: () => void;
}

let current: OpenEditor | null = null;
const watchers = new Set<() => void>();

function setCurrent(next: OpenEditor | null): void {
  current = next;
  watchers.forEach((watcher) => watcher());
}

/** Whether an editor window is open, or opening. */
export function isEditorOpen(): boolean {
  return current !== null;
}

/** Calls `watcher` when an editor window opens or closes. Returns an unsubscribe function. */
export function watchEditor(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** How long a dismissed editor gets to close itself before the panel force-closes it. */
const DISMISS_GRACE_MS = 1000;

/** Bounds of the current browser window, for the editor to cover. */
async function browserBounds(): Promise<chrome.windows.CreateData> {
  try {
    const { left, top, width, height } = await chrome.windows.getCurrent();
    return { left, top, width, height };
  } catch {
    return { width: 1200, height: 800 };
  }
}

/**
 * Opens the editor window for one screenshot. Resolves when the edit is saved
 * or cancelled, or the window closes. Rejects with EditorBusyError while another
 * editor is open, or with Chrome's error if no window opens, so the caller can
 * fall back to editing in the panel.
 */
export function editInWindow(request: EditRequest): Promise<EditOutcome> {
  if (current !== null) return Promise.reject(new EditorBusyError());

  // Register before any await, so a concurrent call sees this editor and the
  // window's first "ready" finds a listener.
  const session = crypto.randomUUID();
  const channel = new BroadcastChannel(CHANNEL);
  let settle: (outcome: EditOutcome) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const outcome = new Promise<EditOutcome>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // `settled`: the caller has its outcome. `released`: the editor is no longer
  // tracked, which waits until its window is gone.
  let settled = false;
  let released = false;

  const settleOnce = (result: EditOutcome) => {
    if (settled) return;
    settled = true;
    settle(result);
  };
  const release = () => {
    if (released) return;
    released = true;
    if (current === self) setCurrent(null);
    channel.close();
    chrome.windows.onRemoved.removeListener(onRemoved);
  };
  /** Takes the editor's answer and closes its window. */
  const finish = (result: EditOutcome) => {
    settleOnce(result);
    release();
    if (self.windowId !== undefined) void chrome.windows.remove(self.windowId).catch(() => undefined);
  };
  /**
   * The window may hold unsaved edits behind a close warning, so ask it to
   * close itself and force-close after DISMISS_GRACE_MS. It stays tracked until
   * it is gone.
   */
  const dismiss = () => {
    settleOnce(undefined);
    if (self.windowId === undefined) return release();
    channel.postMessage({ type: 'dismiss', session } satisfies EditorMessage);
    const windowId = self.windowId;
    setTimeout(() => {
      if (!released) void chrome.windows.remove(windowId).catch(() => undefined);
    }, DISMISS_GRACE_MS);
  };
  const onRemoved = (removedId: number) => {
    if (removedId !== self.windowId) return;
    settleOnce(undefined);
    release();
  };
  const self: OpenEditor = { dismiss };
  setCurrent(self);
  chrome.windows.onRemoved.addListener(onRemoved);

  channel.onmessage = (event: MessageEvent<EditorMessage>) => {
    const message = event.data;
    if (message.session !== session) return;
    if (message.type === 'ready') {
      channel.postMessage({ type: 'open', session, ...request } satisfies EditorMessage);
    } else if (message.type === 'saved') {
      finish(message.edited);
    } else if (message.type === 'cancelled') {
      finish(undefined);
    }
  };

  const editorPage: chrome.windows.CreateData = {
    url: chrome.runtime.getURL(`/editor.html?session=${session}`),
    type: 'popup',
    focused: true,
  };
  const open = async () => {
    const created = await chrome.windows
      .create({ ...editorPage, ...(await browserBounds()) })
      // Chrome rejects bounds it considers mostly off screen. Retry without them.
      .catch(() => chrome.windows.create(editorPage));
    if (created?.id === undefined) throw new Error('The editor window did not open.');
    self.windowId = created.id;
    // Dismissed while the window was opening.
    if (released) void chrome.windows.remove(created.id).catch(() => undefined);
  };
  open().catch((error: unknown) => {
    if (released) return;
    release();
    fail(error);
  });
  return outcome;
}

/** Dismisses the open editor without taking its edits. */
export function closeEditorWindow(): void {
  current?.dismiss();
}

/** Focuses the open editor window. Returns false if there is none. */
export function focusEditorWindow(): boolean {
  if (current === null) return false;
  if (current.windowId !== undefined)
    void chrome.windows.update(current.windowId, { focused: true }).catch(() => undefined);
  return true;
}

/** How often the editor window repeats "ready" until the panel answers. */
const READY_EVERY_MS = 300;

/** The editor window's end of the channel. Requests the screenshot and sends back the result. */
export function connectToPanel(
  session: string,
  onOpen: (request: EditRequest) => void,
  onDismiss: () => void = () => undefined,
): { save: (edited: EditedScreenshot | null) => void; cancel: () => void; close: () => void } {
  const channel = new BroadcastChannel(CHANNEL);
  const ready = () => channel.postMessage({ type: 'ready', session } satisfies EditorMessage);
  const asking = setInterval(ready, READY_EVERY_MS);
  // Accept only the first "open". Repeated "ready"s can be answered twice, and a
  // second image would replace the one being edited.
  let opened = false;
  channel.onmessage = (event: MessageEvent<EditorMessage>) => {
    const message = event.data;
    if (message.session !== session) return;
    if (message.type === 'dismiss') {
      clearInterval(asking);
      onDismiss();
    } else if (message.type === 'open' && !opened) {
      opened = true;
      clearInterval(asking);
      onOpen({ source: message.source, edits: message.edits, label: message.label });
    }
  };
  ready();

  // The panel normally closes this window. Close it here too in case the panel is gone.
  let closing: ReturnType<typeof setTimeout> | undefined;
  const closeSoon = () => {
    closing ??= setTimeout(() => window.close(), 1500);
  };
  return {
    save: (edited) => {
      channel.postMessage({ type: 'saved', session, edited } satisfies EditorMessage);
      closeSoon();
    },
    cancel: () => {
      channel.postMessage({ type: 'cancelled', session } satisfies EditorMessage);
      closeSoon();
    },
    close: () => {
      clearInterval(asking);
      clearTimeout(closing);
      channel.close();
    },
  };
}
