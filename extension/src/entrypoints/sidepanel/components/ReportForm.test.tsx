/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { sentHistory } from '../../../lib/history';
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

/** What a test can change about the service and the catalogue the form reads. */
interface Setup {
  record?: unknown;
  catalogue?: FakeAnswer | FakeResponder;
  match?: unknown;
}

/** Answers the routes the card and the form read, and the report itself. */
function installApi(setup: Setup = {}): FakeApi {
  return fakeApi()
    .on('POST', '/services/match', { data: setup.match ?? match })
    .on('GET', '/services/netflix', { data: setup.record ?? serviceRecord })
    .on('GET', '/functionalities', setup.catalogue ?? { data: functionalities })
    .on('POST', '/functionality-reports', { status: 201, json: { id: 'receipt' } })
    .install();
}

/**
 * Opens the report form from the card, as a tester would. The fixture's record
 * has core use failing and the landing page working, neither with a date.
 */
async function openReport(user: UserEvent, pageUrl: string, setup: Setup = {}): Promise<FakeApi> {
  const api = installApi(setup);
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report what works' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report what works' });
  return api;
}

/** The fixture's record with its parts replaced. */
const recordWith = (parts: object[]) => ({ ...serviceRecord, functionalities: parts });

/** Presses a part's chip under "What did you try?", choosing it or leaving it out. */
const choose = (user: UserEvent, name: string) => user.click(screen.getByRole('button', { name }));

/** Answers a chosen part with one of the two words it offers. */
const answer = (user: UserEvent, part: string, label: string) =>
  user.click(within(screen.getByRole('radiogroup', { name: part })).getByRole('radio', { name: label }));

/** A chosen part's own controls: its record line, answer, note and screenshots. */
const partGroup = (name: string) => within(screen.getByRole('group', { name }));

const noteFor = (part: string) => screen.getByRole<HTMLTextAreaElement>('textbox', { name: `Notes for ${part}` });

const sendButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' });

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

/** The chips under "What did you try?", in the order the tester sees them. */
const chipNames = () =>
  within(screen.getByRole('group', { name: 'What did you try?' }))
    .getAllByRole('button')
    .map((button) => button.textContent?.trim());

/** The JSON of the nth report sent, oldest first. */
const reportBody = (api: FakeApi, index = 0) =>
  api.callsTo('POST', '/functionality-reports').at(index)?.json as Record<string, unknown> & {
    items: Record<string, unknown>[];
  };

/** Answers core use as working with a note and sends, for tests about something else. */
const sendCoreUseWorks = async (user: UserEvent, note = 'Opens.') => {
  await choose(user, 'Core use');
  await answer(user, 'Core use', 'Works now');
  await user.type(noteFor('Core use'), note);
  await user.click(sendButton());
};

