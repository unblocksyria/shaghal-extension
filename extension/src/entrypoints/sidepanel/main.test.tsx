/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeApi } from '../../testing/fakeApi';

// The page module runs on import. It applies what is saved before it renders,
// so the panel never flashes the wrong theme or direction.
it('applies the saved theme and language before rendering the panel', async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  Object.assign(fakeBrowser, { i18n: { getUILanguage: () => 'en-US' } });
  await fakeBrowser.storage.local.set({ language: 'ar' });
  localStorage.setItem('theme', 'dark');
  fakeApi().install();
  document.body.innerHTML = '<div id="root"></div>';

  await import('./main');

  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(document.documentElement.dir).toBe('rtl');
  expect(document.documentElement.lang).toBe('ar');
  await screen.findByRole('button', { name: 'الإعدادات' });
  // No page is open in the fake browser, so the panel asks for one and looks nothing up.
  expect(screen.getByRole('heading', { name: 'افتح موقعاً ويب' })).toBeDefined();
});
