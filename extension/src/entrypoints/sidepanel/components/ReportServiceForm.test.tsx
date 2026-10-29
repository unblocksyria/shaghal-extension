/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sentHistory } from '../../../lib/history';
import { ReportServiceForm } from './ReportServiceForm';
import { SidePanelApp } from '../SidePanelApp';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel, stubScreenshot, pressSend } from '../../../testing/panel';
import { closeEditorWindows } from '../../../testing/editorWindows';
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
    await pressSend(user, 'Submit Report');

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
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Enter the service name.')).toBeDefined();
    // Blocked but still reachable by Tab, and it says why.
    expect(submit.disabled).toBe(false);
    expect(document.getElementById(submit.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Enter the service name.',
    );
    expect(screen.getByRole('textbox', { name: 'Service name' }).getAttribute('aria-required')).toBe('true');

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
    await pressSend(user, 'Submit Report');

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
  await pressSend(user, 'Submit Report');
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
  await pressSend(user, 'Submit Report');
  await screen.findByText('Try later');
  expect(screen.queryByRole('button', { name: 'Discard earlier attempt' })).toBeNull();

  await user.type(name, ' edited');
  await pressSend(user, 'Submit Report');
  await user.click(await screen.findByRole('button', { name: 'Discard earlier attempt' }));
  await screen.findByText('The earlier attempt was discarded. Send again to submit these details.');

  await pressSend(user, 'Submit Report');
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
    await pressSend(user, 'Submit Report');
    await screen.findByRole('heading', { name: 'Report received' });
    expect(api.callsTo('POST', '/submissions').at(0)?.json).toMatchObject({ description: 'Blocks Syria at login.' });
  });

  it('refuses an email that is not one, without a request', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://email.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Some Service');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');
    await pressSend(user, 'Submit Report');
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);

    // The error belongs to the field: it marks it, describes it and takes the tester back to it.
    const email = screen.getByRole('textbox', { name: 'Your email' });
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(document.activeElement).toBe(email);

    await user.type(email, '@example.com');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(email.hasAttribute('aria-invalid')).toBe(false);
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
  await pressSend(user, 'Submit Report');
  await screen.findByText('Try later');
  await user.type(name, ' edited');
  await pressSend(user, 'Submit Report');

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

    await pressSend(user, 'Submit Report');
    await screen.findByRole('heading', { name: 'Report received' });
    expect(await storedServiceDraft()).toBeUndefined();
  });

  it('keeps what happens from Syria across a closed panel, and a second press unchooses it', async () => {
    const user = userEvent.setup();
    await openReportService(user, 'https://symptom-draft.example/');
    await user.click(screen.getByRole('button', { name: "It doesn't load" }));
    await vi.waitFor(async () => {
      expect(await storedServiceDraft()).toBeDefined();
    });

    cleanup();
    render(<SidePanelApp />);
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }));
    const chip = await screen.findByRole('button', { name: "It doesn't load" });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('starts from whatever the record held, even when it holds no name, description or email', async () => {
    const user = userEvent.setup();
    await openReportService(user, 'https://partial.example/download');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Typed Service');
    await vi.waitFor(async () => {
      expect(await storedServiceDraft()).toBeDefined();
    });

    // A record written by an older build, or one that shed a field on the way.
    const all = await chrome.storage.session.get(null);
    const key = Object.keys(all).find((entry) => entry.startsWith('draft:report-service:'));
    const record = key === undefined ? undefined : all[key];
    if (key === undefined || typeof record !== 'object' || record === null) throw new Error('No draft to rewrite.');
    await chrome.storage.session.set({ [key]: { ...record, fields: {} } });

    cleanup();
    await openPanel('https://partial.example/download', { keepSession: true });
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }));
    await screen.findByRole('heading', { name: 'Report a Service' });

    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', '');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty('value', '');
    expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveProperty('value', '');
  });

  it('keys the draft to the raw page address when the address carries no site', async () => {
    const user = userEvent.setup();
    await Promise.resolve(fakeBrowser.reset());
    vi.stubGlobal('chrome', fakeBrowser);
    stubSession();
    fakeApi().install();
    render(<ReportServiceForm url="ftp://files.example/download" pageTitle="Files" onBack={() => undefined} />);

    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Filed Transfer');
    await vi.waitFor(async () => {
      expect(await storedServiceDraft()).toBeDefined();
    });
    // Nothing to reduce the address to, so the address itself is what the record is held under.
    expect(await chrome.storage.session.get('draft:report-service:ftp://files.example/download')).toHaveProperty(
      'draft:report-service:ftp://files.example/download',
    );
  });

  it('brings a screenshot back with the name it was captured beside', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    await openReportService(user, 'https://shots.example/download');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Half typed Service');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();
    await vi.waitFor(async () => {
      expect(await storedServiceDraft()).toBeDefined();
    });

    cleanup();
    await openPanel('https://shots.example/download', { keepSession: true });
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }));
    await screen.findByRole('heading', { name: 'Report a Service' });

    expect(await screen.findByAltText('Evidence #1')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Service name' })).toHaveProperty('value', 'Half typed Service');
  });
});

