/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import functionalities from '../../../testing/fixtures/functionalities.json';
import match from '../../../testing/fixtures/match.json';
import serviceRecord from '../../../testing/fixtures/service-record.json';

/** The report form, reached the way a tester reaches it: from the card. */
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
  it('sends what the tester marked, in the body the API expects (covers AC-2)', async () => {
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

  it('blocks sending until a part is marked, and until a contradiction carries detail (covers AC-2)', async () => {
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
});
