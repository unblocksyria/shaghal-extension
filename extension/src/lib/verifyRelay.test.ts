import { describe, expect, it, vi } from 'vitest';
import { isRelayMessage, isVerifyFrame, verifyPageMatch } from './verifyRelay';

vi.mock('./config', () => ({ VERIFY_BASE: 'http://localhost:8790' }));

const NONCE = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('verifyPageMatch', () => {
  it('names the host without its port, so any local port matches', () => {
    expect(verifyPageMatch()).toBe('http://localhost/extension/turnstile*');
  });
});

describe('isVerifyFrame', () => {
  const frame = `http://localhost:8790/extension/turnstile?action=vote&nonce=${NONCE}`;
  it('accepts the frame opened for this nonce and action', () => {
    expect(isVerifyFrame(frame, NONCE, 'vote')).toBe(true);
  });
  it.each([
    ['another origin', `https://verify.example.test/extension/turnstile?action=vote&nonce=${NONCE}`],
    ['another path', `http://localhost:8790/extension/other?action=vote&nonce=${NONCE}`],
    [
      'another nonce',
      `http://localhost:8790/extension/turnstile?action=vote&nonce=00000000-0000-4000-8000-000000000000`,
    ],
    ['another action', `http://localhost:8790/extension/turnstile?action=upload&nonce=${NONCE}`],
    ['no address', undefined],
    ['an unparsable address', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(isVerifyFrame(url, NONCE, 'vote')).toBe(false);
  });
});

describe('isRelayMessage', () => {
  it('requires the relay type and a string detail', () => {
    expect(isRelayMessage({ type: 'unblocksyria-turnstile-relay', detail: '{}' })).toBe(true);
    expect(isRelayMessage({ type: 'unblocksyria-turnstile-relay', detail: {} })).toBe(false);
    expect(isRelayMessage({ type: 'unblocksyria-turnstile', detail: '{}' })).toBe(false);
    expect(isRelayMessage(null)).toBe(false);
  });
});