describe('helping the reviewer', () => {
  it('says when someone already sent the site, and still lets the tester send', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: matchNone })
      .on('GET', '/check-duplicate', { json: { hasDuplicate: true, duplicateType: 'pending' } })
      .on('POST', '/submissions', { status: 201, json: { id: 'receipt' } })
      .install();
    await openPanel('https://waiting.example/');
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));

    expect((await screen.findByRole('status')).textContent).toContain('Someone already sent this site');
    expect(new URL(api.callsTo('GET', '/check-duplicate').at(-1)!.url).searchParams.get('url')).toBe(
      'https://waiting.example',
    );
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Waiting Service');
    await pressSend(user, 'Submit Report');
    await screen.findByRole('heading', { name: 'Report received' });
  });

  it('shows nothing when the duplicate check fails', async () => {
    const user = userEvent.setup();
    const api = fakeApi()
      .on('POST', '/services/match', { data: matchNone })
      .on('GET', '/check-duplicate', { status: 500, json: { error: 'DOWN' } })
      .install();
    await openPanel('https://unchecked.example/');
    await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
    await waitFor(() => expect(api.callsTo('GET', '/check-duplicate')).toHaveLength(1));
    expect(screen.queryByText(/Someone already sent this site/)).toBeNull();
  });

  it('opens the description with what happens from Syria, in the words reviewers read', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://symptom.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Region Locked');
    await user.click(screen.getByRole('button', { name: '"Not available in your region"' }));
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Shown right after sign-up.');
    await pressSend(user, 'Submit Report');
    await screen.findByRole('heading', { name: 'Report received' });
    expect(api.callsTo('POST', '/submissions').at(0)?.json).toMatchObject({
      description: 'From Syria: It says it is not available in this country or region.\nShown right after sign-up.',
    });
  });

  it('asks once before sending without a screenshot, and can take the tester to the field', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://bare.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Bare Service');
    await user.click(screen.getByRole('button', { name: 'Submit Report' }));

    const prompt = screen.getByRole('alert');
    expect(prompt.textContent).toContain('Screenshots are how we verify a new service');
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Add a screenshot' }));
    expect(document.activeElement?.textContent).toBe('Add screenshot');

    await user.click(screen.getByRole('button', { name: 'Submit Report' }));
    await user.click(screen.getByRole('button', { name: 'Send anyway' }));
    await screen.findByRole('heading', { name: 'Report received' });
    expect(api.callsTo('POST', '/submissions')).toHaveLength(1);
  });

  it('records what was sent in this browser', async () => {
    const user = userEvent.setup();
    await openReportService(user, 'https://recorded.example/');
    await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Recorded Service');
    await pressSend(user, 'Submit Report');
    await screen.findByRole('heading', { name: 'Report received' });
    await waitFor(async () =>
      expect(await sentHistory()).toEqual([
        { kind: 'service', serviceName: 'Recorded Service', at: expect.any(Number) as number },
      ]),
    );
  });
});

it('goes back to the card when a service from the list after sending is opened', async () => {
  const user = userEvent.setup();
  const wiseRow = {
    id: 'svc-wise',
    name: 'Wise',
    slug: 'wise',
    url: 'https://wise.com',
    logoUrl: null,
    availability: 'blocked',
    voteCount: 705,
    statusCheckedAt: null,
    company: null,
  };
  fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/submissions', { status: 201, json: { id: 'receipt' } })
    .on('GET', '/services', (call) => ({
      data: new URL(call.url).searchParams.get('needs_retesting') === 'true' ? [wiseRow] : [],
    }))
    .install();
  await openPanel('https://after-send.example/');
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
  await user.type(screen.getByRole('textbox', { name: 'Service name' }), 'Sent Service');
  await pressSend(user, 'Submit Report');
  await screen.findByRole('heading', { name: 'Report received' });

  const wise = await screen.findByRole('link', { name: /Wise/ });
  expect(wise.getAttribute('href')).toBe('https://wise.com/');
  await user.click(wise);
  expect(screen.queryByRole('heading', { name: 'Report received' })).toBeNull();
  expect(await screen.findByRole('heading', { name: "after-send.example isn't tracked yet" })).toBeDefined();
});
