/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SettingsView } from './SettingsView';

vi.mock('../../lib/config', async (original) => ({ ...(await original<object>()), IS_FIREFOX: true }));

async function openSettings(commands: object): Promise<void> {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  Object.assign(fakeBrowser, { commands });
  render(<SettingsView onBack={() => undefined} />);
}

describe('the shortcut on Firefox', () => {
  it("opens Firefox's own shortcut settings", async () => {
    const openShortcutSettings = vi.fn(() => Promise.resolve());
    await openSettings({
      getAll: () => Promise.resolve([{ name: '_execute_action', shortcut: 'Ctrl+Shift+U' }]),
      openShortcutSettings,
    });
    await screen.findByText('Ctrl+Shift+U');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }));
    expect(openShortcutSettings).toHaveBeenCalledOnce();
  });

  it('says where to change it where Firefox cannot open that page itself', async () => {
    await openSettings({ getAll: () => Promise.reject(new Error('no commands')) });
    expect(await screen.findByText('Not set')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByText('Change it under Manage Extension Shortcuts on the add-ons page.')).toBeDefined();
  });
});
