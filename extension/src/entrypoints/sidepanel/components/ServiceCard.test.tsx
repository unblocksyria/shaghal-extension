/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import match from '../../../testing/fixtures/match.json';
import matchMany from '../../../testing/fixtures/match-many.json';
import functionalities from '../../../testing/fixtures/functionalities.json';

const service = match.service;

/** The match for a service, with fields the test sets. */
function matched(fields: Record<string, unknown>, matchType = 'host') {
  return { ...match, matchType, service: { ...service, ...fields } };
}

/** A record whose parts are the test's own. */
function record(parts: Record<string, unknown>[], fields: Record<string, unknown> = {}) {
  return { id: service.id, name: service.name, url: 'https://www.netflix.com', functionalities: parts, ...fields };
}

const part = (slug: string, name: string, level: string, checked: string | null = null) => ({
  slug,
  name,
  level,
  description: null,
  changedAt: checked,
  lastObservedAt: checked,
});

describe('pointing the tester at the gaps', () => {
  it('leads with a test on a service nobody has checked, opening the report with core use and the landing page', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: matched({ availability: 'unknown' }) })
      .on('GET', '/services/netflix', {
        data: record([part('core_use', 'Core use', 'unknown'), part('landing_page', 'Landing page', 'unknown')]),
      })
      .on('GET', '/functionalities', { data: functionalities })
      .install();

    await openPanel('https://unknown.example/');
    const test = await screen.findByRole('button', { name: 'Test it from Syria' }, { timeout: 3000 });
    const vote = screen.getByRole('button', { name: /I need this/ });
    // The test comes before the vote.
    expect(test.compareDocumentPosition(vote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(test);
    await screen.findByRole('heading', { name: 'Report what works' });
    expect(screen.getByRole('button', { name: 'Core use', pressed: true })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Landing page', pressed: true })).toBeDefined();
  });

  it('offers "Test this" on an unchecked part, without a "Since" date, and opens the report on that part', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', {
        data: record([
          part('core_use', 'Core use', 'working', '2026-09-29T09:00:00.000Z'),
          { ...part('payment', 'Payment', 'unknown'), changedAt: '2026-09-15T00:00:00.000Z' },
        ]),
      })
      .on('GET', '/functionalities', { data: functionalities })
      .install();

    await openPanel('https://gaps.example/');
    const action = await screen.findByRole('button', { name: 'Test this Payment' }, { timeout: 3000 });
    // The catalogue's own date on an unchecked part reads as a check that never happened.
    expect(screen.queryByText(/Since 15 Sept 2026/)).toBeNull();

    await user.click(action);
    await screen.findByRole('heading', { name: 'Report what works' });
    expect(screen.getByRole('button', { name: 'Payment', pressed: true })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Core use', pressed: false })).toBeDefined();
  });

  it('names the failing parts a recheck would clear, and leaves fresh ones alone', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: matched({ needsRetesting: true }) })
      .on('GET', '/services/netflix', {
        data: record(
          [
            part('core_use', 'Core use', 'working', '2026-09-29T09:00:00.000Z'),
            part('payment', 'Payment', 'failing', '2026-02-10T09:00:00.000Z'),
            part('upgrade', 'Upgrade', 'failing', '2026-09-01T09:00:00.000Z'),
          ],
          { needsRetesting: true },
        ),
      })
      .on('GET', '/functionalities', { data: functionalities })
      .install();

    await openPanel('https://retest.example/');
    const prompt = await screen.findByRole('note', {}, { timeout: 3000 });
    expect(prompt.textContent).toContain('Payment failed before Syria was removed from the SST list on 24 Aug 2026');
    expect(prompt.textContent).not.toContain('Upgrade');
    expect(screen.getByRole('button', { name: 'Still fails? Payment' })).toBeDefined();
    // Upgrade was checked after the change, so it needs nothing.
    expect(screen.queryByRole('button', { name: 'Still fails? Upgrade' })).toBeNull();

    await user.click(within(prompt).getByRole('button', { name: 'Check them now' }));
    await screen.findByRole('heading', { name: 'Report what works' });
    expect(screen.getByRole('button', { name: 'Payment', pressed: true })).toBeDefined();
    expect(screen.getByText('On record: Fails, checked 10 Feb 2026')).toBeDefined();
  });

  it('marks a part this browser reported recently instead of asking for it again', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: record([part('payment', 'Payment', 'unknown')]) })
      .install();

    await openPanel('https://reported.example/');
    await fakeBrowser.storage.local.set({
      sentHistory: [
        {
          kind: 'report',
          serviceSlug: 'netflix',
          serviceName: 'Netflix',
          at: Date.parse('2026-10-20T10:00:00.000Z'),
          parts: [{ slug: 'payment', name: 'Payment', level: 'failing' }],
        },
      ],
    });

    expect(await screen.findByText('You reported this on 20 Oct 2026', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Test this Payment' })).toBeNull();
  });

  it('shows the checks before the latest one when asked', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', {
        data: record([
          {
            ...part('core_use', 'Core use', 'failing', '2026-09-13T09:00:00.000Z'),
            history: [
              { level: 'failing', description: 'Latest check.', observedAt: '2026-09-13T09:00:00.000Z' },
              {
                level: 'failing',
                description: 'The whole site said Not Available.',
                observedAt: '2026-02-12T09:00:00.000Z',
              },
              { level: 'nonsense', observedAt: 'never' },
            ],
          },
        ]),
      })
      .install();

    await openPanel('https://history.example/');
    await user.click(await screen.findByText('Earlier checks', {}, { timeout: 3000 }));
    expect(screen.getByText('The whole site said Not Available.')).toBeDefined();
    expect(screen.queryByText('Latest check.')).toBeNull();
  });

  it('lets a note in another script keep its own direction', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', {
        data: record([
          { ...part('core_use', 'Core use', 'failing'), description: 'Could not reach the service. (-62)' },
        ]),
      })
      .install();

    await openPanel('https://bidi.example/', { language: 'ar' });
    const note = await screen.findByText('Could not reach the service. (-62)', {}, { timeout: 3000 });
    expect(note.getAttribute('dir')).toBe('auto');
  });
});

