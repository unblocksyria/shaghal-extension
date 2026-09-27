/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import categories from '../../../testing/fixtures/categories.json';
import match from '../../../testing/fixtures/match.json';
import serviceRecord from '../../../testing/fixtures/service-record.json';

/** The correction form, reached the way a tester reaches it: from the card. */
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
  it('sends one submission carrying every field ticked (covers AC-2)', async () => {
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

  it('sends a category change as a JSON array of category IDs (covers AC-2)', async () => {
    const user = userEvent.setup();
    const api = await openCorrection(user, 'https://second.example/page');

    await user.click(screen.getByRole('checkbox', { name: 'Categories' }));
    // The picker opens with the recorded categories already ticked: "2 selected: …".
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

  it('blocks sending until something changed (covers AC-2)', async () => {
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
});