describe('choosing what was tried', () => {
  it("opens with nothing chosen, offering the service's own parts with core use first", async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://choose.example/', {
      record: recordWith([
        { slug: 'landing_page', name: 'Landing page', level: 'working' },
        { slug: 'core_use', name: 'Core use', level: 'failing' },
      ]),
    });

    expect(chipNames()).toEqual(['Core use', 'Landing page', 'More parts', 'Something else']);
    expect(pressed('Core use')).toBe('false');
    expect(pressed('Landing page')).toBe('false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Choose at least one part you tried.')).toBeDefined();

    await choose(user, 'Landing page');
    expect(pressed('Landing page')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Landing page' })).toBeDefined();
    expect(screen.getByText('Say whether Landing page works.')).toBeDefined();
  });

  it("offers the rest of the catalogue under More parts, but never the catalogue's catch-all", async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://more.example/', {
      catalogue: { data: [...functionalities, { slug: 'unspecified', name: 'Unspecified' }] },
    });

    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More parts' }));
    expect(chipNames()).toEqual(['Core use', 'Landing page', 'Sign up', 'Payments', 'Something else']);
    expect(screen.queryByRole('button', { name: 'Unspecified' })).toBeNull();

    await choose(user, 'Sign up');
    expect(partGroup('Sign up').getByText('Nobody has checked this from Syria yet.')).toBeDefined();
  });

  it("opens with the part already chosen when the card's Test this opened it", async () => {
    const user = userEvent.setup();
    installApi({
      record: recordWith([...serviceRecord.functionalities, { slug: 'sign_up', name: 'Sign up', level: 'unknown' }]),
    });
    await openPanel('https://test-this.example/');
    await user.click(await screen.findByRole('button', { name: 'Test this Sign up' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Report what works' });

    expect(pressed('Sign up')).toBe('true');
    expect(pressed('Core use')).toBe('false');
    expect(screen.getByRole('radiogroup', { name: 'Sign up' })).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Core use' })).toBeNull();
  });

  it('opens with core use and the landing page chosen from Test it from Syria', async () => {
    const user = userEvent.setup();
    installApi({
      match: { ...match, service: { ...match.service, availability: 'unknown' } },
      record: recordWith([]),
    });
    await openPanel('https://unchecked.example/');
    await user.click(await screen.findByRole('button', { name: 'Test it from Syria' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Report what works' });

    expect(pressed('Core use')).toBe('true');
    expect(pressed('Landing page')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Core use' })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: 'Landing page' })).toBeDefined();
  });

  it('shows what the record says beside each part, and words the answers against it', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://record.example/', {
      record: recordWith([
        { slug: 'core_use', name: 'Core use', level: 'failing', lastObservedAt: '2026-09-14T10:00:00.000Z' },
        { slug: 'landing_page', name: 'Landing page', level: 'working' },
        { slug: 'sign_up', name: 'Sign up', level: 'unknown' },
      ]),
    });
    await choose(user, 'Core use');
    await choose(user, 'Landing page');
    await choose(user, 'Sign up');
    await user.click(screen.getByRole('button', { name: 'More parts' }));
    await choose(user, 'Payments');

    const labels = (part: string) =>
      within(screen.getByRole('radiogroup', { name: part }))
        .getAllByRole('radio')
        .map((radio) => radio.textContent);

    // September can come out as "Sep" or "Sept" depending on the ICU build.
    expect(partGroup('Core use').getByText(/^On record: Fails, checked 14 Sept? 2026$/)).toBeDefined();
    expect(labels('Core use')).toEqual(['Still fails', 'Works now']);
    expect(partGroup('Landing page').getByText('On record: Works')).toBeDefined();
    expect(labels('Landing page')).toEqual(['Still works', 'Fails now']);
    expect(partGroup('Sign up').getByText('Nobody has checked this from Syria yet.')).toBeDefined();
    expect(labels('Sign up')).toEqual(['Works', 'Fails']);
    // A part the service does not record at all reads the same as an unchecked one.
    expect(partGroup('Payments').getByText('Nobody has checked this from Syria yet.')).toBeDefined();
    expect(labels('Payments')).toEqual(['Works', 'Fails']);
  });
});

describe('what stops a report', () => {
  it('keeps Send disabled and says why, until every chosen part is answered and backed', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://blockers.example/');

    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Choose at least one part you tried.')).toBeDefined();

    await choose(user, 'Core use');
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Say whether Core use works.')).toBeDefined();
    // The note and screenshots wait for an answer.
    expect(screen.queryByRole('textbox', { name: 'Notes for Core use' })).toBeNull();

    await answer(user, 'Core use', 'Still fails');
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Add a note or a screenshot for Core use.')).toBeDefined();
    const coreUse = partGroup('Core use');
    expect(coreUse.getByRole('textbox', { name: 'Notes for Core use' })).toBeDefined();
    expect(coreUse.getByText('Leave out your email, phone, and account or ticket numbers.')).toBeDefined();
    expect(coreUse.getByRole('button', { name: 'Add screenshot' })).toBeDefined();
    expect(coreUse.getByText('Add a note or a screenshot showing this.')).toBeDefined();

    // Spaces are not a note.
    await user.type(noteFor('Core use'), '   ');
    expect(sendButton().disabled).toBe(true);
    await user.type(noteFor('Core use'), 'Spins forever.');
    expect(coreUse.queryByText('Add a note or a screenshot showing this.')).toBeNull();
    expect(sendButton().disabled).toBe(false);
    expect(screen.getByText('Anything you mark is reviewed before it changes the record.')).toBeDefined();

    // A second part blocks again until it is answered too.
    await choose(user, 'Landing page');
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Say whether Landing page works.')).toBeDefined();
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it('refuses an email that is not one, without a request', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://email.example/');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');
    await sendCoreUseWorks(user);

    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it('shows why a screenshot could not be uploaded, and stays sendable', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const api = await openReport(user, 'https://upload.example/');
    api.on('POST', '/uploads/evidence', { status: 500, json: { error: 'UPSET', message: 'Upload refused' } });
    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Works now');
    await user.click(partGroup('Core use').getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();

    await user.click(sendButton());
    expect((await screen.findByRole('alert')).textContent).toBe('A screenshot could not be uploaded: Upload refused');
    expect(sendButton().disabled).toBe(false);
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
  });

  it("shows the API's refusal and keeps what the tester entered", async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://refused.example/');
    api.on('POST', '/functionality-reports', { status: 422, json: { error: 'INVALID', message: 'Report refused' } });
    await sendCoreUseWorks(user);

    expect((await screen.findByRole('alert')).textContent).toBe('Report refused');
    expect(pressed('Core use')).toBe('true');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Core use' }))
        .getByRole('radio', { name: 'Works now' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(noteFor('Core use').value).toBe('Opens.');
  });

  it('refuses more than 30 parts, without a request', async () => {
    const user = userEvent.setup();
    const parts = Array.from({ length: 31 }, (_, index) => ({
      slug: `part_${index}`,
      name: `Part ${index}`,
      level: 'unknown',
    }));
    const api = await openReport(user, 'https://many.example/', { record: recordWith(parts), catalogue: { data: [] } });

    for (const part of parts) {
      await choose(user, part.name);
      await answer(user, part.name, 'Works');
      fireEvent.change(noteFor(part.name), { target: { value: 'Opens.' } });
    }
    await user.click(sendButton());

    expect(
      await screen.findByText('A report can include at most 30 parts and 100 screenshots. Remove some before sending.'),
    ).toBeDefined();
    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(0);
    // 31 parts chosen and answered one by one: worth more than the default allowance on a busy machine.
  }, 30_000);

  it('takes at most five screenshots for a part, which back its answer on their own', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    await openReport(user, 'https://five.example/');
    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Still fails');
    const coreUse = partGroup('Core use');

    const field = coreUse.getByText('Or drop or paste an image here.').closest('div');
    if (field === null) throw new Error('Core use has no screenshot field');
    const shots = Array.from({ length: 6 }, (_, index) => new File(['png'], `${index}.png`, { type: 'image/png' }));
    fireEvent.drop(field, { dataTransfer: { types: ['Files'], files: shots } });

    expect(await coreUse.findAllByAltText(/^Evidence #/)).toHaveLength(5);
    expect(coreUse.getByText('This form already holds the most screenshots. Remove one to add another.')).toBeDefined();
    // Each dropped file opens in the editor in turn. Once the last is closed, only the full list keeps the button off.
    const add = await vi.waitFor(async () => {
      await closeEditorWindows();
      expect(coreUse.getByText('Click a screenshot to crop it or hide personal details.')).toBeDefined();
      return coreUse.getByRole<HTMLButtonElement>('button', { name: 'Add another screenshot' });
    });
    expect(add.disabled).toBe(true);
    expect(coreUse.queryByText('Add a note or a screenshot showing this.')).toBeNull();
    expect(sendButton().disabled).toBe(false);
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

    await screen.findByText(/browsing from Germany/);
    expect(screen.getByText('Turn off your VPN.')).toBeDefined();
  });
});

describe('sending a report', () => {
  it('sends only the parts the tester chose and answered, in the body the API expects', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://watch.example/films');

    await choose(user, 'Core use');
    await choose(user, 'Landing page');
    await answer(user, 'Core use', 'Works now');
    await user.type(noteFor('Core use'), 'The login page opened first try.');
    await answer(user, 'Landing page', 'Still works');
    await user.type(noteFor('Landing page'), 'Loads.');
    // Left out again before sending: a part not chosen is not sent, whatever it held.
    await choose(user, 'Landing page');
    expect(screen.queryByRole('radiogroup', { name: 'Landing page' })).toBeNull();

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(screen.queryByText(/Turn off your VPN/)).toBeNull();

    const sent = api.callsTo('POST', '/functionality-reports');
    expect(sent).toHaveLength(1);
    expect(sent.at(0)?.url).toBe(`${API_BASE}/functionality-reports`);
    expect(sent.at(0)?.headers?.['Content-Type']).toBe('application/json');
    expect(sent.at(0)?.headers?.['Idempotency-Key']).toMatch(/^\d{13}\./);
    // No connection was chosen, so there is no note for reviewers.
    expect(sent.at(0)?.json).toEqual({
      serviceId: 'svc-netflix',
      items: [{ slug: 'core_use', level: 'working', description: 'The login page opened first try.' }],
      submitterEmail: null,
      locale: 'en',
      testedHost: 'watch.example',
    });
  });

  it('sends the answer the tester picked, whichever way the record words it', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://levels.example/');
    await choose(user, 'Core use');
    await choose(user, 'Landing page');
    await answer(user, 'Core use', 'Still fails');
    await user.type(noteFor('Core use'), 'Spins forever.');
    await answer(user, 'Landing page', 'Fails now');
    await user.type(noteFor('Landing page'), 'Blank page.');

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api).items).toEqual([
      { slug: 'core_use', level: 'failing', description: 'Spins forever.' },
      { slug: 'landing_page', level: 'failing', description: 'Blank page.' },
    ]);
  });

  it('shows the host the report will name as tested, without www. or the path', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://www.Web.Watch.example/films/42?ref=home');

    expect(screen.getByText('web.watch.example')).toBeDefined();
    expect(screen.getByText(/Tested on/)).toBeDefined();

    await sendCoreUseWorks(user, 'Loads.');
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api)).toMatchObject({ testedHost: 'web.watch.example' });
  });

  it("names the tester's email and home connection when given", async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://credited.example/');
    await user.click(screen.getByRole('button', { name: 'Home internet' }));
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), '  tester@example.com ');
    await sendCoreUseWorks(user);
    await screen.findByRole('heading', { name: 'Report sent' });

    expect(reportBody(api)).toMatchObject({
      submitterEmail: 'tester@example.com',
      submitterNote: 'Connection: home internet (ADSL or fibre)',
    });
  });

  it('tells reviewers how the tester was connected, in English, and only one way', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://mobile.example/');
    const connection = within(screen.getByRole('group', { name: 'How were you connected?' }));
    const home = connection.getByRole('button', { name: 'Home internet' });
    const mobile = connection.getByRole('button', { name: 'Mobile data' });

    // Pressed again, a choice is taken back.
    await user.click(home);
    expect(home.getAttribute('aria-pressed')).toBe('true');
    await user.click(home);
    expect(home.getAttribute('aria-pressed')).toBe('false');

    await user.click(home);
    await user.click(mobile);
    expect(home.getAttribute('aria-pressed')).toBe('false');
    expect(mobile.getAttribute('aria-pressed')).toBe('true');

    await sendCoreUseWorks(user);
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api)).toMatchObject({ submitterNote: 'Connection: mobile data' });
  });

  it('shows what was sent and where, and remembers it for the card', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://sent.example/');
    await sendCoreUseWorks(user);

    const heading = await screen.findByRole('heading', { name: 'Report sent' });
    const sentScreen = within(heading.closest('section') as HTMLElement);
    expect(sentScreen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Core use: Works']);
    expect(sentScreen.getByText(/Tested on/).textContent).toBe('Tested on sent.example');
    // Core use was the part on record as failing, and the landing page works, so nothing is left to test.
    expect(screen.queryByRole('button', { name: 'Test another part' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Netflix' })).toBeDefined();

    await vi.waitFor(async () => {
      expect(await sentHistory()).toEqual([
        {
          kind: 'report',
          serviceSlug: 'netflix',
          serviceName: 'Netflix',
          at: expect.any(Number) as number,
          parts: [{ slug: 'core_use', name: 'Core use', level: 'working' }],
          testedHost: 'sent.example',
        },
      ]);
    });
  });

  it('offers another part while one the record lacks or shows failing is left, and starts it empty', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://again.example/');
    await choose(user, 'Landing page');
    await answer(user, 'Landing page', 'Still works');
    await user.type(noteFor('Landing page'), 'Loads.');
    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });

    // Core use is on record as failing, so it is worth a test.
    await user.click(screen.getByRole('button', { name: 'Test another part' }));
    await screen.findByRole('heading', { name: 'Report what works' });
    expect(pressed('Landing page')).toBe('false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('Choose at least one part you tried.')).toBeDefined();

    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Still fails');
    await user.type(noteFor('Core use'), 'Spins forever.');
    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });

    expect(api.callsTo('POST', '/functionality-reports')).toHaveLength(2);
    expect(reportBody(api, 1).items).toEqual([{ slug: 'core_use', level: 'failing', description: 'Spins forever.' }]);
  });
});

