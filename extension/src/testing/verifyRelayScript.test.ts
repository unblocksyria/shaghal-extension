/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import relay from '../entrypoints/verify-relay.content';
import { RELAY_EVENT, RELAY_MESSAGE_TYPE } from '../lib/verifyRelay';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the verification relay', () => {
  it('runs only on the verification page, in every frame, before the page script', () => {
    expect(relay.matches).toEqual([expect.stringMatching(/^https?:\/\/[^/:]+\/extension\/turnstile\*$/)]);
    expect(relay.allFrames).toBe(true);
    expect(relay.runAt).toBe('document_start');
    expect(relay.include).toEqual(['firefox']);
  });

  it("forwards the page's events unread, and only when they carry a string", async () => {
    const sendMessage = vi.fn(() => Promise.reject(new Error('no panel is listening')));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    if (relay.main === undefined) throw new Error('The content script has no main.');
    void relay.main(undefined as never);

    document.dispatchEvent(new CustomEvent(RELAY_EVENT, { detail: { status: 'solved', token: 'object' } }));
    document.dispatchEvent(new CustomEvent(RELAY_EVENT));
    expect(sendMessage).not.toHaveBeenCalled();

    const detail = JSON.stringify({ status: 'solved', token: 'x' });
    document.dispatchEvent(new CustomEvent(RELAY_EVENT, { detail }));
    expect(sendMessage).toHaveBeenCalledWith({ type: RELAY_MESSAGE_TYPE, detail });
    // The rejection above is swallowed.
    await settle();
  });
});
