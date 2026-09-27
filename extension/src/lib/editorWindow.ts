import type { EditedScreenshot, ImageEdits } from './imageEdits';

/**
 * The screenshot editor opens in a window of its own, laid over the whole
 * browser window, because the side panel is too narrow to hide small text
 * precisely. The panel and that window talk over a BroadcastChannel, which
 * carries the screenshot itself: nothing is stored on the way.
 *
 *   editor → panel  ready     (the window has loaded; repeated until answered)
 *   panel → editor  open      (the screenshot and its edits)
 *   editor → panel  saved | cancelled
 *   panel → editor  dismiss   (the panel let the screenshot go; the window closes itself)
 *
 * The panel closes the window once it has the answer, so the answer is never
 * lost to a window closing mid-message. A dismissed window closes itself,
 * since only it can lift its own warning about unsaved edits, and the panel
 * counts it as open until Chrome says it is gone.
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

/** What an edit ended with: new edits, all edits taken off (null), or nothing changed (undefined). */
export type EditOutcome = EditedScreenshot | null | undefined;

/** Thrown when an editor is already open: there is only ever one, so no edits are dropped unseen. */
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

/** Be told when an editor window opens or closes; returns the way to stop. */
export function watchEditor(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** How long a dismissed editor window has to close itself before it is closed for it. */
const DISMISS_GRACE_MS = 1000;

/** The browser window's bounds, which the editor window takes to cover it. */
async function browserBounds(): Promise<chrome.windows.CreateData> {
  try {
    const { left, top, width, height } = await chrome.windows.getCurrent();
    return { left, top, width, height };
  } catch {
    return { width: 1200, height: 800 };
  }
}

/**
 * Open the editor window for one screenshot. Resolves when it is saved or
 * cancelled, or when its window is closed. Rejects with EditorBusyError while
 * another editor is open, and with the browser's error when no window can
 * open, so the caller can edit inside the panel instead.
 */
export function editInWindow(request: EditRequest): Promise<EditOutcome> {
  if (current !== null) return Promise.reject(new EditorBusyError());

  // Everything is in place before anything waits: a second call made in the
  // meantime sees this editor, and the window's first "ready" finds a listener.
  const session = crypto.randomUUID();
  const channel = new BroadcastChannel(CHANNEL);
  let settle: (outcome: EditOutcome) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const outcome = new Promise<EditOutcome>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // Settled: the caller has its outcome. Released: this editor is no longer
  // tracked, which waits until its window is really gone.
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
  /** The editor answered: take its answer and close its window. */
  const finish = (result: EditOutcome) => {
    settleOnce(result);
    release();
    if (self.windowId !== undefined) void chrome.windows.remove(self.windowId).catch(() => undefined);
  };
  /**
   * The panel lets the screenshot go. The window may hold unsaved edits and a
   * warning against closing, so it is asked to close itself, with a forced
   * close as a fallback; it stays tracked until it is gone.
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
      // Chrome refuses bounds it thinks are mostly off screen; then it picks its own.
      .catch(() => chrome.windows.create(editorPage));
    if (created?.id === undefined) throw new Error('The editor window did not open.');
    self.windowId = created.id;
    // Dismissed while its window was opening, as when its screenshot was removed.
    if (released) void chrome.windows.remove(created.id).catch(() => undefined);
  };
  open().catch((error: unknown) => {
    if (released) return;
    release();
    fail(error);
  });
  return outcome;
}

/** Close the open editor window without taking its edits, as when its screenshot is removed. */
export function closeEditorWindow(): void {
  current?.dismiss();
}

/** Bring the open editor window to the front, if there is one. */
export function focusEditorWindow(): boolean {
  if (current === null) return false;
  if (current.windowId !== undefined)
    void chrome.windows.update(current.windowId, { focused: true }).catch(() => undefined);
  return true;
}

/** How often the editor window repeats "ready" until the panel answers. */
const READY_EVERY_MS = 300;

/** The editor window's side: ask the panel for its screenshot, and answer it. */
export function connectToPanel(
  session: string,
  onOpen: (request: EditRequest) => void,
  onDismiss: () => void = () => undefined,
): { save: (edited: EditedScreenshot | null) => void; cancel: () => void; close: () => void } {
  const channel = new BroadcastChannel(CHANNEL);
  const ready = () => channel.postMessage({ type: 'ready', session } satisfies EditorMessage);
  const asking = setInterval(ready, READY_EVERY_MS);
  // Taken once: a repeated "ready" can be answered twice, and a second screenshot
  // would reopen the image under edits already made.
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

  // The panel closes this window; closing it here too covers a panel that has gone away.
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
