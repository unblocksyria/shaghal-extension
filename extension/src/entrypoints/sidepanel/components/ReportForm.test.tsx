/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { closeEditorWindows } from '../../../testing/editorWindows';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeAnswer, type FakeApi, type FakeResponder } from '../../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../../testing/panel';
import functionalities from '../../../testing/fixtures/functionalities.json';
import match from '../../../testing/fixtures/match.json';
import serviceRecord from '../../../testing/fixtures/service-record.json';
import upload from '../../../testing/fixtures/upload.json';

/** Opens the report form from the card, as a tester would. */
async function openReport(user: UserEvent, pageUrl: string): Promise<FakeApi> {
  const api = fakeApi()
    .on('POST', '/services/match', { data: match })
    .on('GET', '/services/netflix', { data: serviceRecord })
    .on('GET', '/functionalities', { data: functionalities })
    .on('POST', '/functionality-reports', { status: 201, json: { id: 'receipt' } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report what works' });
  return api;
}

describe('the report form', () => {
  it('sends what the tester marked, in the body the API expects', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://watch.example/films');

    const coreUse = screen.getByRole('radiogroup', { name: 'Core use' });
    await user.click(within(coreUse).getByRole('radio', { name: 'Works' }));
    await user.type(screen.getByPlaceholderText('What happened?'), 'The login page opened first try.');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(screen.queryByText(/Turn off your VPN/)).toBeNull();

    const sent = api.callsTo('POST', '/functionality-reports');
    expect(sent).toHaveLength(1);
    expect(sent.at(0)?.url).toBe(`${API_BASE}/functionality-reports`);
    expect(sent.at(0)?.headers?.['Content-Type']).toBe('application/json');
    expect(sent.at(0)?.headers?.['Idempotency-Key']).toMatch(/^\d{13}\./);
    expect(sent.at(0)?.json).toEqual({
      serviceId: 'svc-netflix',
      items: [{ slug: 'core_use', level: 'working', description: 'The login page opened first try.' }],
      submitterEmail: null,
      locale: 'en',
    });
  });

  it('blocks sending until a part is marked, and until a contradiction carries detail', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://third.example/page');

    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' });
    expect(send.disabled).toBe(true);
    expect(screen.getByText('Mark at least one as working or failing.')).toBeDefined();

    const coreUse = screen.getByRole('radiogroup', { name: 'Core use' });
    await user.click(within(coreUse).getByRole('radio', { name: 'Works' }));
    expect(send.disabled).toBe(false);

    // Marking a part that contradicts the record still needs a note or a screenshot.
    await user.click(send);
    await screen.findByText('Add a note or a screenshot to every part you marked.');
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it('warns when the connection comes out of another country', async () => {
    const user = userEvent.setup();
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: serviceRecord })
      .on('GET', '/functionalities', { data: functionalities })
      .on('GET', '/cdn-cgi/trace', { text: 'fl=v8\nloc=DE\nts=1758000000\n' })
      .install();

    await openPanel('https://vpn.example/films');
    await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Report what works' });

    await screen.findByText(/browsing from Germany, not Syria/);
    expect(screen.getByText(/Turn off your VPN\./)).toBeDefined();
  });

  it('refuses more than 30 parts in the panel language', async () => {
    const user = userEvent.setup();
    const parts = Array.from({ length: 31 }, (_, index) => ({
      slug: `part_${index}`,
      name: `Part ${index}`,
      level: 'unknown',
    }));
    const api = fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: { ...serviceRecord, functionalities: parts } })
      .on('GET', '/functionalities', { data: [] })
      .install();
    await openPanel('https://many.example/', { language: 'ar' });
    await user.click(await screen.findByRole('button', { name: 'أبلغ عمّا يعمل' }, { timeout: 3000 }));

    for (const part of parts) {
      await user.click(
        within(screen.getByRole('radiogroup', { name: part.name })).getByRole('radio', { name: 'يعمل' }),
      );
      fireEvent.change(screen.getByRole('textbox', { name: `ملاحظات ${part.name}` }), { target: { value: 'Opens.' } });
    }
    await user.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));

    expect(
      await screen.findByText('يمكن أن يتضمن البلاغ 30 جزءاً و100 لقطة شاشة كحدّ أقصى. أزل بعضها قبل الإرسال.'),
    ).toBeDefined();
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
    // 31 parts clicked one by one: worth more than the default allowance on a busy machine.
  }, 30_000);
});

