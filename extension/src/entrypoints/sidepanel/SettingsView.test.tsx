/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getSavedEmail, saveEmail, saveLanguage } from '../../lib/settings';
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

afterEach(() => vi.useRealTimers());

async function openSettings(): Promise<void> {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  render(<SettingsView onBack={() => undefined} />);
}

describe('saving the email', () => {
  it('refuses an address that is not one, and keeps the one already saved', async () => {
    const user = userEvent.setup();
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    await saveEmail('kept@example.com');
    render(<SettingsView onBack={() => undefined} />);

    const field = await screen.findByDisplayValue('kept@example.com');
    await user.clear(field);
    await user.type(field, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save email' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(await getSavedEmail()).toBe('kept@example.com');
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('says so when storage refuses, and clears the message once a save works', async () => {
    const user = userEvent.setup();
    await openSettings();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'tester@example.com');
    await user.click(screen.getByRole('button', { name: 'Save email' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save your email. Try again.');
    expect(await getSavedEmail()).toBe('');

    await user.click(screen.getByRole('button', { name: 'Save email' }));
    await screen.findByText('Saved');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await getSavedEmail()).toBe('tester@example.com');
  });

  it('shows Saved for a moment, then takes it away', async () => {
    const user = userEvent.setup();
    await openSettings();
    // The clock stays real: the hide timer is caught and run by hand.
    const timers = vi.spyOn(window, 'setTimeout');

    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'tester@example.com');
    await user.click(screen.getByRole('button', { name: 'Save email' }));
    await screen.findByText('Saved');

    const hide = timers.mock.calls.find(([, delay]) => delay === 2500);
    if (hide === undefined) throw new Error('Saved is never taken away');
    act(() => {
      (hide[0] as () => void)();
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });
});

it('shows the language that was picked, not the one it resolves to', async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  // An earlier test in this file chose Dark; the theme lives in localStorage.
  localStorage.clear();
  await saveLanguage('en');
  render(<SettingsView onBack={() => undefined} />);

  const languages = screen.getByRole('radiogroup', { name: 'Language' });
  await waitFor(() =>
    expect(within(languages).getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true'),
  );
  expect(within(languages).getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('false');
  // Appearance has a System of its own, which stays picked.
  const themes = screen.getByRole('radiogroup', { name: 'Appearance' });
  expect(within(themes).getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
});