describe('pasting a screenshot', () => {
  it('adds an image pasted while typing a note to that part, and refuses one while the editor is open', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    await openReport(user, 'https://paste-note.example/');
    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Still fails');

    const image = () => new File(['png-bytes'], 'pasted.png', { type: 'image/png' });
    fireEvent.paste(noteFor('Core use'), { clipboardData: { files: [image()] } });
    expect(await screen.findByAltText('Evidence #1')).toBeDefined();

    // The first image is open in the editor, so a second paste waits.
    fireEvent.paste(noteFor('Core use'), { clipboardData: { files: [image()] } });
    expect(await screen.findByText('Finish the screenshot open in the editor first.')).toBeDefined();
    expect(screen.queryByAltText('Evidence #2')).toBeNull();
    await closeEditorWindows();
  });
});

describe('a part the tester names', () => {
  it('asks for its name first, and sends it by that name, never as a slug', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://named.example/');
    await user.click(screen.getByRole('button', { name: 'Something else' }));

    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'What did you try?' });
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('Name the part you tried.')).toBeDefined();
    // Answered before it has a name, it still needs one.
    await answer(user, 'Something else', 'Fails');
    expect(screen.getByText('Name the part you tried.')).toBeDefined();

    await user.type(name, 'Group calls');
    expect(screen.getByRole('group', { name: 'Group calls' })).toBeDefined();
    expect(screen.getByText('Add a note or a screenshot for Group calls.')).toBeDefined();
    await user.type(noteFor('Group calls'), 'The call drops after a second.');
    await user.click(sendButton());

    const heading = await screen.findByRole('heading', { name: 'Report sent' });
    const sent = api.callsTo('POST', '/functionality-reports').at(0);
    expect(reportBody(api).items).toEqual([
      { proposedName: 'Group calls', level: 'failing', description: 'The call drops after a second.' },
    ]);
    expect(sent?.body).not.toContain('named:');
    expect(
      within(heading.closest('section') as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Group calls: Fails']);
    // The card marks parts by slug, so a named part is remembered without one.
    await vi.waitFor(async () => {
      expect((await sentHistory()).at(0)?.parts).toEqual([{ name: 'Group calls', level: 'failing' }]);
    });
  });

  it('keeps the name to the 80 characters the API takes', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://long-name.example/');
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'What did you try?' });
    await user.type(
      name,
      'Group video calls with more than eight people, screen sharing, and recordings saved to the cloud',
    );
    expect(name.value).toHaveLength(80);

    await answer(user, name.value, 'Works');
    await user.type(noteFor(name.value), 'All of it works.');
    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api).items.at(0)?.proposedName).toBe(name.value);
  });

  it("frees a removed part's screenshots, and forgets what it held", async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    await openReport(user, 'https://free.example/');
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    await user.type(screen.getByRole('textbox', { name: 'What did you try?' }), 'Group calls');
    await answer(user, 'Group calls', 'Fails');
    await user.click(partGroup('Group calls').getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();

    await user.click(screen.getByRole('button', { name: 'Remove Group calls' }));
    expect(screen.queryByRole('group', { name: 'Group calls' })).toBeNull();
    expect(screen.queryByAltText('Evidence #1')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:fake-evidence');
    expect(screen.getByText('Choose at least one part you tried.')).toBeDefined();

    // Added again, it starts over.
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'What did you try?' }).value).toBe('');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Something else' }))
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-checked')),
    ).toEqual(['false', 'false']);
  });
});

