/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SITE_BASE } from '../../../lib/config';
import { fakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import match from '../../../testing/fixtures/match.json';
import matchMany from '../../../testing/fixtures/match-many.json';
import matchNone from '../../../testing/fixtures/match-none.json';
import serviceDetails from '../../../testing/fixtures/service-details.json';
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

afterEach(() => vi.useRealTimers());

describe('the service logo', () => {
  it('loads from the address the API gives, without a referrer, and falls back to an initial', async () => {
    const withLogo = { ...match, service: { ...match.service, logoUrl: 'https://cdn.example/netflix.png' } };
    fakeApi().on('POST', '/services/match', { data: withLogo }).install();

    await openPanel('https://logo.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    const logo = document.querySelector<HTMLImageElement>('img[src="https://cdn.example/netflix.png"]');
    if (logo === null) throw new Error('The card shows no logo');
    expect(logo.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(logo.alt).toBe('');

    fireEvent.error(logo);
    expect(document.querySelector('img[src="https://cdn.example/netflix.png"]')).toBeNull();
    expect(screen.getByText('N')).toBeDefined();
  });
});

describe('what the card says about the service', () => {
  it('shows the company and the last check, and drops the company when it is the service itself', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();
    await openPanel('https://company.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(screen.getByText(/^Netflix, Inc\. · Checked 1 Sep/)).toBeDefined();
  });

  it('shows only the check when the company is the service itself', async () => {
    const own = { ...match, service: { ...match.service, company: { name: 'Netflix' } } };
    fakeApi().on('POST', '/services/match', { data: own }).install();
    await openPanel('https://self-owned.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(screen.getByText(/^Checked 1 Sep/)).toBeDefined();
  });

  it("warns when the page is a subdomain of the service's site", async () => {
    fakeApi()
      .on('POST', '/services/match', { data: { ...match, matchType: 'parent_domain' } })
      .install();
    await openPanel('https://help.subdomain.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(screen.getByText(/This page is on a subdomain of Netflix's site, so it may differ\./)).toBeDefined();
  });

  it('names an untracked site without www.', async () => {
    fakeApi().on('POST', '/services/match', { data: matchNone }).install();
    await openPanel('https://www.untracked.example/');
    await screen.findByRole('heading', { name: "untracked.example isn't tracked yet" }, { timeout: 3000 });
  });

  it('asks again on Try again, and shows the card once the API answers', async () => {
    const user = userEvent.setup();
    let failing = true;
    const api = fakeApi()
      .on('POST', '/services/match', () =>
        failing ? { status: 500, json: { error: 'BOOM', message: 'Service is down' } } : { data: match },
      )
      .install();

    await openPanel('https://retry.example/');
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 3000 });
    failing = false;
    await user.click(retry);
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(api.callsTo('POST', '/services/match')).toHaveLength(2);
  });
});

describe('a vote that does not go through', () => {
  it("shows the API's reason under the button and leaves the vote open", async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('POST', '/services/netflix/vote', {
        status: 503,
        json: { error: 'UNAVAILABLE', message: 'Voting is paused' },
      })
      .install();

    await openPanel('https://refused.example/');
    await user.click(await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 }));
    await screen.findByText('Voting is paused');
    expect(screen.getByRole('button', { name: /I need this/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('High-vote services get prioritized for outreach.')).toBeNull();
  });

  it('explains a busy network', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('POST', '/services/netflix/vote', { status: 429, json: { error: 'RATE_LIMITED', message: 'Slow down' } })
      .install();

    await openPanel('https://busy.example/');
    await user.click(await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 }));
    await screen.findByText('Too many votes from this network. Try again later.');
  });

  it('catches up when this network already voted, keeping the count it knows', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('POST', '/services/netflix/vote', { status: 400, json: { error: 'ALREADY_VOTED', message: 'Already voted' } })
      .install();

    await openPanel('https://already.example/');
    await user.click(await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 }));
    const voted = await screen.findByRole('button', { name: /Voted/ });
    expect(voted.getAttribute('aria-pressed')).toBe('true');
    expect(voted.textContent ?? '').toContain('12');
  });
});

