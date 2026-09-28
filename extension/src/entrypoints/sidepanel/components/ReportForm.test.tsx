/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { fireEvent, screen, within } from '@testing-library/react';
import { API_BASE } from '../../../lib/config';
import { fakeApi, type FakeApi } from '../../../testing/fakeApi';
import { openPanel } from '../../../testing/panel';
import functionalities from '../../../testing/fixtures/functionalities.json';
import match from '../../../testing/fixtures/match.json';
import serviceRecord from '../../../testing/fixtures/service-record.json';

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
  });
});
