import { describe, expect, it } from 'vitest';
import { readMessage } from './turnstile';

const NONCE = '6f1c2b8e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
const base = { type: 'unblocksyria-turnstile', nonce: NONCE, action: 'vote' };

describe('readMessage', () => {
  it('reads a solved token for this request', () => {
    expect(readMessage({ ...base, status: 'solved', token: 'abc' }, NONCE, 'vote')).toEqual({
      status: 'solved',
      token: 'abc',
    });
  });

  it('reads the interactive and error statuses', () => {
    expect(readMessage({ ...base, status: 'interactive' }, NONCE, 'vote')).toEqual({ status: 'interactive' });
    expect(readMessage({ ...base, status: 'error', code: 300030 }, NONCE, 'vote')).toEqual({
      status: 'error',
      code: '300030',
    });
  });

  it('ignores a message for another request or another action', () => {
    expect(readMessage({ ...base, nonce: 'other', status: 'solved', token: 'abc' }, NONCE, 'vote')).toBeNull();
    expect(readMessage({ ...base, status: 'solved', token: 'abc' }, NONCE, 'report')).toBeNull();
  });

  it('ignores anything that is not the page speaking', () => {
    expect(readMessage(null, NONCE, 'vote')).toBeNull();
    expect(readMessage('solved', NONCE, 'vote')).toBeNull();
    expect(readMessage({ ...base, type: 'other', status: 'solved', token: 'abc' }, NONCE, 'vote')).toBeNull();
    expect(readMessage({ ...base, status: 'solved' }, NONCE, 'vote')).toBeNull();
    expect(readMessage({ ...base, status: 'unknown' }, NONCE, 'vote')).toBeNull();
  });
});
