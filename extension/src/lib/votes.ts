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
const hintKey = (slug: string) => `voteHint:${slug}`;

async function writeVoted(slug: string, voted: boolean): Promise<void> {
  // Independent keys avoid losing another window's vote during read/modify/write.
  await chrome.storage.local.set({ [hintKey(slug)]: voted }).catch(() => undefined);
}

export async function hasVoted(slug: string): Promise<boolean> {
  const key = hintKey(slug);
  const stored: Record<string, unknown> = await chrome.storage.local.get([key, VOTED_KEY]).catch(() => ({}));
  if (typeof stored[key] === 'boolean') return stored[key];
  // Read legacy hints without a migration that could overwrite a concurrent vote.
  return Array.isArray(stored[VOTED_KEY]) && stored[VOTED_KEY].includes(slug);
}

export function watchVote(slug: string, changed: (voted: boolean) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && hintKey(slug) in changes) changed(changes[hintKey(slug)]?.newValue === true);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
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
