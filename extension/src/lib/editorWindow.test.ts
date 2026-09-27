import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorBusyError,
  closeEditorWindow,
  connectToPanel,
  editInWindow,
  focusEditorWindow,
  isEditorOpen,
  watchEditor,
  type EditRequest,
} from './editorWindow';
import type { ImageEdits } from './imageEdits';

// The real BroadcastChannel carries the messages, Blobs included, as it does
// between the panel and the editor window. Only chrome.windows is faked.

interface FakeWindows {
  created: chrome.windows.CreateData[];
  removed: number[];
  focused: number[];
  /** The user closing a window with its own button. */
  closeByUser: (id: number) => void;
}

function fakeChrome(
  options: { refuseBounds?: boolean; refuseAll?: boolean; slowCreate?: Promise<void> } = {},
): FakeWindows {
  const listeners = new Set<(id: number) => void>();
  const windows: FakeWindows = {
    created: [],
    removed: [],
    focused: [],
    closeByUser: (id) => listeners.forEach((listener) => listener(id)),
  };
  let nextId = 100;
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://shaghal${path}` },
    windows: {
      getCurrent: () => Promise.resolve({ left: 10, top: 20, width: 1400, height: 900 }),
      create: async (data: chrome.windows.CreateData) => {
        await options.slowCreate;
        if (options.refuseAll === true) throw new Error('No windows here');
        if (options.refuseBounds === true && data.left !== undefined) throw new Error('Invalid value for bounds.');
        windows.created.push(data);
        return { id: nextId++ };
      },
      remove: (id: number) => {
        windows.removed.push(id);
        listeners.forEach((listener) => listener(id));
        return Promise.resolve();
      },
      update: (id: number) => {
        windows.focused.push(id);
        return Promise.resolve({});
      },
      onRemoved: {
        addListener: (listener: (id: number) => void) => listeners.add(listener),
        removeListener: (listener: (id: number) => void) => listeners.delete(listener),
      },
    },
  });
  return windows;
}

const request: EditRequest = { source: new Blob(['capture']), label: 'evidence #1' };
const edits: ImageEdits = { crop: { x: 0, y: 0, width: 10, height: 10 }, boxes: [] };

function sessionOf(data: chrome.windows.CreateData | undefined): string {
  const session = new URL(String(data?.url)).searchParams.get('session');
  if (session === null) throw new Error('The editor window was opened without a session');
  return session;
}

/** The editor window's side, as the editor page runs it. */
async function editorFor(windows: FakeWindows, index = 0) {
  await vi.waitFor(() => expect(windows.created[index]).toBeDefined());
  const received: EditRequest[] = [];
  const panel = connectToPanel(sessionOf(windows.created[index]), (opened) => received.push(opened));
  await vi.waitFor(() => expect(received).toHaveLength(1));
  return { panel, received: received[0] as EditRequest };
}

afterEach(() => {
  closeEditorWindow();
});