describe('when sign-in fails', () => {
  const signInRecord = recordWith([
    { slug: 'core_use', name: 'Core use', level: 'failing' },
    { slug: 'sign_in', name: 'Sign in', level: 'unknown' },
    { slug: 'payment', name: 'Payment', level: 'unknown' },
    { slug: 'otp', name: 'One-time codes', level: 'unknown' },
  ]);

  it('counts the parts behind it as failing without an answer, and leaves them out of the report', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://sign-in.example/', { record: signInRecord });
    await choose(user, 'Sign in');
    await choose(user, 'Payment');
    await choose(user, 'One-time codes');

    await answer(user, 'Sign in', 'Fails');
    expect(screen.queryByRole('radiogroup', { name: 'Payment' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'One-time codes' })).toBeNull();
    expect(
      partGroup('Payment').getByText('Counts as failing because sign-in fails. No need to test it.'),
    ).toBeDefined();
    expect(
      partGroup('One-time codes').getByText('Counts as failing because sign-in fails. No need to test it.'),
    ).toBeDefined();
    expect(screen.getByText(/When sign-in fails, payment, upgrade, payout/)).toBeDefined();

    // Once sign-in works, the parts behind it need answers of their own.
    await answer(user, 'Sign in', 'Works');
    expect(screen.getByRole('radiogroup', { name: 'Payment' })).toBeDefined();
    expect(screen.getByText('Say whether Payment works.')).toBeDefined();

    await answer(user, 'Sign in', 'Fails');
    await user.type(noteFor('Sign in'), 'The code never arrives.');
    expect(sendButton().disabled).toBe(false);
    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api).items).toEqual([
      { slug: 'sign_in', level: 'failing', description: 'The code never arrives.' },
    ]);
  });
});

