import { removeVoteForService, voteForService } from './endpoints';

const VOTED_KEY = 'votedServiceSlugs';

/**
 * Services this browser has voted for, remembered locally.
 *
 * The API counts one vote per network address and offers no way to ask
 * whether one exists, so this is a hint for the button, not the truth. The
 * API's `ALREADY_VOTED` and `NO_VOTE_FOUND` answers correct it: someone else
 * on the same network may have voted, or the vote was cast from the website.
 */
async function readVoted(): Promise<Set<string>> {
  const stored = await chrome.storage.local.get(VOTED_KEY);
  const slugs = stored[VOTED_KEY];
  return new Set(Array.isArray(slugs) ? slugs.filter((slug): slug is string => typeof slug === 'string') : []);
}

async function writeVoted(slug: string, voted: boolean): Promise<void> {
  const current = await readVoted();
  if (voted) current.add(slug);
  else current.delete(slug);
  await chrome.storage.local.set({ [VOTED_KEY]: [...current] });
}

export async function hasVoted(slug: string): Promise<boolean> {
  return (await readVoted()).has(slug);
}

export type VoteOutcome = { ok: true; voted: boolean; voteCount: number | null } | { ok: false; message: string };

/**
 * Cast or withdraw a vote, returning the state to show afterwards. An answer
 * that says the vote was already in the wanted state is a success, not an
 * error: the button simply catches up with the server.
 */
export async function setVote(slug: string, wantVoted: boolean): Promise<VoteOutcome> {
  const result = wantVoted ? await voteForService(slug) : await removeVoteForService(slug);
  if (result.ok) {
    await writeVoted(slug, wantVoted);
    return { ok: true, voted: wantVoted, voteCount: result.data.voteCount };
  }
  if (result.error.error === 'ALREADY_VOTED') {
    await writeVoted(slug, true);
    return { ok: true, voted: true, voteCount: null };
  }
  if (result.error.error === 'NO_VOTE_FOUND') {
    await writeVoted(slug, false);
    return { ok: true, voted: false, voteCount: null };
  }
  if (result.error.status === 429) {
    return { ok: false, message: 'Too many votes from this network. Try again later.' };
  }
  return { ok: false, message: result.error.message };
}
