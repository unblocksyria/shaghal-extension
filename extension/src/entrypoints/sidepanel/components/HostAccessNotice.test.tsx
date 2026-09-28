/** @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HostAccessNotice } from './HostAccessNotice';

/** A chrome.permissions whose answer the test controls, with working change events. */
function fakePermissions(granted: boolean) {
  type Listener = () => void;
  const listeners = new Set<Listener>();
  const events = {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
  };
  const api = {
    contains: vi.fn(() => Promise.resolve(granted)),
    request: vi.fn(() => {
      granted = true;
      return Promise.resolve(true);
    }),
    onAdded: events,
    onRemoved: events,
  };
  const withdraw = () => {
    granted = false;
    for (const listener of listeners) listener();
  };
  return { api, withdraw, listeners };
}

const settle = () => act(() => Promise.resolve());

describe('HostAccessNotice', () => {
  it('shows nothing while websites are reachable, or where the API is absent', async () => {
    vi.stubGlobal('chrome', { permissions: fakePermissions(true).api });
    render(<HostAccessNotice />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();

    for (const chrome of [undefined, {}]) {
      vi.stubGlobal('chrome', chrome);
      render(<HostAccessNotice />);
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    }
  });

  it('offers to ask again, and follows the permission as it changes', async () => {
    const permissions = fakePermissions(false);
    vi.stubGlobal('chrome', { permissions: permissions.api });
    const { unmount } = render(<HostAccessNotice />);
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Shaghal cannot see websites.');

    await userEvent.click(screen.getByRole('button', { name: 'Allow access' }));
    expect(permissions.api.request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    expect(screen.queryByRole('status')).toBeNull();

    // Withdrawn again in the browser's settings.
    act(() => permissions.withdraw());
    await screen.findByRole('status');

    unmount();
    expect(permissions.listeners.size).toBe(0);
  });

  it('stays shown when the browser refuses the request', async () => {
    const permissions = fakePermissions(false);
    permissions.api.request.mockImplementation(() => Promise.reject(new Error('not from a click')));
    vi.stubGlobal('chrome', { permissions: permissions.api });
    render(<HostAccessNotice />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allow access' }));
    await settle();
    expect(screen.queryByRole('status')).not.toBeNull();
  });

  it('ignores an answer that arrives after it is gone', async () => {
    const permissions = fakePermissions(false);
    vi.stubGlobal('chrome', { permissions: permissions.api });
    const { unmount } = render(<HostAccessNotice />);
    unmount();
    await settle();
    expect(permissions.api.contains).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reads the answer once where the API has no change events, as in the test fake', async () => {
    const permissions = fakePermissions(false);
    const throwing = {
      addListener: () => {
        throw new Error('permissions.onAdded not implemented');
      },
      removeListener: () => undefined,
    };
    vi.stubGlobal('chrome', { permissions: { ...permissions.api, onAdded: throwing, onRemoved: throwing } });
    const { unmount } = render(<HostAccessNotice />);
    await screen.findByRole('status');
    unmount();
  });
});