describe('removing a vote', () => {
  it('lets the confirming click lapse after three seconds, withdrawing nothing', async () => {
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('POST', '/services/netflix/vote', { json: vote })
      .on('DELETE', '/services/netflix/vote', { json: { voteCount: 12 } })
      .install();
    const user = userEvent.setup();
    await openPanel('https://lapse.example/');
    await user.click(await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 }));
    const voted = await screen.findByRole('button', { name: /Voted/ });

    // Fake the clock only for the confirmation window. user-event waits on
    // timers, so the confirming click is a plain event.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(voted);
    expect(screen.getByText('Click again to remove your vote.')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole('button', { name: /Remove vote/ })).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Click again to remove your vote.')).toBeNull();
    expect(screen.getByRole('button', { name: /Voted/ })).toBeDefined();
    expect(api.callsTo('DELETE', '/services/netflix/vote')).toHaveLength(0);
  });
});

it('follows a vote cast from another panel without asking the API', async () => {
  const api = fakeApi().on('POST', '/services/match', { data: match }).install();
  await openPanel('https://other-panel.example/');
  await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 });

  await fakeBrowser.storage.local.set({ 'voteHint:netflix': true });
  await screen.findByRole('button', { name: /Voted/ });
  expect(api.callsTo('POST', '/services/netflix/vote')).toHaveLength(0);
});

describe('the parts of a matched service', () => {
  it('shows each part with its level, its note and both dates', async () => {
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceDetails })
      .install();

    await openPanel('https://parts.example/');
    await screen.findByRole('heading', { name: 'What works' }, { timeout: 3000 });

    // The card asks once, as soon as the service matches.
    expect(api.callsTo('GET', '/services/netflix')).toHaveLength(1);
    expect(screen.getByText('Each part of the service, checked from Syria.')).toBeDefined();

    expect(screen.getByText('Core use')).toBeDefined();
    expect(screen.getByText('Fails')).toBeDefined();
    expect(screen.getByText('Opening the app and playing a video.')).toBeDefined();
    expect(screen.getByText(/Since 16 Feb 2026/)).toBeDefined();
    // September can come out as "Sep" or "Sept" depending on the ICU build.
    expect(screen.getByText(/Checked 29 Sep/)).toBeDefined();

    expect(screen.getByText('Landing page')).toBeDefined();
    expect(screen.getByText('Works')).toBeDefined();
    // A part with no note and no dates still shows its name and level.
    expect(screen.getByText('Payments')).toBeDefined();
    expect(screen.getByText('Not checked')).toBeDefined();
  });

  it('keeps the card as it is when the record cannot be read', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { status: 500, json: { error: 'BOOM', message: 'Record unavailable' } })
      .install();

    await openPanel('https://no-details.example/');
    await screen.findByRole('heading', { name: 'Netflix' }, { timeout: 3000 });
    expect(screen.getByText('Usable')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'What works' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'What works instead' })).toBeNull();
  });
});

describe('alternatives on a blocked card', () => {
  const blocked = { ...match, service: { ...match.service, availability: 'blocked' } };

  it('offers the ones that work from Syria, each opening its page on the site', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: blocked })
      .on('GET', '/services/netflix', { data: serviceDetails })
      .install();

    await openPanel('https://alternatives.example/');
    await screen.findByRole('heading', { name: 'What works instead' }, { timeout: 3000 });

    expect(screen.getByText('Netflix is blocked from Syria. These work instead.')).toBeDefined();
    expect(screen.getByRole('link', { name: /Airbnb/ })).toHaveProperty('href', `${SITE_BASE}/en/services/airbnb`);
    expect(screen.getByRole('link', { name: /Booking/ })).toHaveProperty(
      'href',
      `${SITE_BASE}/en/services/booking-com`,
    );
    // Blocked and untested services are not offered as a way out.
    expect(screen.queryByText('Hostelworld')).toBeNull();
    expect(screen.queryByText('Wanderlog')).toBeNull();
    // The service never points at itself.
    expect(screen.queryByRole('link', { name: /Netflix/ })).toBeNull();
  });

  it('stays off a service that is not blocked', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceDetails })
      .install();

    await openPanel('https://not-blocked.example/');
    await screen.findByRole('heading', { name: 'What works' }, { timeout: 3000 });
    expect(screen.queryByRole('heading', { name: 'What works instead' })).toBeNull();
    expect(screen.queryByText('Airbnb')).toBeNull();
  });
});