/** The report form for a service that records no parts yet. */
async function openBlankReport(
  user: UserEvent,
  pageUrl: string,
  catalogue: FakeAnswer | FakeResponder,
): Promise<FakeApi> {
  const api = fakeApi()
    .on('POST', '/services/match', { data: match })
    .on('GET', '/services/netflix', { data: { ...serviceRecord, functionalities: [] } })
    .on('GET', '/functionalities', catalogue)
    .on('POST', '/functionality-reports', { status: 201, json: { id: 'receipt' } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report what works' });
  return api;
}

/** The part's own controls: its notes and screenshot field, once it is marked. */
const partOf = (name: string) => within(screen.getByRole('radiogroup', { name }).parentElement as HTMLElement);

describe('a service with no recorded parts', () => {
  it('offers the two parts every service has, as not recorded, and lets one be dropped', async () => {
    const user = userEvent.setup();
    const api = await openBlankReport(user, 'https://blank.example/', { data: functionalities });

    expect(await screen.findByRole('radiogroup', { name: 'Core use' })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: 'Landing page' })).toBeDefined();
    expect(screen.getAllByText('Not recorded yet')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Remove Landing page' }));
    expect(screen.queryByRole('radiogroup', { name: 'Landing page' })).toBeNull();

    // Unrecorded counts as unknown, so Works contradicts it and needs detail.
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Works' }),
    );
    expect(screen.getByText('Required: a note or a screenshot showing this.')).toBeDefined();
    await user.type(screen.getByPlaceholderText('What happened?'), 'Opens.');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(api.callsTo('POST', '/functionality-reports').at(0)?.json).toMatchObject({
      items: [{ slug: 'core_use', level: 'working', description: 'Opens.' }],
    });
  });

  it('still offers them by their built-in names when the catalogue fails, and Try again brings the rest', async () => {
    const user = userEvent.setup();
    let failing = true;
    const api = await openBlankReport(user, 'https://catalogue-down.example/', () =>
      failing ? { status: 500, json: { error: 'UPSET', message: 'The catalogue is down' } } : { data: functionalities },
    );

    expect(await screen.findByRole('radiogroup', { name: 'Core use' })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: 'Landing page' })).toBeDefined();
    expect(screen.getByText('Could not load the other parts you can add.')).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Add a part you tried' })).toBeNull();

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('combobox', { name: 'Add a part you tried' });
    expect(screen.queryByText('Could not load the other parts you can add.')).toBeNull();
    expect(api.callsTo('GET', '/functionalities')).toHaveLength(2);
  });
});