/** The report form for a service that records no parts yet. */
async function openBlankReport(
  user: UserEvent,
  pageUrl: string,
  catalogue: FakeAnswer | FakeResponder,
): Promise<FakeApi> {
  return openReport(user, pageUrl, { record: recordWith([]), catalogue });
}

describe('a service with no recorded parts', () => {
  it('offers the two parts every service has, as not checked yet', async () => {
    const user = userEvent.setup();
    const api = await openBlankReport(user, 'https://blank.example/', { data: functionalities });

    expect(chipNames()).toEqual(['Core use', 'Landing page', 'More parts', 'Something else']);
    await choose(user, 'Core use');
    expect(partGroup('Core use').getByText('Nobody has checked this from Syria yet.')).toBeDefined();
    await answer(user, 'Core use', 'Works');
    await user.type(noteFor('Core use'), 'Opens.');

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api).items).toEqual([{ slug: 'core_use', level: 'working', description: 'Opens.' }]);
    // Neither part is on record as working, so the landing page is still worth a test.
    expect(screen.getByRole('button', { name: 'Test another part' })).toBeDefined();
  });

  it('still offers them by their built-in names when the catalogue fails, and Try again brings the rest', async () => {
    const user = userEvent.setup();
    let failing = true;
    const api = await openBlankReport(user, 'https://catalogue-down.example/', () =>
      failing ? { status: 500, json: { error: 'UPSET', message: 'The catalogue is down' } } : { data: functionalities },
    );

    await screen.findByText('Could not load the other parts you can add.');
    expect(pressed('Core use')).toBe('false');
    expect(pressed('Landing page')).toBe('false');
    expect(screen.queryByRole('button', { name: 'More parts' })).toBeNull();
    const calls = api.callsTo('GET', '/functionalities').length;

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'More parts' });
    expect(screen.queryByText('Could not load the other parts you can add.')).toBeNull();
    expect(api.callsTo('GET', '/functionalities')).toHaveLength(calls + 1);
  });
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

