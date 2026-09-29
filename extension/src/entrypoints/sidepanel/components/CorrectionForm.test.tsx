/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import { closeEditorWindows } from '../../../testing/editorWindows';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel, stubScreenshot } from '../../../testing/panel';
import { SidePanelApp } from '../SidePanelApp';
import categories from '../../../testing/fixtures/categories.json';
import match from '../../../testing/fixtures/match.json';
import serviceRecord from '../../../testing/fixtures/service-record.json';

/** Opens the correction form from the card, as a tester would. */
async function openCorrection(user: UserEvent, pageUrl: string): Promise<FakeApi> {
  const api = fakeApi()
    .on('POST', '/services/match', { data: match })
    .on('GET', '/services/netflix', { data: serviceRecord })
    .on('GET', '/categories', { data: categories })
    .on('POST', '/corrections', { status: 201, json: { id: 'receipt' } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Suggest Correction' });
  return api;
}

describe('the correction form', () => {
  it('sends one submission carrying every field ticked', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://first.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));

    await screen.findByRole('heading', { name: 'Correction Submitted' });
    const sent = api.callsTo('POST', '/corrections');
    expect(sent).toHaveLength(1);
    expect(sent.at(0)?.url).toBe(`${API_BASE}/corrections`);
    expect(sent.at(0)?.json).toEqual({
      serviceId: 'svc-netflix',
      changes: [{ correctionType: 'url', proposedValue: 'https://stream.example' }],
      submitterEmail: null,
      evidenceUrls: [],
      locale: 'en',
    });
  });

  it('sends a category change as a JSON array of category IDs', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://second.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    // The recorded categories start ticked, so the button reads "2 selected: …".
    await user.click(screen.getByRole('button', { name: /Select correct categories|\d+ selected/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Social' }));

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    await screen.findByRole('heading', { name: 'Correction Submitted' });

    const sent = api.callsTo('POST', '/corrections');
    expect(sent.at(0)?.json).toEqual({
      serviceId: 'svc-netflix',
      changes: [
        {
          correctionType: 'category',
          proposedValue: JSON.stringify(['cat-streaming', 'cat-entertainment', 'cat-social']),
        },
      ],
      submitterEmail: null,
      evidenceUrls: [],
      locale: 'en',
    });
  });

  it('blocks sending until something changed', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://fourth.example/page');

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Correction' });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Choose what needs to be corrected.')).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Enter the correct information for each field you ticked.')).toBeDefined();

    // The recorded address is not a correction, so it stays blocked.
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://www.netflix.com');
    expect(screen.getByText('One of these is what is already recorded.')).toBeDefined();

    await user.click(submit);
    expect(api.callsTo('POST', '/corrections')).toHaveLength(0);
  });

  it('says why the categories are missing when the first fetch fails', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://fifth.example/page');
    // The last answer registered wins, so this one overrides the fixture.
    api.on('GET', '/categories', { status: 500, json: { error: 'UPSET', message: 'Categories are down' } });

    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));

    await screen.findByText('Could not load categories: Categories are down');
    // The picker still opens, with no names to show.
    await user.click(screen.getByRole('button', { name: /2 selected/ }));
    expect(screen.getByText('No categories found.')).toBeDefined();
  });
});

describe('what each field shows', () => {
  it('shows the recorded value, or that nothing is recorded, and asks freely for other information', async () => {
    const user = userEvent.setup();
    await openCorrection(user, 'https://fields.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Description' }));
    expect(screen.getByText('Streaming video service.')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter the correct description...')).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'Support Email' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Support Email' })).toHaveProperty('type', 'email');

    await user.click(screen.getByRole('checkbox', { name: 'Support URL' }));
    expect(screen.getAllByText('Nothing recorded yet.')).toHaveLength(2);

    // Other information has nothing to compare against, so no recorded line.
    await user.click(screen.getByRole('checkbox', { name: 'Other Information' }));
    expect(screen.getAllByText('Currently recorded as:')).toHaveLength(3);
    expect(screen.getByPlaceholderText('Describe what needs to be corrected...')).toBeDefined();
  });

  it('drops a field that is unticked again from the submission', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://untick.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.click(screen.getByRole('checkbox', { name: 'Description' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'A film service.');
    await user.click(screen.getByRole('checkbox', { name: 'Description' }));
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    await screen.findByRole('heading', { name: 'Correction Submitted' });
    expect(api.callsTo('POST', '/corrections').at(0)?.json).toMatchObject({
      changes: [{ correctionType: 'url', proposedValue: 'https://stream.example' }],
    });
  });
});

