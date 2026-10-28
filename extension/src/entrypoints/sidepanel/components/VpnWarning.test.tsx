/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { fakeApi } from '../../../testing/fakeApi';
import { clearReadCaches } from '../../../lib/cache';
import { VpnWarning } from './VpnWarning';

const trace = (loc: string) => `fl=v8\nloc=${loc}\nts=1758000000\n`;

describe('the VPN warning', () => {
  it('stays quiet from Syria, and when the check cannot tell', async () => {
    const api = fakeApi()
      .on('GET', '/cdn-cgi/trace', { text: trace('SY') })
      .install();
    const { unmount } = render(<VpnWarning />);
    await waitFor(() => expect(api.callsTo('GET', '/cdn-cgi/trace')).toHaveLength(1));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    clearReadCaches();
    api.on('GET', '/cdn-cgi/trace', { status: 503, text: '' });
    render(<VpnWarning />);
    await waitFor(() => expect(api.callsTo('GET', '/cdn-cgi/trace')).toHaveLength(2));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reuses a country checked moments ago instead of asking again', async () => {
    const api = fakeApi()
      .on('GET', '/cdn-cgi/trace', { text: trace('DE') })
      .install();
    const { unmount } = render(<VpnWarning />);
    expect((await screen.findByRole('status')).textContent).toContain('Germany');
    unmount();

    render(<VpnWarning />);
    // Shown on the first render, from the check already made.
    expect(screen.getByRole('status').textContent).toContain('Germany');
    expect(api.callsTo('GET', '/cdn-cgi/trace')).toHaveLength(1);
  });

  it('names where the connection comes out, and goes away once a recheck finds Syria', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(trace('DE')))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetcher);
    render(<VpnWarning />);

    await screen.findByText(/browsing from Germany\. Reports sent from outside Syria can't be recorded/);
    expect(screen.getByText('Turn off your VPN.')).toBeDefined();

    // Rechecking is what a tester does after turning the VPN off.
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    const checking = screen.getByRole<HTMLButtonElement>('button', { name: 'Checking…' });
    expect(checking.disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);

    release(new Response(trace('SY')));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('calls a Tor exit by name', async () => {
    fakeApi()
      .on('GET', '/cdn-cgi/trace', { text: trace('T1') })
      .install();
    render(<VpnWarning />);
    await screen.findByText(/browsing from the Tor network\./);
  });
});
