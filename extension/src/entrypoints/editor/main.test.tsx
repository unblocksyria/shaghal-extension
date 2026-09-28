/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The editor is its own document, so it sets its direction before it renders.
it('applies the saved language before rendering the editor window', async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  Object.assign(fakeBrowser, { i18n: { getUILanguage: () => 'en-US' } });
  await fakeBrowser.storage.local.set({ language: 'ar' });
  window.history.replaceState(null, '', '/editor.html');
  document.body.innerHTML = '<div id="root"></div>';

  await import('./main');

  expect(document.documentElement.dir).toBe('rtl');
  expect(document.documentElement.lang).toBe('ar');
  // Opened without a session, so it says the screenshot is gone, in Arabic.
  await screen.findByRole('button', { name: 'إغلاق' });
});