describe('a card that may be the wrong service', () => {
  it('asks "Not this?" on a parent-domain match and searches, with a way back to the card', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: matched({}, 'parent_domain') })
      .install();

    await openPanel('https://web.netflix.com/');
    await user.click(
      await screen.findByRole('button', { name: 'Not Netflix? Search for your service' }, { timeout: 3000 }),
    );
    expect(screen.getByRole('searchbox', { name: 'Search for a service' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /I need this/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to Netflix' }));
    expect(screen.getByRole('button', { name: /I need this/ })).toBeDefined();
  });

  it('goes back to the list from a picked service without asking again', async () => {
    const user = userEvent.setup();
    const api = fakeApi().on('POST', '/services/match', { data: matchMany }).install();

    await openPanel('https://many.example/');
    await user.click(await screen.findByRole('button', { name: /YouTube/ }, { timeout: 3000 }));
    await user.click(await screen.findByRole('button', { name: 'Back to the list' }));

    expect(screen.getByRole('heading', { name: 'Which service is this?' })).toBeDefined();
    expect(api.callsTo('POST', '/services/match')).toHaveLength(1);
  });

  it('shows no way off a card matched on its own host', async () => {
    fakeApi().on('POST', '/services/match', { data: match }).install();
    await openPanel('https://exact.example/');
    await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /Not Netflix/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to the list' })).toBeNull();
  });
});

