/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { turnstileToken } from './turnstile';
import { RELAY_MESSAGE_TYPE } from './verifyRelay';

vi.mock('./config', () => ({ IS_LOCAL_API: false, VERIFY_BASE: 'https://verify.example.test' }));

type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void;
const listeners = new Set<Listener>();

beforeEach(() => {
  // WXT's test plugin sets this to "false"; see isFirefox in verifyRelay.ts.
  vi.stubEnv('FIREFOX', 'true');
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener),
      },
    },
  });
});
afterEach(() => {
  listeners.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function bridge() {
  const frame = document.querySelector('iframe')!;
  const url = new URL(frame.src);
  const nonce = url.searchParams.get('nonce');
  // `sender.url` is the relaying frame's address; `null` sends none at all.
  const relay = (fields: object, senderUrl: string | null = url.toString(), type = RELAY_MESSAGE_TYPE) => {
    const detail = JSON.stringify({ type: 'unblocksyria-turnstile', nonce, action: 'vote', ...fields });
    for (const listener of listeners) listener({ type, detail }, senderUrl === null ? {} : { url: senderUrl });
  };
  return { frame, url, nonce, relay };
}

describe('the Firefox relay', () => {
  it('trusts only a well-formed relay from the frame carrying its nonce', async () => {
    const result = turnstileToken('vote');
    const { frame, url, nonce, relay } = bridge();
    expect(listeners.size).toBe(1);
    const other = new URL(frame.src);
    other.searchParams.set('nonce', '00000000-0000-4000-8000-000000000000');
    relay({ status: 'solved', token: 'forged' }, other.toString());
    relay({ status: 'solved', token: 'forged' }, `https://evil.example/extension/turnstile?action=vote&nonce=${nonce}`);
    relay({ status: 'solved', token: 'forged' }, null);
    relay({ status: 'solved', token: 'forged' }, url.toString(), 'other');
    relay({ status: 'solved', token: 'forged', nonce: 'wrong' });
    for (const listener of listeners) listener({ type: RELAY_MESSAGE_TYPE, detail: '{not json' }, { url: frame.src });
    // Firefox never receives the page's message by postMessage.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://verify.example.test',
        source: frame.contentWindow,
        data: { type: 'unblocksyria-turnstile', nonce, action: 'vote', status: 'solved', token: 'posted' },
      }),
    );
    expect(document.querySelector('iframe')).not.toBeNull();
    relay({ status: 'solved', token: 'real' });
    expect(await result).toEqual({ ok: true, token: 'real' });
    expect(document.querySelector('iframe')).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it('shows the challenge on interactive and reports an error code', async () => {
    const result = turnstileToken('vote');
    const { relay } = bridge();
    relay({ status: 'interactive' });
    expect(document.querySelector('dialog')?.inert).toBe(false);
    relay({ status: 'error', code: '300030' });
    expect(await result).toEqual({ ok: false, message: 'Verification failed (error 300030). Try again.' });
  });
});
