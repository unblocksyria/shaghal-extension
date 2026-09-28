/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { fakeApi } from '../../../testing/fakeApi';
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

    api.on('GET', '/cdn-cgi/trace', { status: 503, text: '' });
    render(<VpnWarning />);
    await waitFor(() => expect(api.callsTo('GET', '/cdn-cgi/trace')).toHaveLength(2));
    expect(screen.queryByRole('status')).toBeNull();
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

    await screen.findByText(/browsing from Germany, not Syria/);
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
    await screen.findByText(/browsing from the Tor network, not Syria/);
  });
});