describe('adding a part', () => {
  it('adds a part from the catalogue, and forgets its answer when it is removed', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://add-part.example/');

    const picker = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Add a part you tried' });
    expect([...picker.options].map((option) => option.textContent)).toEqual(['Choose a part', 'Sign up', 'Payments']);
    await user.selectOptions(picker, 'sign_up');

    const signUp = screen.getByRole('radiogroup', { name: 'Sign up' });
    expect(screen.getByText('Not recorded yet')).toBeDefined();
    expect([...picker.options].map((option) => option.textContent)).toEqual(['Choose a part', 'Payments']);
    await user.click(within(signUp).getByRole('radio', { name: 'Works' }));
    await user.type(screen.getByRole('textbox', { name: 'Notes for Sign up' }), 'Signed up fine.');

    await user.click(screen.getByRole('button', { name: 'Remove Sign up' }));
    expect(screen.queryByRole('radiogroup', { name: 'Sign up' })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' }).disabled).toBe(true);

    // Added again, it starts over.
    await user.selectOptions(picker, 'sign_up');
    const again = screen.getByRole('radiogroup', { name: 'Sign up' });
    expect(within(again).getByRole('radio', { name: 'Not checked' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('textbox', { name: 'Notes for Sign up' })).toBeNull();
  });
});

describe('confirming what is recorded', () => {
  it('counts a part marked as recorded only once a note or screenshot backs it', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://confirm.example/');
    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' });

    // Core use is recorded as failing.
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Fails' }),
    );
    expect(screen.getByText('Same as recorded. Add a note or a screenshot to confirm it again.')).toBeDefined();
    expect(send.disabled).toBe(true);

    await user.type(screen.getByPlaceholderText('What happened?'), 'Still fails today.');
    expect(screen.queryByText(/Same as recorded/)).toBeNull();
    expect(send.disabled).toBe(false);
    await user.click(send);
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(api.callsTo('POST', '/functionality-reports').at(0)?.json).toMatchObject({
      items: [{ slug: 'core_use', level: 'failing', description: 'Still fails today.' }],
    });
  });
});

describe('what stops a report', () => {
  it('refuses an email that is not one, without a request', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://email.example/');
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Works' }),
    );
    await user.type(screen.getByPlaceholderText('What happened?'), 'Opens.');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it('shows why a screenshot could not be uploaded, and stays sendable', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const api = await openReport(user, 'https://upload.example/');
    api.on('POST', '/uploads/evidence', { status: 500, json: { error: 'UPSET', message: 'Upload refused' } });
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Works' }),
    );
    await user.click(partOf('Core use').getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A screenshot could not be uploaded: Upload refused');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' }).disabled).toBe(false);
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it("shows the API's refusal and keeps the draft", async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://refused.example/');
    api.on('POST', '/functionality-reports', { status: 422, json: { error: 'INVALID', message: 'Report refused' } });
    const coreUse = screen.getByRole('radiogroup', { name: 'Core use' });
    await user.click(within(coreUse).getByRole('radio', { name: 'Works' }));
    await user.type(screen.getByPlaceholderText('What happened?'), 'Opens.');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Report refused');
    expect(within(coreUse).getByRole('radio', { name: 'Works' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByPlaceholderText('What happened?')).toHaveProperty('value', 'Opens.');
  });
});

it("frees a removed part's screenshots", async () => {
  const user = userEvent.setup();
  stubScreenshot();
  const revoke = vi.fn();
  URL.revokeObjectURL = revoke;
  await openBlankReport(user, 'https://free.example/', { data: functionalities });

  const landing = await screen.findByRole('radiogroup', { name: 'Landing page' });
  await user.click(within(landing).getByRole('radio', { name: 'Works' }));
  await user.click(partOf('Landing page').getByRole('button', { name: 'Add screenshot' }));
  await screen.findByAltText('Evidence #1');
  await closeEditorWindows();

  await user.click(screen.getByRole('button', { name: 'Remove Landing page' }));
  expect(screen.queryByAltText('Evidence #1')).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:fake-evidence');
});

/** The report draft held for the fixture's service, or nothing. */
const storedReport = async (): Promise<unknown> => {
  const all = await chrome.storage.session.get(null);
  return all['draft:report:svc-netflix'];
};

/** The write lands half a second after the typing stops. */
const waitForDraft = async () => {
  await vi.waitFor(async () => {
    expect(await storedReport()).toBeDefined();
  });
};

/** What the panel looks like after being closed and opened again. */
const reopenPanel = async (user: UserEvent, pageUrl: string) => {
  cleanup();
  await openPanel(pageUrl, { keepSession: true });
  await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report what works' });
};