describe('the editor window', () => {
  it('covers the browser window, gets the screenshot and returns the edits', async () => {
    vi.stubGlobal('window', { close: () => undefined });
    const windows = fakeChrome();
    const result = editInWindow(request);

    const { panel, received } = await editorFor(windows);
    expect(windows.created[0]).toMatchObject({ type: 'popup', focused: true, left: 10, top: 20, width: 1400 });
    expect(windows.created[0]?.url).toMatch(/^chrome-extension:\/\/shaghal\/editor\.html\?session=/);
    expect(await received.source.text()).toBe('capture');
    expect(received.label).toBe('evidence #1');

    panel.save({ blob: new Blob(['edited']), edits });
    const outcome = await result;
    expect(await outcome?.blob.text()).toBe('edited');
    expect(outcome?.edits).toEqual(edits);
    // The panel closes the window once it has the answer.
    expect(windows.removed).toEqual([100]);
    panel.close();
  });

  it('hands over earlier edits so they can be changed', async () => {
    vi.stubGlobal('window', { close: () => undefined });
    const windows = fakeChrome();
    const result = editInWindow({ ...request, edits });

    const { panel, received } = await editorFor(windows);
    expect(received.edits).toEqual(edits);
    panel.save(null);
    expect(await result).toBeNull();
    panel.close();
  });

  it('opens where Chrome likes when it refuses the browser window’s bounds', async () => {
    const windows = fakeChrome({ refuseBounds: true });
    const result = editInWindow(request);
    await vi.waitFor(() => expect(windows.created).toHaveLength(1));
    expect(windows.created[0]?.left).toBeUndefined();
    windows.closeByUser(100);
    expect(await result).toBeUndefined();
  });

  it('fails when no window can open, so the panel can edit in place', async () => {
    fakeChrome({ refuseAll: true });
    await expect(editInWindow(request)).rejects.toThrow('No windows here');
    expect(focusEditorWindow()).toBe(false);
  });

  it('takes Cancel as no change', async () => {
    vi.stubGlobal('window', { close: () => undefined });
    const windows = fakeChrome();
    const result = editInWindow(request);
    const { panel } = await editorFor(windows);

    panel.cancel();
    expect(await result).toBeUndefined();
    expect(windows.removed).toEqual([100]);
    panel.close();
  });

  it('takes the window being closed as no change', async () => {
    const windows = fakeChrome();
    const result = editInWindow(request);
    await vi.waitFor(() => expect(windows.created).toHaveLength(1));

    windows.closeByUser(100);
    expect(await result).toBeUndefined();
  });

  it('keeps one editor at a time: while one is open, another is refused', async () => {
    const windows = fakeChrome();
    const first = editInWindow(request);
    // Refused at once, before the first window has even opened, as a double click would.
    await expect(editInWindow({ ...request, label: 'evidence #2' })).rejects.toBeInstanceOf(EditorBusyError);
    await vi.waitFor(() => expect(windows.created).toHaveLength(1));
    expect(focusEditorWindow()).toBe(true);
    expect(windows.focused).toEqual([100]);

    closeEditorWindow();
    expect(await first).toBeUndefined();
    expect(windows.removed).toEqual([100]);
    expect(focusEditorWindow()).toBe(false);

    const second = editInWindow({ ...request, label: 'evidence #2' });
    await vi.waitFor(() => expect(windows.created).toHaveLength(2));
    closeEditorWindow();
    expect(await second).toBeUndefined();
  });

  it('says when an editor opens and closes', async () => {
    const windows = fakeChrome();
    const seen: boolean[] = [];
    const stop = watchEditor(() => seen.push(isEditorOpen()));

    const result = editInWindow(request);
    expect(isEditorOpen()).toBe(true);
    await vi.waitFor(() => expect(windows.created).toHaveLength(1));
    windows.closeByUser(100);
    await result;
    expect(isEditorOpen()).toBe(false);
    expect(seen).toEqual([true, false]);
    stop();
  });

  it('closes a window that was dismissed while it was still opening', async () => {
    let open: () => void = () => undefined;
    const windows = fakeChrome({ slowCreate: new Promise((resolve) => (open = resolve)) });
    const result = editInWindow(request);

    // Its screenshot was removed before Chrome had opened the window.
    expect(focusEditorWindow()).toBe(true);
    closeEditorWindow();
    expect(await result).toBeUndefined();
    expect(isEditorOpen()).toBe(false);

    open();
    await vi.waitFor(() => expect(windows.removed).toEqual([100]));
  });

  it('lets another editor open once a window fails to', async () => {
    fakeChrome({ refuseAll: true });
    await expect(editInWindow(request)).rejects.toThrow('No windows here');
    expect(isEditorOpen()).toBe(false);
  });

  it('ignores answers meant for another editor', async () => {
    vi.stubGlobal('window', { close: () => undefined });
    const windows = fakeChrome();
    const result = editInWindow(request);
    const { panel } = await editorFor(windows);

    // Another editor cancels, and this one takes its edits off. The panel must
    // hear only its own: null, not the stranger's undefined. (No Blob travels
    // once three channels are open: Node's BroadcastChannel cannot carry one
    // to three listeners, though Chrome can.)
    const stranger = connectToPanel('another-session', () => undefined);
    stranger.cancel();
    panel.save(null);
    expect(await result).toBeNull();
    stranger.close();
    panel.close();
  });

  it('closes its own window when the panel never does', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const close = vi.fn();
    vi.stubGlobal('window', { close });
    const panel = connectToPanel('nobody-listening', () => undefined);

    panel.cancel();
    vi.advanceTimersByTime(1499);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledOnce();
    panel.close();
    vi.useRealTimers();
  });

  it('asks again until the panel answers, and takes the screenshot once', async () => {
    vi.stubGlobal('window', { close: () => undefined });
    const windows = fakeChrome();
    // The editor asks before the panel is listening: its first "ready" goes unheard.
    const received: EditRequest[] = [];
    const editor = connectToPanel('early', (opened) => received.push(opened));
    const panel = new BroadcastChannel('shaghal-screenshot-editor');
    const readies: unknown[] = [];
    panel.onmessage = (event: MessageEvent<{ type: string }>) => {
      if (event.data.type !== 'ready') return;
      readies.push(event.data);
      // Answered twice, as a slow panel answering two "ready"s would.
      if (readies.length === 1) {
        panel.postMessage({ type: 'open', session: 'early', source: null, label: 'evidence #1' });
        panel.postMessage({ type: 'open', session: 'early', source: null, label: 'evidence #9' });
      }
    };
    await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 2000 });
    expect(received[0]?.label).toBe('evidence #1');
    await new Promise((resolve) => setTimeout(resolve, 700));
    // Once answered it stops asking and takes nothing more.
    expect(readies).toHaveLength(1);
    expect(received).toHaveLength(1);
    panel.close();
    editor.close();
    expect(windows.created).toEqual([]);
  });
});
