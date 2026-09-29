/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ReportServiceForm } from './ReportServiceForm';
import { SidePanelApp } from '../SidePanelApp';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import { stubSession } from '../../../testing/session';
import matchNone from '../../../testing/fixtures/match-none.json';

/** Opens the report-a-service form, which the card offers for an untracked site. */
async function openReportService(user: UserEvent, pageUrl: string): Promise<FakeApi> {
  const api = fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/submissions', { status: 201, json: { id: 'receipt' } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report a Service' });
  return api;
}

describe('the report a service form', () => {
  it('sends the service with the page address it was opened on', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://untracked.example/download');

    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Untracked Download');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));

    await screen.findByRole('heading', { name: 'Report received' });
    const sent = api.callsTo('POST', '/submissions');
    expect(sent).toHaveLength(1);
    expect(sent.at(0)?.url).toBe(`${API_BASE}/submissions`);
    expect(sent.at(0)?.json).toEqual({
      name: 'Untracked Download',
      url: 'https://untracked.example',
      description: null,
      submitterEmail: null,
      evidenceUrls: [],
      locale: 'en',
    });
  });

  it('blocks sending while the service has no name', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://another-untracked.example/');

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Report' });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Enter the service name.')).toBeDefined();

    await user.click(submit);
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
  });

  it('shows the API message and keeps what was typed when the send fails', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: matchNone })
      .on('POST', '/submissions', { status: 422, json: { error: 'INVALID', message: 'Name is already tracked' } })
      .install();

    await openPanel('https://failed-send.example/download');
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Report a Service' });

    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Half typed Service');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));

    await screen.findByText('Name is already tracked');
    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', 'Half typed Service');
    expect(api.callsTo('POST', '/submissions')).toHaveLength(1);
  });
});

it('prefills the next form and Settings with the email from a successful report', async () => {
  const user = userEvent.setup();
  await openReportService(user, 'https://remember.example/');
  await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Example');
  await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'tester@example.com');
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await screen.findByRole('heading', { name: 'Report received' });
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveProperty('value', 'tester@example.com'),
  );
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveProperty('value', 'tester@example.com'),
  );
  await user.clear(screen.getByRole('textbox', { name: 'Your email' }));
  await user.click(screen.getByRole('button', { name: 'Save email' }));
  await screen.findByText('Saved');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveProperty('value', ''));
});

it('offers to discard an earlier send that could not be confirmed, then sends the new details', async () => {
  const user = userEvent.setup();
  let sends = 0;
  const api = fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/submissions', () =>
      (sends += 1) === 1
        ? { status: 503, json: { error: 'UNAVAILABLE', message: 'Try later' } }
        : { status: 201, json: { id: 'receipt' } },
    )
    .on('POST', '/submission-receipts', { json: { state: 'unconfirmed' } })
    .install();
  await openPanel('https://unconfirmed.example/');
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));

  const name = await screen.findByRole('textbox', { name: 'Service name' });
  await user.clear(name);
  await user.type(name, 'First');
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await screen.findByText('Try later');
  expect(screen.queryByRole('button', { name: 'Discard earlier attempt' })).toBeNull();

  await user.type(name, ' edited');
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await user.click(await screen.findByRole('button', { name: 'Discard earlier attempt' }));
  await screen.findByText('The earlier attempt was discarded. Send again to submit these details.');

  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await screen.findByRole('heading', { name: 'Report received' });
  const [first, second] = api.callsTo('POST', '/submissions');
  expect(second?.json).toMatchObject({ name: 'First edited' });
  expect(second?.headers['Idempotency-Key']).not.toBe(first?.headers['Idempotency-Key']);
});

/** The form on its own, for what depends only on the page it was opened from. */
async function renderForm(pageTitle: string | null): Promise<HTMLInputElement> {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  stubSession();
  fakeApi().install();
  render(<ReportServiceForm url="https://untracked.example" pageTitle={pageTitle} onBack={() => undefined} />);
  return screen.getByRole<HTMLInputElement>('textbox', { name: 'Service name' });
}

describe('the suggested name', () => {
  it.each([
    ['the first segment of the page title', 'Untracked Download | Best downloads - Home', 'Untracked Download'],
    ['a title split on an en dash', 'Sign in – Untracked', 'Sign in'],
    ['a title with no separator, trimmed', '  Plain Title  ', 'Plain Title'],
    ['a hyphenated word kept whole', 'E-mail portal', 'E-mail portal'],
    ['nothing, when the page has no title', null, ''],
  ])('comes from %s', async (_label, title, expected) => {
    expect((await renderForm(title)).value).toBe(expected);
  });

  it('is capped at 80 characters', async () => {
    expect((await renderForm('x'.repeat(100))).value).toHaveLength(80);
  });
});

describe('what the form sends', () => {
  it('includes the description when one is written', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://described.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Described Service');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), '  Blocks Syria at login.  ');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    await screen.findByRole('heading', { name: 'Report received' });
    expect(api.callsTo('POST', '/submissions').at(0)?.json).toMatchObject({ description: 'Blocks Syria at login.' });
  });

  it('refuses an email that is not one, without a request', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://email.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Some Service');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
  });
});

it('says so when the earlier attempt cannot be discarded', async () => {
  const user = userEvent.setup();
  fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/submissions', { status: 503, json: { error: 'UNAVAILABLE', message: 'Try later' } })
    .on('POST', '/submission-receipts', { json: { state: 'unconfirmed' } })
    .install();
  await openPanel('https://undiscardable.example/');
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));

  const name = await screen.findByRole('textbox', { name: 'Service name' });
  await user.type(name, 'First');
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));
  await screen.findByText('Try later');
  await user.type(name, ' edited');
  await user.click(screen.getByRole('button', { name: 'Submit Report' }));

  vi.spyOn(fakeBrowser.storage.session, 'remove').mockRejectedValueOnce(new Error('quota'));
  await user.click(await screen.findByRole('button', { name: 'Discard earlier attempt' }));
  await screen.findByText(
    'Could not save a delivery receipt in this browser. Nothing was sent. Reopen the panel and try again.',
  );
});

/** The report a service draft held for this page's address, or nothing. */
const storedServiceDraft = async (): Promise<unknown> => {
  const all = await chrome.storage.session.get(null);
  const key = Object.keys(all).find((entry) => entry.startsWith('draft:report-service:'));
  return key === undefined ? undefined : all[key];
};

describe('keeping the report a service form across a closed panel', () => {
  it('brings the name back, and lets the draft go once the report is sent', async () => {
    const user = userEvent.setup();
    await openReportService(user, 'https://untracked.example/download');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Half typed Service');
    // The write lands half a second after the typing stops.
    await vi.waitFor(async () => {
      expect(await storedServiceDraft()).toBeDefined();
    });

    cleanup();
    render(<SidePanelApp />);
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }));
    await screen.findByRole('heading', { name: 'Report a Service' });

    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', 'Half typed Service');

    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    await screen.findByRole('heading', { name: 'Report received' });
    expect(await storedServiceDraft()).toBeUndefined();
  });
});
