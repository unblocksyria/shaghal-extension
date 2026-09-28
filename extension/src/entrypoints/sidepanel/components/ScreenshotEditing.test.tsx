/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { act, renderHook, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../../testing/panel';
import { useScreenshotLists } from './FormParts';
import type { EditOutcome, EditRequest } from '../../../lib/editorWindow';
import type { ImageEdits } from '../../../lib/imageEdits';
import type { PendingEvidence } from '../../../lib/evidence';
import matchNone from '../../../testing/fixtures/match-none.json';
import upload from '../../../testing/fixtures/upload.json';

// Fake editor window. The real one is covered in e2e. Each edit waits for the
// test to answer it, and only one editor can be open at a time, as in the real one.
const windows = vi.hoisted(() => {
  const state = {
    requests: [] as EditRequest[],
    answers: [] as ((outcome: EditOutcome) => void)[],
    closed: 0,
    focused: 0,
    unavailable: false,
    /** Refuses the next edit as busy although no editor shows as open: two forms raced for it. */
    refuseOnce: false,
    open: false,
    watchers: new Set<() => void>(),
    setOpen: (open: boolean) => {
      state.open = open;
      state.watchers.forEach((watcher) => watcher());
    },
  };
  return state;
});
vi.mock('../../../lib/editorWindow', () => {
  class EditorBusyError extends Error {}
  return {
    EditorBusyError,
    isEditorOpen: () => windows.open,
    watchEditor: (watcher: () => void) => {
      windows.watchers.add(watcher);
      return () => windows.watchers.delete(watcher);
    },
    editInWindow: (request: EditRequest) => {
      if (windows.unavailable) return Promise.reject(new Error('No windows here'));
      if (windows.open || windows.refuseOnce) {
        windows.refuseOnce = false;
        return Promise.reject(new EditorBusyError());
      }
      windows.requests.push(request);
      windows.setOpen(true);
      return new Promise<EditOutcome>((resolve) =>
        windows.answers.push((outcome) => {
          windows.setOpen(false);
          resolve(outcome);
        }),
      );
    },
    focusEditorWindow: () => {
      windows.focused += 1;
      return windows.open;
    },
    closeEditorWindow: () => {
      windows.closed += 1;
      windows.answers.at(-1)?.(undefined);
    },
  };
});
vi.mock('../../../lib/imageBake', () => ({
  openEditableImage: () =>
    Promise.resolve({ width: 1000, height: 600, url: 'blob:source', bitmap: {}, dispose: () => undefined }),
  bakeEdits: () => Promise.resolve(new Blob(['edited in panel'], { type: 'image/jpeg' })),
}));

const edits: ImageEdits = {
  crop: { x: 0, y: 0, width: 800, height: 600 },
  boxes: [{ id: 'box', x: 10, y: 10, width: 50, height: 20 }],
};

const IDLE_HINT = 'Click a screenshot to crop it or hide personal details.';

async function openForm(user: UserEvent, pageUrl = 'https://edits.example/account'): Promise<FakeApi> {
  windows.requests.length = 0;
  windows.answers.length = 0;
  windows.closed = 0;
  windows.focused = 0;
  windows.unavailable = false;
  windows.refuseOnce = false;
  windows.open = false;
  stubScreenshot();
  const api = fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/uploads/evidence', { json: upload })
    .on('POST', '/submissions', { status: 201, json: { id: 'receipt' } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
  await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Blocked Service');
  return api;
}

/** Opens the form with one screenshot whose editor was closed without changes. */
async function withScreenshot(user: UserEvent): Promise<FakeApi> {
  const api = await openForm(user);
  await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
  await screen.findByText('Editing evidence #1 in its own window.');
  windows.answers[0]?.(undefined);
  await screen.findByText(IDLE_HINT);
  windows.requests.length = 0;
  windows.answers.length = 0;
  return api;
}

/** Submits the form and returns the uploaded screenshot's contents. */
async function sentScreenshot(user: UserEvent, api: FakeApi): Promise<string> {
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await screen.findByRole('heading', { name: 'Report received' });
  const form = api.callsTo('POST', '/uploads/evidence')[0]?.body as FormData;
  return (form.get('file') as Blob).text();
}

describe('editing a screenshot from a form', () => {
  it('opens every new screenshot in the editor straight away', async () => {
    const user = userEvent.setup();
    const api = await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    expect(windows.requests).toHaveLength(1);
    expect(windows.requests[0]?.label).toBe('evidence #1');
    expect(await windows.requests[0]?.source.text()).toBe('hello');
    await screen.findByText('Editing evidence #1 in its own window.');
    expect(screen.getByText('Editing…')).toBeDefined();

    windows.answers[0]?.({ blob: new Blob(['edited']), edits });
    await screen.findByText(IDLE_HINT);
    expect(screen.queryByText('Editing…')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add another screenshot' }));
    expect(windows.requests[1]?.label).toBe('evidence #2');
    windows.answers[1]?.(undefined);
    await screen.findByText(IDLE_HINT);

    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    await screen.findByRole('heading', { name: 'Report received' });
    const files = await Promise.all(
      api.callsTo('POST', '/uploads/evidence').map((call) => ((call.body as FormData).get('file') as Blob).text()),
    );
    expect(files).toEqual(['edited', 'hello']);
  });

  it('opens no editor for a capture held back on another site', async () => {
    const user = userEvent.setup();
    await openForm(user, 'https://forms.example/download');
    await Promise.resolve(fakeBrowser.tabs.create({ url: 'https://elsewhere.example/report', active: true }));

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByText(/This tab shows elsewhere\.example/);
    expect(windows.requests).toHaveLength(0);
  });

  it('closes the editor when its screenshot is removed', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByText('Editing evidence #1 in its own window.');
    await user.click(screen.getByRole('button', { name: 'Remove evidence #1' }));
    expect(windows.closed).toBe(1);
    expect(screen.queryByAltText('Evidence #1')).toBeNull();
    expect(screen.queryByText(/Editing evidence/)).toBeNull();
  });

  it('edits it in its own window and uploads only the edited image', async () => {
    const user = userEvent.setup();
    const api = await withScreenshot(user);

    await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
    expect(windows.requests).toHaveLength(1);
    expect(await windows.requests[0]?.source.text()).toBe('hello');
    expect(windows.requests[0]?.edits).toBeUndefined();
    expect(windows.requests[0]?.label).toBe('evidence #1');
    await screen.findByText('Editing evidence #1 in its own window.');

    windows.answers[0]?.({ blob: new Blob(['edited']), edits });
    await screen.findByText(IDLE_HINT);

    expect(await sentScreenshot(user, api)).toBe('edited');
  });

  it('reopens the capture with its edits, and taking them off sends the capture', async () => {
    const user = userEvent.setup();
    const api = await withScreenshot(user);

    await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
    windows.answers[0]?.({ blob: new Blob(['edited']), edits });
    await screen.findByText(IDLE_HINT);

    await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
    expect(await windows.requests[1]?.source.text()).toBe('hello');
    expect(windows.requests[1]?.edits).toEqual(edits);

    windows.answers[1]?.(null);
    await screen.findByText(IDLE_HINT);
    expect(await sentScreenshot(user, api)).toBe('hello');
  });

  it('leaves the screenshot alone when the window is cancelled or closed', async () => {
    const user = userEvent.setup();
    const api = await withScreenshot(user);

    await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
    windows.answers[0]?.(undefined);
    await screen.findByText(IDLE_HINT);
    expect(await sentScreenshot(user, api)).toBe('hello');
  });

  it('edits inside the panel when no window can open', async () => {
    const user = userEvent.setup();
    const api = await openForm(user);
    windows.unavailable = true;

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByRole('dialog', { name: 'Edit evidence #1' });

    const stage = document.querySelector<HTMLElement>('.us-editor-canvas');
    if (stage === null) throw new Error('The editor shows no image');
    await user.pointer([
      { keys: '[MouseLeft>]', target: stage, coords: { clientX: 20, clientY: 20 } },
      { target: stage, coords: { clientX: 80, clientY: 60 } },
      { keys: '[/MouseLeft]', target: stage },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(await sentScreenshot(user, api)).toBe('edited in panel');
  });

  it('sends nothing while a screenshot is open in the editor', async () => {
    const user = userEvent.setup();
    const api = await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByText('Editing evidence #1 in its own window.');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Save or cancel the screenshot open in the editor first.',
    );
    expect(windows.focused).toBe(1);
    expect(api.callsTo('POST', '/uploads/evidence')).toHaveLength(0);
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);

    act(() => windows.answers[0]?.({ blob: new Blob(['edited']), edits }));
    await screen.findByText(IDLE_HINT);
    expect(await sentScreenshot(user, api)).toBe('edited');
  });

  it('keeps to one editor: another screenshot brings the open one to the front', async () => {
    const user = userEvent.setup();
    await withScreenshot(user);
    await user.click(screen.getByRole('button', { name: 'Add another screenshot' }));
    await screen.findByText('Editing evidence #2 in its own window.');

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add another screenshot' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
    expect(windows.requests).toHaveLength(1);
    expect(windows.focused).toBe(1);
    expect(screen.getByText('Editing evidence #2 in its own window.')).toBeDefined();
  });

  it('holds the screenshots still while the form sends', async () => {
    const user = userEvent.setup();
    const api = await withScreenshot(user);
    // The upload never answers, so the form stays mid-send.
    api.hold('POST', '/uploads/evidence');

    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    await screen.findByRole('button', { name: 'Submitting…' });
    expect(screen.queryByRole('button', { name: 'Edit evidence #1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove evidence #1' })).toBeNull();
    expect(screen.getByAltText('Evidence #1')).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add another screenshot' }).disabled).toBe(true);
  });

  it('closes its editor window when the form is left', async () => {
    const user = userEvent.setup();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByText('Editing evidence #1 in its own window.');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(windows.closed).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(windows.closed).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(windows.closed).toBe(1);
  });
});

// The list hook directly, for an upload that races an edit.
describe('a screenshot list', () => {
  it('takes an upload’s address only for the image that was uploaded', async () => {
    stubScreenshot();
    vi.stubGlobal('chrome', fakeBrowser);
    const created = await fakeBrowser.windows.create({ focused: true });
    await fakeBrowser.tabs.create({ url: 'https://edits.example/account', active: true, windowId: created?.id });
    const { result } = renderHook(() => useScreenshotLists('https://edits.example/account'));
    const list = () => result.current.list('form');

    const taken: { item: PendingEvidence | null } = { item: null };
    await act(async () => {
      taken.item = await list().take();
    });
    const captured = taken.item;
    if (captured === null) throw new Error('Nothing was captured');
    const uploaded = { ...captured, uploadedUrl: 'https://files.example.invalid/capture.jpg' };

    // An edit made during the upload must survive the late upload result.
    act(() => list().edit(captured.id, { blob: new Blob(['edited']), edits }));
    act(() => list().replace(uploaded));
    expect(await list().items[0]?.blob.text()).toBe('edited');
    expect(list().items[0]?.uploadedUrl).toBeUndefined();

    // With the image unchanged, the address is kept so a retry does not upload again.
    const current = list().items[0];
    if (current === undefined) throw new Error('The screenshot went missing');
    act(() => list().replace({ ...current, uploadedUrl: 'https://files.example.invalid/edited.jpg' }));
    expect(list().items[0]?.uploadedUrl).toBe('https://files.example.invalid/edited.jpg');
    expect(list().items[0]?.edits).toEqual(edits);
  });
});

describe('capture and submission races', () => {
  it('blocks sending during capture and discards a capture if the tab changed', async () => {
    const user = userEvent.setup();
    const api = await openForm(user, 'https://capture-race.example/');
    let release!: (data: string) => void;
    fakeBrowser.tabs.captureVisibleTab = () =>
      new Promise<string>((resolve) => {
        release = resolve;
      });
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Finish capturing');
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
    const [tab] = await fakeBrowser.tabs.query({ active: true, currentWindow: true });
    await fakeBrowser.tabs.update(tab!.id, { url: 'https://private.example/' });
    act(() => release('data:image/jpeg;base64,aGVsbG8='));
    await screen.findByText('The tab changed during capture. Take the screenshot again.');
    expect(screen.queryByAltText('Evidence #1')).toBeNull();
    expect(windows.requests).toHaveLength(0);
  });

  it('blocks programmatic submission while the inline editor is open', async () => {
    const user = userEvent.setup();
    const api = await openForm(user, 'https://inline-race.example/');
    windows.unavailable = true;
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByRole('dialog', { name: 'Edit evidence #1' });
    // jsdom does not enforce showModal's inert background. This exercises the guard itself.
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Finish capturing or editing');
    expect(api.callsTo('POST', '/uploads/evidence')).toHaveLength(0);
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
  });
});

describe('the editor inside the panel', () => {
  it('keeps the screenshot as it was when it is cancelled', async () => {
    const user = userEvent.setup();
    const api = await openForm(user);
    windows.unavailable = true;

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByRole('dialog', { name: 'Edit evidence #1' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByAltText('Evidence #1')).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add another screenshot' }).disabled).toBe(false);

    expect(await sentScreenshot(user, api)).toBe('hello');
  });

  it('closes when its screenshot is removed', async () => {
    const user = userEvent.setup();
    await openForm(user);
    windows.unavailable = true;

    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByRole('dialog', { name: 'Edit evidence #1' });
    await user.click(screen.getByRole('button', { name: 'Remove evidence #1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByAltText('Evidence #1')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add screenshot' }).disabled).toBe(false);
  });
});

it('brings the other editor to the front when two forms reach for it at once', async () => {
  const user = userEvent.setup();
  await withScreenshot(user);
  windows.refuseOnce = true;

  await user.click(screen.getByRole('button', { name: 'Edit evidence #1' }));
  expect(windows.focused).toBe(1);
  expect(windows.requests).toHaveLength(0);
  expect(screen.queryByText(/Editing evidence/)).toBeNull();
  expect(screen.getByText(IDLE_HINT)).toBeDefined();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add another screenshot' }).disabled).toBe(false);
});
