/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSavedEmail } from '../../lib/settings';
import { readThemePreference } from '../../lib/theme';
import { SettingsView } from './SettingsView';

it('leaves saved settings without a draft prompt or unload warning', async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<SettingsView onBack={onBack} />);

  await user.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(readThemePreference()).toBe('dark');
  await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'tester@example.com');
  await user.click(screen.getByRole('button', { name: 'Save email' }));
  await screen.findByText('Saved');
  expect(await getSavedEmail()).toBe('tester@example.com');

  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
  expect(screen.queryByText(/Unsent drafts stay here only/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
