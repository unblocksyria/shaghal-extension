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
  expect(screen.getByText('Saved').closest('[aria-live]')).not.toBeNull();
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

it('offers Kurdish beside English and Arabic, and shows it picked once saved', async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  await saveLanguage('ku');
  render(<SettingsView onBack={() => undefined} />);

  const languages = screen.getByRole('radiogroup', { name: 'Language' });
  expect(
    within(languages)
      .getAllByRole('radio')
      .map((radio) => radio.textContent),
  ).toEqual(['System', 'English', 'Arabic', 'Kurdish']);
  await waitFor(() =>
    expect(within(languages).getByRole('radio', { name: 'Kurdish' }).getAttribute('aria-checked')).toBe('true'),
  );
});

describe('what you sent', () => {
  it('lists what this browser sent, newest first, and forgets it on request', async () => {
    await openSettings();
    const user = userEvent.setup();
    await act(() =>
      fakeBrowser.storage.local.set({
        sentHistory: [
          {
            kind: 'report',
            serviceSlug: 'netflix',
            serviceName: 'Netflix',
            at: Date.parse('2026-10-20T10:00:00.000Z'),
            parts: [{ slug: 'core_use', name: 'Core use', level: 'failing' }],
          },
          { kind: 'service', serviceName: 'Wego', at: Date.parse('2026-10-02T10:00:00.000Z') },
        ],
      }),
    );
    const report = await screen.findByRole('link', { name: 'Netflix' });
    expect(report.getAttribute('href')).toMatch(/\/en\/services\/netflix$/);
    expect(screen.getByText('20 Oct 2026 · Core use: Fails')).toBeDefined();
    expect(screen.getByText('2 Oct 2026 · New service')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear this list' }));
    expect(await screen.findByText(/Reports and corrections you send from this browser appear here/)).toBeDefined();
    expect(await fakeBrowser.storage.local.get('sentHistory')).toEqual({});
  });
});

describe('about', () => {
  it('shows the version and the shortcut, and opens the shortcut settings', async () => {
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    fakeBrowser.runtime.getManifest = () => ({ version: '9.8.7' }) as chrome.runtime.Manifest;
    Object.assign(fakeBrowser, {
      commands: { getAll: () => Promise.resolve([{ name: '_execute_action', shortcut: 'Ctrl+Shift+U' }]) },
    });
    const opened = vi.spyOn(fakeBrowser.tabs, 'create').mockImplementation(() => Promise.resolve() as never);
    const user = userEvent.setup();
    render(<SettingsView onBack={() => undefined} />);

    expect(screen.getByText('9.8.7')).toBeDefined();
    expect(await screen.findByText('Ctrl+Shift+U')).toBeDefined();
    expect(screen.getByRole('link', { name: /Report a bug/ }).getAttribute('href')).toBe(
      'https://github.com/unblocksyria/shaghal-extension/issues/new?template=bug_report.yml&version=9.8.7',
    );
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(opened).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  });

  it('says when no shortcut is set', async () => {
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    Object.assign(fakeBrowser, {
      commands: { getAll: () => Promise.resolve([{ name: '_execute_action', shortcut: '' }]) },
    });
    render(<SettingsView onBack={() => undefined} />);
    expect(await screen.findByText('Not set')).toBeDefined();
  });
});
