import { removeVoteForService, voteForService } from './endpoints';
import { i18next } from './i18n';

const VOTED_KEY = 'votedServiceSlugs';

/**
 * Local record of this browser's votes, one key per service.
 *
 * The API counts one vote per network address and cannot be asked whether one
 * exists, so this is only a hint for the button. `ALREADY_VOTED` and
 * `NO_VOTE_FOUND` correct it when someone else on the network, or the website,
 * cast or withdrew the vote.
 */
const hintKey = (slug: string) => `voteHint:${slug}`;

async function writeVoted(slug: string, voted: boolean): Promise<void> {
  // One key per service avoids a read-modify-write that could drop another window's vote.
  await chrome.storage.local.set({ [hintKey(slug)]: voted }).catch(() => undefined);
}

export async function hasVoted(slug: string): Promise<boolean> {
  const key = hintKey(slug);
  const stored: Record<string, unknown> = await chrome.storage.local.get([key, VOTED_KEY]).catch(() => ({}));
  if (typeof stored[key] === 'boolean') return stored[key];
  // Legacy list of slugs. Read without migrating, since a migration could overwrite a concurrent vote.
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
 * Casts or withdraws a vote and returns the state to show. `ALREADY_VOTED` and
 * `NO_VOTE_FOUND` count as success, since the server is already in that state.
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
    return { ok: false, message: i18next.t('votes.rateLimited') };
  }
  return { ok: false, message: result.error.message };
}
