/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import match from '../../../testing/fixtures/match.json';
import { SidePanelApp } from '../SidePanelApp';

describe('the first run', () => {
  it('says what makes a test count until the tester dismisses it, and stays dismissed', async () => {
    const user = userEvent.setup();
    fakeApi().on('POST', '/services/match', { data: match }).install();
    await openPanel('https://first.example/');
    expect(await screen.findByRole('heading', { name: 'How a test counts' }, { timeout: 3000 })).toBeDefined();
    expect(screen.getByText(/Tests sent from abroad are not recorded/)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('heading', { name: 'How a test counts' })).toBeNull();
    await waitFor(async () =>
      expect(await fakeBrowser.storage.local.get('firstRunSeen')).toEqual({ firstRunSeen: true }),
    );
  });

  it('stays away once seen', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();
    await openPanel('https://again.example/');
    await fakeBrowser.storage.local.set({ firstRunSeen: true });
    // Reopened, as a panel closed and opened again keeps its storage.
    cleanup();
    render(<SidePanelApp />);
    await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 });
    expect(screen.queryByRole('heading', { name: 'How a test counts' })).toBeNull();
  });
});
