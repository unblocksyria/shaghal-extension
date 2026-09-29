/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { stubSession } from '../../../testing/session';
import { draftKey } from '../../../lib/drafts';
import type { ImageEdits } from '../../../lib/imageEdits';
import { useDraft, type DraftShotGroup } from './useDraft';

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  stubSession();
  URL.createObjectURL = vi.fn(() => 'blob:draft');
  URL.revokeObjectURL = vi.fn();
});

const KEY = draftKey('report', 'svc-1');

const record = (note: string) => ({
  schema: 1,
  form: 'report',
  serviceKey: 'svc-1',
  savedAt: 1,
  fields: { note },
  shots: [],
});

/** What the tester sees: the form's fields and screenshots, as they change. */
interface DraftProps {
  fields: { note: string };
  shots?: DraftShotGroup[];
}

/** Renders the hook for one service, with the form's state as its props. */
function renderDraft(fields: { note: string }, serviceKey = 'svc-1', shots: DraftShotGroup[] = []) {
  const onRestore = vi.fn();
  const initial: DraftProps = { fields, shots };
  const view = renderHook(
    (props: DraftProps) =>
      useDraft({ form: 'report', serviceKey, fields: props.fields, shots: props.shots ?? [], onRestore }),
    { initialProps: initial },
  );
  return { view, onRestore };
}

/**
 * Waits inside an `act` scope. React only flushes the work a promise callback
 * queued when the scope ends, so a read and the debounce window need two of them.
 */
const settle = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** What FormShell does the first time the tester changes anything. */
const touch = (view: { result: { current: { markTouched: () => void } } }) =>
  act(() => {
    view.result.current.markTouched();
  });

describe('useDraft', () => {
  it('puts a stored record back, and leaves one saved for another service alone', async () => {
    await chrome.storage.session.set({ [KEY]: record('Saved.'), [draftKey('report', 'svc-2')]: record('Other.') });

    const { view, onRestore } = renderDraft({ note: '' });
    await settle(20);

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith({ fields: { note: 'Saved.' }, shots: [] });
    expect(view.result.current.restored).toBe(true);
  });

  it('keeps a form nobody has touched out of storage, however its fields load in', async () => {
    const { view } = renderDraft({ note: '' });
    // What an async load looks like: the state changes without the tester doing anything.
    view.rerender({ fields: { note: 'Loaded from elsewhere' } });
    await settle(20);
    await settle(700);

    expect(await chrome.storage.session.get(null)).toEqual({});
    expect(view.result.current.restored).toBe(false);
  });

  it('writes once the tester touches the form, and forgets it when told to', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);

    touch(view);
    view.rerender({ fields: { note: 'Typed.' } });
    await settle(700);
    expect(await chrome.storage.session.get(KEY)).toMatchObject({ [KEY]: { fields: { note: 'Typed.' } } });

    act(() => {
      view.result.current.clear();
    });
    await settle(0);
    expect(await chrome.storage.session.get(null)).toEqual({});
    // A cleared form stays quiet: no later write can bring the record back.
    view.rerender({ fields: { note: 'Typed again.' } });
    await settle(700);
    expect(await chrome.storage.session.get(null)).toEqual({});
  });

  it('lets the tester win when they type while the stored record is still being read', async () => {
    await chrome.storage.session.set({ [KEY]: record('Stored.') });

    // Same tick as the mount, so the read has not come back with the stored draft yet.
    const { view, onRestore } = renderDraft({ note: '' });
    touch(view);
    view.rerender({ fields: { note: 'Typed first.' } });
    await settle(20);
    await settle(700);

    expect(onRestore).not.toHaveBeenCalled();
    expect(view.result.current.restored).toBe(false);
    expect(await chrome.storage.session.get(KEY)).toMatchObject({ [KEY]: { fields: { note: 'Typed first.' } } });
  });

  it('does nothing when the panel closes before the read has come back', async () => {
    await chrome.storage.session.set({ [KEY]: record('Stored.') });
    const { view, onRestore } = renderDraft({ note: '' });
    view.unmount();

    await settle(20);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('does not write a form that was sent before the typing had settled', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);
    touch(view);
    view.rerender({ fields: { note: 'Typed.' } });
    act(() => {
      view.result.current.clear();
    });
    await settle(700);

    expect(await chrome.storage.session.get(null)).toEqual({});
  });

  it('does not bring a discarded draft back when a save was already on its way', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);
    touch(view);
    view.rerender({ fields: { note: 'Typed.' } });

    // The close flush starts the save, and the tester discards before it lands.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      view.result.current.clear();
    });
    await settle(700);

    expect(await chrome.storage.session.get(null)).toEqual({});
  });

  it('writes when the tester empties a restored draft back to how the form opened', async () => {
    await chrome.storage.session.set({ [KEY]: record('Saved.') });

    const { view, onRestore } = renderDraft({ note: '' });
    await settle(20);
    expect(onRestore).toHaveBeenCalledTimes(1);

    // What the form does with the restored draft, and then what the tester does.
    view.rerender({ fields: { note: 'Saved.' } });
    touch(view);
    view.rerender({ fields: { note: '' } });
    await settle(700);

    expect(await chrome.storage.session.get(KEY)).toMatchObject({ [KEY]: { fields: { note: '' } } });
  });

  it('saves a screenshot the tester edited even when the re-encode keeps the same byte size', async () => {
    const capture = (body: string, edits?: ImageEdits): DraftShotGroup[] => [
      {
        partSlug: null,
        items: [
          {
            id: '1000-capture',
            blob: new Blob([body]),
            previewUrl: 'blob:capture',
            filename: 'evidence.jpg',
            ...(edits !== undefined && { edits }),
          },
        ],
      },
    ];
    const redacted: ImageEdits = {
      crop: { x: 0, y: 0, width: 4, height: 4 },
      boxes: [{ id: 'box-1', x: 0, y: 0, width: 1, height: 1 }],
    };

    const { view } = renderDraft({ note: '' }, 'svc-1', capture('aaaa'));
    await settle(20);
    touch(view);
    view.rerender({ fields: { note: 'Typed.' }, shots: capture('aaaa') });
    await settle(700);

    // The same capture re-encoded to the same length, with the detail redacted.
    view.rerender({ fields: { note: 'Typed.' }, shots: capture('bbbb', redacted) });
    await settle(700);

    const saved = await chrome.storage.session.get(KEY);
    const draft = saved[KEY] as { shots?: { bytes: ArrayBuffer }[] } | undefined;
    const [first] = draft?.shots ?? [];
    expect(new TextDecoder().decode(first?.bytes)).toBe('bbbb');
  });

  it('writes the last change when the panel goes away, before the debounce lands', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);
    touch(view);
    view.rerender({ fields: { note: 'Typed.' } });

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await settle(700);

    expect(await chrome.storage.session.get(KEY)).toMatchObject({ [KEY]: { fields: { note: 'Typed.' } } });
  });

  it('keeps quiet when the panel goes away before the form was touched', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await settle(700);

    expect(await chrome.storage.session.get(null)).toEqual({});
    expect(view.result.current.restored).toBe(false);
  });

  it('does not write a second time when the panel goes away after typing has settled', async () => {
    const { view } = renderDraft({ note: '' });
    await settle(20);
    touch(view);
    view.rerender({ fields: { note: 'Typed.' } });
    await settle(700);
    expect(await chrome.storage.session.get(KEY)).toBeDefined();

    const set = vi.spyOn(chrome.storage.session, 'set');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await settle(700);

    expect(set).not.toHaveBeenCalled();
  });
});
