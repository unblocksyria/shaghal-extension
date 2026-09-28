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

    vi.stubGlobal('chrome', undefined);
    render(<HostAccessNotice />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
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
});