const markAndNote = async (user: UserEvent, note: string) => {
  await user.click(within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Works' }));
  await user.type(screen.getByPlaceholderText('What happened?'), note);
};

describe('keeping the report across a closed panel', () => {
  it('brings the mark and the note back, and lets the draft go once the report is sent', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://draft.example/');
    await markAndNote(user, 'Opens after the first try.');
    await waitForDraft();

    await reopenPanel(user, 'https://draft.example/');
    const coreUse = await screen.findByRole('radiogroup', { name: 'Core use' });
    expect(within(coreUse).getByRole('radio', { name: 'Works' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByPlaceholderText('What happened?')).toHaveProperty('value', 'Opens after the first try.');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(await storedReport()).toBeUndefined();
  });

  it('treats the restored report as work in progress, and forgets it when the tester chooses discard', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://guard.example/');
    await markAndNote(user, 'Opens.');
    await waitForDraft();

    await reopenPanel(user, 'https://guard.example/');
    await user.click(screen.getByRole('button', { name: 'Back to Netflix' }));
    expect(await screen.findByText('Discard this draft?')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard this draft?')).toBeNull();
    expect(await storedReport()).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Back to Netflix' }));
    await user.click(await screen.findByRole('button', { name: 'Discard draft' }));
    expect(await storedReport()).toBeUndefined();
    await screen.findByRole('button', { name: 'Report what works' });
  });

  it("leaves another service's stored report alone", async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://elsewhere.example/');
    await chrome.storage.session.set({
      'draft:report:svc-other': {
        schema: 1,
        form: 'report',
        serviceKey: 'svc-other',
        savedAt: 1,
        fields: { partSlugs: [], levels: {}, touched: {}, notes: { core_use: 'Not this service.' } },
        shots: [],
      },
    });

    await reopenPanel(user, 'https://elsewhere.example/');
    const coreUse = screen.getByRole('radiogroup', { name: 'Core use' });
    expect(within(coreUse).getByRole('radio', { name: 'Works' }).getAttribute('aria-checked')).not.toBe('true');
    expect(screen.queryByPlaceholderText('What happened?')).toBeNull();
    expect(await chrome.storage.session.get(null)).toHaveProperty('draft:report:svc-other');
  });

  it('keeps the stored report when the API refuses it', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://refused-draft.example/');
    api.on('POST', '/functionality-reports', { status: 422, json: { error: 'INVALID', message: 'Report refused' } });
    await markAndNote(user, 'Opens.');

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('alert');
    await waitForDraft();
    expect(await storedReport()).toBeDefined();
  });

  it('opens empty and quiet when the stored record is unreadable', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://corrupt.example/');
    await chrome.storage.session.set({ 'draft:report:svc-netflix': { schema: 99, nonsense: true } });

    await reopenPanel(user, 'https://corrupt.example/');
    const coreUse = screen.getByRole('radiogroup', { name: 'Core use' });
    expect(within(coreUse).getByRole('radio', { name: 'Works' }).getAttribute('aria-checked')).not.toBe('true');
    expect(screen.queryByPlaceholderText('What happened?')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The unusable record is dropped, so the next open starts clean too.
    expect(await chrome.storage.session.get(null)).toEqual({});
  });

  it('brings a screenshot back as a thumbnail, and sends the bytes that were captured', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const api = await openReport(user, 'https://shots.example/');
    api.on('POST', '/uploads/evidence', { json: upload });
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Core use' })).getByRole('radio', { name: 'Works' }),
    );
    await user.click(partOf('Core use').getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();
    await waitForDraft();

    await reopenPanel(user, 'https://shots.example/');
    expect(await screen.findByAltText('Evidence #1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Report sent' });

    const uploads = api.callsTo('POST', '/uploads/evidence');
    expect(uploads).toHaveLength(1);
    // The stub's capture decodes to five bytes. Re-encoding would change that.
    expect((uploads.at(0)?.body as FormData).get('file')).toMatchObject({ size: 5, type: 'image/jpeg' });
    expect(api.callsTo('POST', '/functionality-reports').at(0)?.json).toMatchObject({
      items: [{ slug: 'core_use', evidenceUrls: [upload.file.url] }],
    });
  });
});
