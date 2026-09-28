/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { SITE_BASE } from '../../../lib/config';
import { fakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import match from '../../../testing/fixtures/match.json';
import matchMany from '../../../testing/fixtures/match-many.json';
import matchNone from '../../../testing/fixtures/match-none.json';
import vote from '../../../testing/fixtures/vote.json';

// Each test mounts the full panel, so every state is reached as a tester would reach it.
describe('the page card', () => {
  it('asks for a page when the tab has no address', async () => {
    await openPanel(null);
    expect(screen.getByRole('heading', { name: 'Open a website' })).toBeDefined();
    expect(screen.getByText('Go to any website in this window to see whether it works from Syria.')).toBeDefined();
  });

  it('says it is checking while the match is in flight', async () => {
    const api = fakeApi();
    api.hold('POST', '/services/match');
    api.install();

    await openPanel('https://loading.example/');
    await waitFor(() => expect(api.callsTo('POST', '/services/match')).toHaveLength(1), { timeout: 3000 });
    // The answer is held, so the card stays in its loading state.
    expect(screen.getByRole('heading', { name: 'Checking this site…' })).toBeDefined();
  });

  it('shows the failure and offers to try again', async () => {
    fakeApi()
      .on('POST', '/services/match', { status: 500, json: { error: 'BOOM', message: 'Service is down' } })
      .install();

    await openPanel('https://broken.example/');
    await screen.findByRole('heading', { name: 'Could not check this site' }, { timeout: 3000 });
    expect(screen.getByText('Service is down')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('offers the matched service with its status and its actions', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();

    await openPanel('https://single.example/');
    expect(await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 })).toBeDefined();
    expect(screen.getByText('Usable')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Report what works' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Suggest Correction' })).toBeDefined();
    expect(screen.getByRole('link', { name: /View on Unblock Syria/ })).toHaveProperty(
      'href',
      `${SITE_BASE}/en/services/netflix`,
    );
  });

  it('lists the candidates when the site holds several services', async () => {
    const user = userEvent.setup();
    fakeApi().on('POST', '/services/match', { data: matchMany }).install();

    await openPanel('https://many.example/');
    await screen.findByRole('heading', { name: 'Which service is this?' }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /Google/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /YouTube/ })).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Google/ }));
    expect(screen.getByRole('heading', { name: 'Google' })).toBeDefined();
  });

  it('asks the API for nothing when nothing is tracked', async () => {
    const api = fakeApi().on('POST', '/services/match', { data: matchNone }).install();

    await openPanel('https://untracked.example/');
    await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 });
    expect(api.callsTo('POST', '/services/match')).toHaveLength(1);
  });

  it('votes and withdraws the vote, in the body the API expects', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('POST', '/services/netflix/vote', { json: vote })
      .on('DELETE', '/services/netflix/vote', { json: { voteCount: 12 } })
      .install();

    await openPanel('https://vote.example/');
    const voteButton = await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 });
    await user.click(voteButton);

    const voted = await screen.findByRole('button', { name: /Voted/ });
    expect(voted.getAttribute('aria-pressed')).toBe('true');
    expect(voted.textContent ?? '').toContain('13');

    const sent = api.callsTo('POST', '/services/netflix/vote');
    expect(sent).toHaveLength(1);
    expect(sent.at(0)?.method).toBe('POST');
    expect(sent.at(0)?.url).toMatch(/\/services\/netflix\/vote$/);
    expect(sent.at(0)?.body).toBeNull();

    // The first click asks for confirmation, the second withdraws the vote.
    await user.click(voted);
    expect(screen.getByText('Click again to remove your vote.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: /Remove vote/ }));
    await screen.findByRole('button', { name: /I need this/ });
    expect(api.callsTo('DELETE', '/services/netflix/vote')).toHaveLength(1);
  });

  it('shows an availability this build does not know as unknown', async () => {
    const partial = { ...match, service: { ...match.service, availability: 'partial' } };
    fakeApi().on('POST', '/services/match', { data: partial }).install();

    await openPanel('https://partial.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(screen.getByText('Unknown')).toBeDefined();
    expect(screen.getByText('Nobody has tested core use from Syria yet.')).toBeDefined();
    expect(screen.queryByText(/card\.status/)).toBeNull();
  });
});
