import { fakeBrowser } from 'wxt/testing/fake-browser';

/**
 * Close every editor window, as the tester closing it would. A dismissed editor
 * stays counted as open until its window is gone, and the fake one never closes
 * itself. Kept apart from panel.tsx so the test setup can use it without loading
 * the panel ahead of a test's mocks.
 */
export async function closeEditorWindows(): Promise<void> {
  for (const window of await fakeBrowser.windows.getAll())
    if (window.type === 'popup' && window.id !== undefined) await fakeBrowser.windows.remove(window.id);
}
