/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { fakeApi } from '../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../testing/panel';
import match from '../../testing/fixtures/match.json';
import matchNone from '../../testing/fixtures/match-none.json';

// The root is mounted in every test, so a view change and the request the page
// makes are the real ones (spec 0001, AC-3 and AC-5).
describe('the panel home', () => {
  it('sends the open page to the match route before offering a card (covers AC-3)', async () => {
    const api = fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://another.example/page');
    await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 });

    // The match body carries the active locale (spec 0002, AC-7).
    expect(api.callsTo('POST', '/services/match').at(0)?.json).toEqual({
      url: 'https://another.example/page',
      locale: 'en',
    });
  });
});

describe('opening a form', () => {
  it('shows why the service would not open and stays on the card (covers AC-6)', async () => {
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

  it('says it is opening while the record is in flight (covers AC-6)', async () => {
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
  it('keeps what was typed and what was attached while Settings is open (covers AC-5)', async () => {
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

    // The form stays mounted underneath: hidden, not unmounted.
    expect(screen.getByRole('textbox', { name: 'Service name', hidden: true })).toHaveProperty('value', 'Kept Service');
    expect(screen.queryByRole('textbox', { name: 'Service name' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Report a Service' });
    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', 'Kept Service');
    expect(screen.getByAltText('Evidence #1')).toBeDefined();
  });
});
