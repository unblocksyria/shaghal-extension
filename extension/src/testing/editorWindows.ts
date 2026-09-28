import { fakeBrowser } from 'wxt/testing/fake-browser';

/**
 * Closes every editor popup. An editor counts as open until its window is gone,
 * and fake windows never close on their own. Kept out of panel.tsx so setup.ts
 * can import it without loading the panel before a test's mocks.
 */
export async function closeEditorWindows(): Promise<void> {
  for (const window of await fakeBrowser.windows.getAll())
    if (window.type === 'popup' && window.id !== undefined) await fakeBrowser.windows.remove(window.id);
}