describe('the category limits', () => {
  it('needs at least one category', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://none.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await user.click(await screen.findByRole('button', { name: /2 selected/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Streaming' }));
    await user.click(screen.getByRole('checkbox', { name: 'Entertainment' }));

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Correction' });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Choose at least one category.')).toBeDefined();
    await user.click(submit);
    expect(api.callsTo('POST', '/corrections')).toHaveLength(0);
  });

  it('allows ten categories at most', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 11 }, (_, index) => ({ id: `cat-${index}`, name: `Category ${index}` }));
    fakeApi()
      .on('POST', '/services/match', { data: match })
      .on('GET', '/services/netflix', { data: { ...serviceRecord, categories: [] } })
      .on('GET', '/categories', { data: many })
      .install();
    await openPanel('https://eleven.example/page');
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }, { timeout: 3000 }));
    await screen.findByRole('heading', { name: 'Suggest Correction' });

    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await user.click(screen.getByRole('button', { name: 'Select correct categories...' }));
    for (const category of many) await user.click(await screen.findByRole('checkbox', { name: category.name }));

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Correction' });
    expect(screen.getByText('A service can have at most 10 categories.')).toBeDefined();
    expect(submit.disabled).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: 'Category 10' }));
    expect(screen.queryByText('A service can have at most 10 categories.')).toBeNull();
    expect(submit.disabled).toBe(false);
  });

  it('loads the category names once, however often Categories is ticked', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://once.example/page');
    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await screen.findByRole('button', { name: /2 selected: Streaming, Entertainment/ });
    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    await screen.findByRole('button', { name: /2 selected: Streaming, Entertainment/ });
    expect(api.callsTo('GET', '/categories')).toHaveLength(1);
  });
});

describe('what stops a correction', () => {
  it('refuses an email that is not one, without a request', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://email.example/page');
    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address, or leave it blank.');
    expect(api.callsTo('POST', '/corrections')).toHaveLength(0);
  });

  it('shows why a screenshot could not be uploaded, and stays sendable', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    const api = await openCorrection(user, 'https://upload.example/page');
    api.on('POST', '/uploads/evidence', { status: 500, json: { error: 'UPSET', message: 'Upload refused' } });
    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A screenshot could not be uploaded: Upload refused');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Correction' }).disabled).toBe(false);
    expect(api.callsTo('POST', '/corrections')).toHaveLength(0);
  });

  it('shows a cooldown when the network is rate limited, and keeps the draft', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://cooldown.example/page');
    api.on('POST', '/corrections', { status: 429, json: { error: 'RATE_LIMITED', message: 'Slow down' } });
    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This shared network is busy. Try again in 1 minute. Keep this panel open to preserve your draft.',
    );
    expect(screen.getByRole('textbox', { name: 'Website URL' })).toHaveProperty('value', 'https://stream.example');
  });
});

/** The correction draft held for the fixture's service, or nothing. */
const storedCorrection = async (): Promise<unknown> => {
  const all = await chrome.storage.session.get(null);
  return all['draft:correction:svc-netflix'];
};

describe('keeping the correction across a closed panel', () => {
  it('brings the ticked field and its value back, and lets the draft go once submitted', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://draft.example/page');
    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    // The write lands half a second after the typing stops.
    await vi.waitFor(async () => {
      expect(await storedCorrection()).toBeDefined();
    });

    cleanup();
    render(<SidePanelApp />);
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }));
    await screen.findByRole('heading', { name: 'Suggest Correction' });

    expect(screen.getByRole('checkbox', { name: 'Website URL' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Website URL' })).toHaveProperty('value', 'https://stream.example');

    await user.click(screen.getByRole('button', { name: 'Submit Correction' }));
    await screen.findByRole('heading', { name: 'Correction Submitted' });
    expect(api.callsTo('POST', '/corrections')).toHaveLength(1);
    expect(await storedCorrection()).toBeUndefined();
  });

  it('brings a screenshot back with the fields it was captured beside', async () => {
    const user = userEvent.setup();
    stubScreenshot();
    await openCorrection(user, 'https://shots.example/page');
    await user.click(screen.getByRole('checkbox', { name: 'Website URL' }));
    await user.type(screen.getByRole('textbox', { name: 'Website URL' }), 'https://stream.example');
    await user.click(screen.getByRole('button', { name: 'Add screenshot' }));
    await screen.findByAltText('Evidence #1');
    await closeEditorWindows();
    await vi.waitFor(async () => {
      expect(await storedCorrection()).toBeDefined();
    });

    cleanup();
    await openPanel('https://shots.example/page', { keepSession: true });
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }));
    await screen.findByRole('heading', { name: 'Suggest Correction' });

    expect(await screen.findByAltText('Evidence #1')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Website URL' })).toHaveProperty('value', 'https://stream.example');
  });

  it('reads a record holding a field this build does not know, and no email', async () => {
    const user = userEvent.setup();
    await openCorrection(user, 'https://old-record.example/page');
    // Written by a build with one more field than this one, and never given an email.
    await chrome.storage.session.set({
      'draft:correction:svc-netflix': {
        schema: 1,
        form: 'correction',
        serviceKey: 'svc-netflix',
        savedAt: 1,
        fields: {
          selected: ['url', 'postal_code'],
          values: { url: 'https://stream.example', postal_code: '12345' },
          categories: [],
        },
        shots: [],
      },
    });

    cleanup();
    await openPanel('https://old-record.example/page', { keepSession: true });
    await user.click(await screen.findByRole('button', { name: 'Suggest Correction' }));
    await screen.findByRole('heading', { name: 'Suggest Correction' });

    expect(screen.getByRole('checkbox', { name: 'Website URL' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Website URL' })).toHaveProperty('value', 'https://stream.example');
    // The field it does not know is dropped, and the record's own email never arrives.
    expect(screen.queryByRole('checkbox', { name: 'Postal code' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveProperty('value', '');
  });
});
