/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileToken } from './turnstile';

vi.mock('./config', () => ({ IS_LOCAL_API: false, VERIFY_BASE: 'https://verify.example.test' }));
afterEach(() => vi.useRealTimers());

function bridge() {
  const frame = document.querySelector('iframe')!;
  const nonce = new URL(frame.src).searchParams.get('nonce');
  const send = (fields: object, origin = 'https://verify.example.test', source: Window | null = frame.contentWindow) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source,
        data: {
          type: 'unblocksyria-turnstile',
          nonce,
          action: 'vote',
          ...fields,
        },
      }),
    );
  return { frame, send };
}

describe('verification boundary', () => {
  it('ignores forged origins, sibling frames, wrong nonces and empty tokens', async () => {
    const result = turnstileToken('vote');
    const { send } = bridge();
    send({ status: 'solved', token: 'forged' }, 'https://evil.example');
    send({ status: 'solved', token: 'forged' }, undefined, window);
    send({ status: 'solved', token: 'forged', nonce: 'wrong' });
    send({ status: 'solved', token: '' });
    expect(document.querySelector('iframe')).not.toBeNull();
    send({ status: 'solved', token: 'real' });
    expect(await result).toEqual({ ok: true, token: 'real' });
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('does not let repeated interactive messages extend the deadline', async () => {
    vi.useFakeTimers();
    const result = turnstileToken('vote');
    const { send } = bridge();
    send({ status: 'interactive' });
    await vi.advanceTimersByTimeAsync(60_000);
    send({ status: 'interactive' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await result).toEqual({ ok: false, message: 'Verification timed out. Try again.' });
    expect(document.querySelector('iframe')).toBeNull();
  });
});