/** Stores a report draft the way the form writes one. */
const storeDraft = (serviceKey: string, fields: object, shots: object[] = []) =>
  chrome.storage.session.set({
    [`draft:report:${serviceKey}`]: { schema: 1, form: 'report', serviceKey, savedAt: 1, fields, shots },
  });

const chooseAndNote = async (user: UserEvent, note: string) => {
  await choose(user, 'Core use');
  await answer(user, 'Core use', 'Works now');
  await user.type(noteFor('Core use'), note);
};

const checked = (part: string, label: string) =>
  within(screen.getByRole('radiogroup', { name: part }))
    .getByRole('radio', { name: label })
    .getAttribute('aria-checked');

describe('keeping the report across a closed panel', () => {
  it('keeps a second report, started with "Test another part", across a closed panel', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://second.example/');
    await choose(user, 'Landing page');
    await answer(user, 'Landing page', 'Still works');
    await user.type(noteFor('Landing page'), 'Loads.');
    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    await user.click(screen.getByRole('button', { name: 'Test another part' }));

    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Still fails');
    await user.type(noteFor('Core use'), 'The second report.');
    // The first send cleared its draft; the second report keeps its own.
    await waitForDraft();
    await reopenPanel(user, 'https://second.example/');
    expect(noteFor('Core use')).toHaveProperty('value', 'The second report.');
  });

  it('brings the choice, the answer, the note and the connection back, and lets the draft go once sent', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://draft.example/');
    await user.click(screen.getByRole('button', { name: 'Mobile data' }));
    await chooseAndNote(user, 'Opens after the first try.');
    await waitForDraft();

    await reopenPanel(user, 'https://draft.example/');
    expect(pressed('Core use')).toBe('true');
    expect(checked('Core use', 'Works now')).toBe('true');
    expect(noteFor('Core use').value).toBe('Opens after the first try.');
    expect(pressed('Mobile data')).toBe('true');

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api)).toMatchObject({
      items: [{ slug: 'core_use', level: 'working', description: 'Opens after the first try.' }],
      submitterNote: 'Connection: mobile data',
    });
    expect(await storedReport()).toBeUndefined();
  });

  it('brings a named part back by its name, and still sends it without a slug', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://named-draft.example/');
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    await user.type(screen.getByRole('textbox', { name: 'What did you try?' }), 'Group calls');
    await answer(user, 'Group calls', 'Fails');
    await user.type(noteFor('Group calls'), 'Drops after a second.');
    await waitForDraft();

    await reopenPanel(user, 'https://named-draft.example/');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'What did you try?' }).value).toBe('Group calls');
    expect(checked('Group calls', 'Fails')).toBe('true');
    expect(noteFor('Group calls').value).toBe('Drops after a second.');

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api).items).toEqual([
      { proposedName: 'Group calls', level: 'failing', description: 'Drops after a second.' },
    ]);
  });

  it('treats the restored report as work in progress, and forgets it when the tester chooses discard', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://guard.example/');
    await chooseAndNote(user, 'Opens.');
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

  it('keeps the host the report was started on when it is reopened on another address', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://web.started.example/chat');
    await chooseAndNote(user, 'Messages load.');
    await waitForDraft();

    await reopenPanel(user, 'https://started.example/');
    expect(screen.getByText('web.started.example')).toBeDefined();
    expect(screen.queryByText('started.example')).toBeNull();

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api, -1)).toMatchObject({ testedHost: 'web.started.example' });
  });

  it('sends no host for a draft saved without one', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://older.example/');
    await storeDraft('svc-netflix', {
      chosen: ['core_use'],
      answers: { core_use: 'working' },
      notes: { core_use: 'Saved without a host.' },
      names: {},
    });

    await reopenPanel(user, 'https://older.example/');
    expect(screen.queryByText(/Tested on/)).toBeNull();

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });
    expect(reportBody(api, -1)).not.toHaveProperty('testedHost');
  });

  it("leaves another service's stored report alone", async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://elsewhere.example/');
    await storeDraft('svc-other', {
      chosen: ['core_use'],
      answers: { core_use: 'working' },
      notes: { core_use: 'Not this service.' },
      names: {},
    });

    await reopenPanel(user, 'https://elsewhere.example/');
    expect(pressed('Core use')).toBe('false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(await chrome.storage.session.get(null)).toHaveProperty('draft:report:svc-other');
  });

  it('keeps the stored report when the API refuses it', async () => {
    const user = userEvent.setup();
    const api = await openReport(user, 'https://refused-draft.example/');
    api.on('POST', '/functionality-reports', { status: 422, json: { error: 'INVALID', message: 'Report refused' } });
    await chooseAndNote(user, 'Opens.');

    await user.click(sendButton());
    await screen.findByRole('alert');
    await waitForDraft();
    expect(await storedReport()).toBeDefined();
  });

  it('opens empty and quiet when the stored record is unreadable', async () => {
    const user = userEvent.setup();
    await openReport(user, 'https://corrupt.example/');
    await chrome.storage.session.set({ 'draft:report:svc-netflix': { schema: 99, nonsense: true } });

    await reopenPanel(user, 'https://corrupt.example/');
    expect(pressed('Core use')).toBe('false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The unusable record is dropped, so the next open starts clean too.
    const kept = await chrome.storage.session.get(null);
    expect(Object.keys(kept).filter((key) => key.startsWith('draft:'))).toEqual([]);
  });

  it('brings back a part from the rest of the catalogue, without opening More parts', async () => {
    const user = userEvent.setup();
    await openBlankReport(user, 'https://added-part.example/', { data: functionalities });
    await storeDraft('svc-netflix', {
      chosen: ['core_use', 'sign_up'],
      answers: { core_use: 'working', sign_up: 'working' },
      notes: { core_use: 'Opens.', sign_up: 'Signed up fine.' },
      names: {},
    });

    await reopenPanel(user, 'https://added-part.example/');

    expect(checked('Core use', 'Works')).toBe('true');
    // The catalogue had not loaded when the draft was read, so the part waited for it.
    expect(await screen.findByRole('radiogroup', { name: 'Sign up' })).toBeDefined();
    expect(pressed('Sign up')).toBe('true');
    expect(screen.getByRole('button', { name: 'More parts' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Payments' })).toBeNull();
  });

  it('brings a screenshot back as a thumbnail, and sends the bytes that were captured', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const api = await openReport(user, 'https://shots.example/');
    api.on('POST', '/uploads/evidence', { json: upload });
    await choose(user, 'Core use');
    await answer(user, 'Core use', 'Works now');
    await user.click(partGroup('Core use').getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();
    await waitForDraft();

    await reopenPanel(user, 'https://shots.example/');
    expect(await screen.findByAltText('Evidence #1')).toBeDefined();

    await user.click(sendButton());
    await screen.findByRole('heading', { name: 'Report sent' });

    const uploads = api.callsTo('POST', '/uploads/evidence');
    expect(uploads).toHaveLength(1);
    // The stub's capture decodes to five bytes. Re-encoding would change that.
    expect((uploads.at(0)?.body as FormData).get('file')).toMatchObject({ size: 5, type: 'image/jpeg' });
    expect(reportBody(api).items).toEqual([{ slug: 'core_use', level: 'working', evidenceUrls: [upload.file.url] }]);
  });

  it('reads a record from a service that records nothing, and drops what it cannot use', async () => {
    const user = userEvent.setup();
    // The service left the field out rather than sending an empty list.
    await openReport(user, 'https://thin-record.example/', {
      record: { ...serviceRecord, functionalities: undefined },
    });
    await storeDraft(
      'svc-netflix',
      {
        chosen: ['core_use', 'landing_page', 'mystery_part', 42],
        answers: { core_use: 'working', landing_page: 'bogus', gone: 'failing' },
        notes: { core_use: 'Opens.', landing_page: 7 },
        names: 'not a map',
        connection: 'satellite',
      },
      // A shot with no part of its own, the way the single list stores them.
      [
        {
          id: '1700000000000-single',
          bytes: new Uint8Array([1, 2, 3]).buffer,
          type: 'image/jpeg',
          filename: 'single.jpg',
          partSlug: null,
          uploadedUrl: null,
          uploadedAt: null,
        },
      ],
    );

    await reopenPanel(user, 'https://thin-record.example/');

    // Both parts every service has, named from the extension's own translations.
    expect(checked('Core use', 'Works')).toBe('true');
    expect(noteFor('Core use').value).toBe('Opens.');
    // An answer that is not one is dropped, so the landing page still needs one.
    expect(checked('Landing page', 'Works')).toBe('false');
    expect(checked('Landing page', 'Fails')).toBe('false');
    expect(screen.getByText('Say whether Landing page works.')).toBeDefined();
    // The part the catalogue never heard of stays dropped rather than offered half named.
    expect(screen.queryByRole('group', { name: 'mystery_part' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Mystery part' })).toBeNull();
    expect(pressed('Home internet')).toBe('false');
    expect(pressed('Mobile data')).toBe('false');
    expect(screen.queryByAltText('Evidence #1')).toBeNull();
  });
});
