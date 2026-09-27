/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import matchNone from '../../../testing/fixtures/match-none.json';

/** The report a service form: the card offers it for a site nothing tracks yet. */
async function openReportService(user: UserEvent, pageUrl: string): Promise<FakeApi> {
  const api = fakeApi()
    .on('POST', '/services/match', { data: matchNone })
    .on('POST', '/submissions', { status: 201, json: { success: true } })
    .install();
  await openPanel(pageUrl);
  await user.click(await screen.findByRole('button', { name: 'Report a Service' }, { timeout: 3000 }));
  await screen.findByRole('heading', { name: 'Report a Service' });
  return api;
}

describe('the report a service form', () => {
  it('sends the service with the page address it was opened on (covers AC-2)', async () => {
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

  it('blocks sending while the service has no name (covers AC-2)', async () => {
    const user = userEvent.setup();
    const api = await openReportService(user, 'https://another-untracked.example/');

    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Submit Report' });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Enter the service name.')).toBeDefined();

    await user.click(submit);
    expect(api.callsTo('POST', '/submissions')).toHaveLength(0);
  });

  it('shows the API message and keeps what was typed when the send fails (covers AC-6)', async () => {
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