describe('what the record adds to a blocked card', () => {
  it('shows outreach progress and its summary, and where to contact the company', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: matched({ availability: 'blocked' }) })
      .on('GET', '/services/netflix', {
        data: record([], {
          progressStatus: 'in_review',
          timelineSummary: 'Support said the request was escalated in September.',
          supportUrl: 'https://help.netflix.com/en',
          supportEmail: 'help@netflix.example',
        }),
      })
      .install();

    await openPanel('https://outreach.example/');
    expect(await screen.findByText('In review', {}, { timeout: 3000 })).toBeDefined();
    expect(screen.getByText('Support said the request was escalated in September.')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Contact Netflix' })).toBeDefined();
    expect(screen.getByRole('link', { name: /Support page/ }).getAttribute('href')).toBe('https://help.netflix.com/en');
    expect(screen.getByRole('link', { name: /help@netflix.example/ }).getAttribute('href')).toBe(
      'mailto:help@netflix.example',
    );
  });

  it('leaves out a progress it does not know, and a support page that is not a web address', async () => {
    fakeApi()
      .on('POST', '/services/match', { data: matched({ availability: 'blocked' }) })
      .on('GET', '/services/netflix', {
        data: record([], { progressStatus: 'pondering', supportUrl: 'javascript:alert(1)', supportEmail: null }),
      })
      .install();

    await openPanel('https://unknown-progress.example/');
    await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Outreach' })).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Contact Netflix' })).toBeNull();
  });
});

describe('a tester outside Syria', () => {
  it('hears on the card that tests only count from Syria, and is led to the vote', async () => {
    fakeApi()
      .on('GET', '/cdn-cgi/trace', { text: 'loc=DE\n' })
      .on('POST', '/services/match', { data: matched({ availability: 'unknown' }) })
      .install();

    await openPanel('https://abroad.example/');
    const notice = await screen.findByText(/Tests only count from a Syrian connection/, {}, { timeout: 3000 });
    expect(notice.closest('[role="status"]')?.textContent).toContain('Germany');
    // Without a test that can count, the vote comes first again.
    const vote = screen.getByRole('button', { name: /I need this/ });
    const report = screen.getByRole('button', { name: 'Report what works' });
    expect(vote.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('a vote', () => {
  it('shows at once and puts the button back when the vote is refused', async () => {
    const user = userEvent.setup();
    const api = fakeApi().on('POST', '/services/match', { data: match });
    const release = api.hold('POST', '/services/netflix/vote', {
      status: 503,
      json: { error: 'DOWN', message: 'Votes are down.' },
    });
    api.install();

    await openPanel('https://optimistic.example/');
    await user.click(await screen.findByRole('button', { name: /I need this/ }, { timeout: 3000 }));
    const voted = screen.getByRole('button', { name: /Voted/ });
    expect(voted.textContent).toContain('13');
    expect(voted.getAttribute('aria-busy')).toBe('true');

    release();
    expect(await screen.findByText('Votes are down.')).toBeDefined();
    const back = screen.getByRole('button', { name: /I need this/ });
    expect(back.textContent).toContain('12');
    expect(back.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('services to check', () => {
  it('lists services due a recheck, then untested ones, each opening its own site', async () => {
    const row = (slug: string, name: string, url: string | null) => ({ ...service, id: slug, slug, name, url });
    fakeApi()
      .on('GET', '/services', (call) => {
        const params = new URL(call.url).searchParams;
        expect(params.get('sort')).toBe('vote_count');
        expect(params.get('order')).toBe('desc');
        return params.get('needs_retesting') === 'true'
          ? { data: [row('wise', 'Wise', 'https://wise.com'), row('broken', 'Broken', 'not a url')] }
          : { data: [row('wise', 'Wise', 'https://wise.com'), row('dify', 'Dify', 'https://dify.ai')] };
      })
      .install();

    await openPanel(null);
    expect(
      await screen.findByRole('heading', { name: 'Help check these from Syria' }, { timeout: 3000 }),
    ).toBeDefined();
    const links = screen.getAllByRole('link').filter((link) => link.closest('[aria-labelledby="test-queue-title"]'));
    // A row without a web address is left out, and a service in both queues shows once.
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://wise.com/', 'https://dify.ai/']);
    expect(screen.getByText('Nobody has tested it yet')).toBeDefined();
  });

  it('shows nothing when no service needs checking', async () => {
    const api = fakeApi().install();
    await openPanel(null);
    await waitFor(() => expect(api.callsTo('GET', '/services')).toHaveLength(2));
    expect(screen.queryByRole('heading', { name: 'Help check these from Syria' })).toBeNull();
  });
});
