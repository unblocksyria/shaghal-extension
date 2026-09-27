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
 *
 * The panel closes the window once it has the answer, so the answer is never
 * lost to a window closing mid-message.
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
  | { type: 'cancelled'; session: string };

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
  finish: (outcome: EditOutcome) => void;
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
  let done = false;

  const release = () => {
    done = true;
    if (current === self) setCurrent(null);
    channel.close();
    chrome.windows.onRemoved.removeListener(onRemoved);
  };
  const finish = (result: EditOutcome) => {
    if (done) return;
    release();
    if (self.windowId !== undefined) void chrome.windows.remove(self.windowId).catch(() => undefined);
    settle(result);
  };
  const onRemoved = (removedId: number) => {
    if (removedId === self.windowId) finish(undefined);
  };
  const self: OpenEditor = { finish };
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
    // Closed while its window was opening, as when its screenshot was removed.
    if (done) void chrome.windows.remove(created.id).catch(() => undefined);
  };
  open().catch((error: unknown) => {
    if (done) return;
    release();
    fail(error);
  });
  return outcome;
}

/** Close the open editor window without taking its edits, as when its screenshot is removed. */
export function closeEditorWindow(): void {
  current?.finish(undefined);
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
): { save: (edited: EditedScreenshot | null) => void; cancel: () => void; close: () => void } {
  const channel = new BroadcastChannel(CHANNEL);
  const ready = () => channel.postMessage({ type: 'ready', session } satisfies EditorMessage);
  const asking = setInterval(ready, READY_EVERY_MS);
  // Taken once: a repeated "ready" can be answered twice, and a second screenshot
  // would reopen the image under edits already made.
  let opened = false;
  channel.onmessage = (event: MessageEvent<EditorMessage>) => {
    const message = event.data;
    if (opened || message.session !== session || message.type !== 'open') return;
    opened = true;
    clearInterval(asking);
    onOpen({ source: message.source, edits: message.edits, label: message.label });
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
