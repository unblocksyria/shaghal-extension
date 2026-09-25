import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { hasVoted, setVote } from './votes';

function answer(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(body, { status })));
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
});

describe('setVote', () => {
  it('remembers a vote and returns the new count', async () => {
    answer({ success: true, voteCount: 12 });
    expect(await setVote('netflix', true)).toEqual({ ok: true, voted: true, voteCount: 12 });
    expect(await hasVoted('netflix')).toBe(true);
  });

  it('forgets a withdrawn vote', async () => {
    answer({ success: true, voteCount: 11 });
    await setVote('netflix', true);
    answer({ success: true, voteCount: 10 });
    expect(await setVote('netflix', false)).toEqual({ ok: true, voted: false, voteCount: 10 });
    expect(await hasVoted('netflix')).toBe(false);
  });

  it('catches up when this network already voted, from the site or another browser', async () => {
    answer({ error: 'ALREADY_VOTED', message: 'Already voted' }, 400);
    expect(await setVote('netflix', true)).toEqual({ ok: true, voted: true, voteCount: null });
    expect(await hasVoted('netflix')).toBe(true);
  });

  it('catches up when there was no vote to withdraw', async () => {
    answer({ error: 'NO_VOTE_FOUND', message: 'No vote' }, 400);
    expect(await setVote('netflix', false)).toEqual({ ok: true, voted: false, voteCount: null });
  });

  it('explains a rate limit and remembers nothing', async () => {
    answer({ error: 'RATE_LIMITED', message: 'Too many' }, 429);
    expect(await setVote('netflix', true)).toEqual({
      ok: false,
      message: 'Too many votes from this network. Try again later.',
    });
    expect(await hasVoted('netflix')).toBe(false);
  });
});
