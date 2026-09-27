/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { EditRequest } from '../../lib/editorWindow';
import type { EditedScreenshot } from '../../lib/imageEdits';
import { applyLanguage } from '../../lib/i18n';
import { ar } from '../../locales/ar';
import { EditorApp } from './EditorApp';

// The panel's side of the handover, played by the test.
const panel = vi.hoisted(() => ({
  sessions: [] as string[],
  open: null as ((request: EditRequest) => void) | null,
  dismiss: null as (() => void) | null,
  saved: [] as (EditedScreenshot | null)[],
  cancelled: 0,
  closed: 0,
}));
vi.mock('../../lib/editorWindow', () => ({
  connectToPanel: (session: string, onOpen: (request: EditRequest) => void, onDismiss: () => void) => {
    panel.sessions.push(session);
    panel.open = onOpen;
    panel.dismiss = onDismiss;
    return {
      save: (edited: EditedScreenshot | null) => panel.saved.push(edited),
      cancel: () => (panel.cancelled += 1),
      close: () => (panel.closed += 1),
    };
  },
}));
vi.mock('../../lib/imageBake', () => ({
  openEditableImage: () =>
    Promise.resolve({ width: 1000, height: 600, url: 'blob:source', bitmap: {}, dispose: () => undefined }),
  bakeEdits: () => Promise.resolve(new Blob(['edited'])),
}));

function openAt(search: string) {
  Object.assign(panel, { sessions: [], open: null, dismiss: null, saved: [], cancelled: 0, closed: 0 });
  window.history.replaceState(null, '', `/editor.html${search}`);
  return render(<EditorApp />);
}

// A test that switches the language leaves the shared i18next instance behind it, so the next one starts in English.
afterEach(() => {
  applyLanguage('en');
});

describe('the editor window page', () => {
  it('asks the panel for its screenshot and edits it', async () => {
    const user = userEvent.setup();
    openAt('?session=abc');
    expect(panel.sessions).toEqual(['abc']);

    act(() => void panel.open?.({ source: new Blob(['capture']), label: 'evidence #2' }));
    await screen.findByRole('dialog', { name: 'Edit evidence #2' });
    expect(document.title).toBe('Edit evidence #2');

    const canvas = document.querySelector<HTMLElement>('.us-editor-canvas');
    if (canvas === null) throw new Error('No image');
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 20, clientY: 20 } },
      { target: canvas, coords: { clientX: 90, clientY: 60 } },
      { keys: '[/MouseLeft]', target: canvas },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panel.saved).toHaveLength(1));
    expect(await panel.saved[0]?.blob.text()).toBe('edited');
  });

  it('tells the panel when it is cancelled', async () => {
    const user = userEvent.setup();
    openAt('?session=abc');
    act(() => void panel.open?.({ source: new Blob(['capture']), label: 'evidence #1' }));
    await screen.findByRole('button', { name: 'Undo' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(panel.cancelled).toBe(1));
  });

  it('says so when the panel never hands the screenshot over', () => {
    vi.useFakeTimers();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    openAt('?session=abc');
    expect(screen.queryByText(/no longer open in the panel/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/no longer open in the panel/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('says so at once when opened without a session', () => {
    openAt('');
    expect(panel.sessions).toEqual([]);
    expect(screen.getByText(/no longer open in the panel/)).toBeDefined();
  });

  it('lets go of the panel when it closes', () => {
    const { unmount } = openAt('?session=abc');
    unmount();
    expect(panel.closed).toBe(1);
  });

  it('closes itself when the panel lets the screenshot go, unsaved edits and all', async () => {
    const user = userEvent.setup();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    openAt('?session=abc');
    act(() => void panel.open?.({ source: new Blob(['capture']), label: 'evidence #1' }));
    await screen.findByRole('button', { name: 'Undo' });

    const canvas = document.querySelector<HTMLElement>('.us-editor-canvas');
    if (canvas === null) throw new Error('No image');
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 20, clientY: 20 } },
      { target: canvas, coords: { clientX: 90, clientY: 60 } },
      { keys: '[/MouseLeft]', target: canvas },
    ]);
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(closing()).toBe(true);

    act(() => panel.dismiss?.());
    // The warning is lifted before the window closes, so nothing holds it open.
    expect(closing()).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(panel.saved).toEqual([]);
  });

  it('takes a language switch made while it is open, the way the panel does', async () => {
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    openAt('?session=abc');
    act(() => void panel.open?.({ source: new Blob(['capture']), label: 'evidence #1' }));
    await screen.findByRole('button', { name: 'Cancel' });
    expect(document.documentElement.dir).toBe('ltr');

    // The tester picks Arabic in Settings, in the panel that stays open behind this window.
    await fakeBrowser.storage.local.set({ language: 'ar' });

    const cancel = ar.editor?.cancel;
    if (cancel === undefined) throw new Error('The Arabic catalog has no editor.cancel');
    await screen.findByRole('button', { name: cancel });
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
