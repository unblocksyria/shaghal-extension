/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SITE_BASE } from '../../lib/config';
import { fakeApi } from '../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../testing/panel';
import match from '../../testing/fixtures/match.json';
import matchMany from '../../testing/fixtures/match-many.json';
import matchNone from '../../testing/fixtures/match-none.json';
import serviceRecord from '../../testing/fixtures/service-record.json';

// Each test mounts the full panel, so view changes and requests are real.
describe('the panel home', () => {
  it('sends the open page to the match route before offering a card', async () => {
    const api = fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://another.example/page');
    await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 });

    // The match body carries the active locale.
    expect(api.callsTo('POST', '/services/match').at(0)?.json).toEqual({
      url: 'https://another.example/page',
      locale: 'en',
    });
  });
});

describe('opening a form', () => {
  it('shows why the service would not open and stays on the card', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { status: 500, json: { error: 'BOOM', message: 'Record unavailable' } })
      .install();

    await openPanel('https://openfail.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));

    await screen.findByText('Could not open Netflix: Record unavailable');
    expect(screen.getByRole('button', { name: 'Report what works' })).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Core use' })).toBeNull();
  });

  it('says it is opening while the record is in flight', async () => {
    const user = userEvent.setup();
    const api = fakeApi().on('POST', '/services/match', { data: match });
    api.hold('GET', '/services/netflix');
    api.install();

    await openPanel('https://opening.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));

    await waitFor(() => expect(api.callsTo('GET', '/services/netflix')).toHaveLength(1), { timeout: 3000 });
    expect(screen.getByText('Opening…')).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Core use' })).toBeNull();
  });
});

describe('settings over a form', () => {
  it('keeps what was typed and what was attached while Settings is open', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    fakeApi().on('POST', '/services/match', { data: matchNone }).install();

    await openPanel('https://keep.example/download');
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Report a Service' });

    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Kept Service');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Settings' });

    // The form is hidden, not unmounted.
    expect(screen.getByRole('textbox', { name: 'Service name', hidden: true })).toHaveProperty('value', 'Kept Service');
    expect(screen.queryByRole('textbox', { name: 'Service name' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Report a Service' });
    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', 'Kept Service');
    expect(screen.getByAltText('Evidence #1')).toBeDefined();
  });
});

/** The host of the page a match request was made for. */
const requestedHost = (json: unknown) => new URL((json as { url?: string }).url ?? 'about:blank').hostname;

/** Navigates the fake browser's active tab, as the tester would. */
async function navigateTo(url: string): Promise<void> {
  const [tab] = await fakeBrowser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab to navigate');
  await fakeBrowser.tabs.update(tab.id, { url });
}

describe('on Unblock Syria itself', () => {
  // No routes: any lookup would be refused and fail the test.
  it('explains the panel instead of looking anything up', async () => {
    fakeApi().install();
    await openPanel('https://unblocksyria.com/en/services/netflix');
    await screen.findByRole('heading', { name: 'How it works' });
    for (const step of ['Check any site', 'Vote', 'Report what works', 'Add a missing site']) {
      expect(screen.getByText(step)).toBeDefined();
    }
    expect(screen.getByText(/No account needed/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Report what works' })).toBeNull();
  });

  it('counts the configured site as its own, as with a local site in development', async () => {
    fakeApi().install();
    await openPanel(`${SITE_BASE}/en`);
    await screen.findByRole('heading', { name: 'How it works' });
  });
});

describe('leaving a page while its form opens', () => {
  it('does not open the form for the page that was left', async () => {
    const user = userEvent.setup();
    const api = fakeApi().on('POST', '/services/match', (call) => ({
      data: requestedHost(call.json) === 'left.example' ? match : matchNone,
    }));
    const release = api.hold('GET', '/services/netflix', { data: serviceRecord });
    api.install();

    await openPanel('https://left.example/');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
    await screen.findByText('Opening…');

    await navigateTo('https://elsewhere.example/');
    // The panel has noticed the new page once it looks it up.
    await waitFor(() => expect(api.callsTo('POST', '/services/match')).toHaveLength(2), { timeout: 3000 });
    release();

    // The new page's card, not a report form for the old one.
    await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 });
    expect(screen.queryByRole('heading', { name: 'Report what works' })).toBeNull();
    expect(screen.queryByText('Opening…')).toBeNull();
    expect(screen.queryByText(/Could not open/)).toBeNull();
  });
});

describe('picking from a list', () => {
  it('keeps the pick for the exact page it was made on, and for no other', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', (call) => ({
        data: requestedHost(call.json) === 'many.example' ? matchMany : matchNone,
      }))
      .install();

    await openPanel('https://many.example/');
    await user.click(await screen.findByRole('button', { name: /Google/ }, { timeout: 3000 }));
    expect(screen.getByRole('heading', { name: 'Google' })).toBeDefined();

    // Another site shows its own card.
    await navigateTo('https://other.example/');
    await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 });
    expect(screen.queryByRole('heading', { name: 'Google' })).toBeNull();

    // Another page on the same site asks again, since the pick was for one page.
    await navigateTo('https://many.example/mail');
    await screen.findByRole('heading', { name: 'Which service is this?' }, { timeout: 3000 });
    expect(screen.queryByRole('heading', { name: 'Google' })).toBeNull();

    // The page the pick was made on remembers it.
    await navigateTo('https://many.example/');
    await screen.findByRole('heading', { name: 'Google' }, { timeout: 3000 });
  });
});
