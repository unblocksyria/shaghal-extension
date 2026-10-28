/**
 * What this browser has sent, newest first, so the card can mark the parts a
 * tester already reported and Settings can list their reports.
 *
 * The API can't say what became of a report, so this is only a record of
 * sending: the service, the parts and their levels, and when. No notes,
 * screenshots or email are kept. It lives in local storage until the tester
 * clears it in Settings, and holds at most `LIMIT` entries.
 */

export interface SentPart {
  /** The catalogue slug, or absent for a part the tester named. */
  slug?: string;
  name: string;
  level: 'working' | 'failing';
}

export interface SentEntry {
  kind: 'report' | 'correction' | 'service';
  /** The service's slug, absent for a new service. */
  serviceSlug?: string;
  serviceName: string;
  /** When it was sent, in ms since the epoch. */
  at: number;
  /** Reports only: the parts sent. */
  parts?: SentPart[];
  /** Reports only: the host the report was tested on. */
  testedHost?: string | null;
}

const KEY = 'sentHistory';
const LIMIT = 50;

function isEntry(value: unknown): value is SentEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    ['report', 'correction', 'service'].includes(String(entry.kind)) &&
    typeof entry.serviceName === 'string' &&
    typeof entry.at === 'number' &&
    (entry.serviceSlug === undefined || typeof entry.serviceSlug === 'string') &&
    (entry.parts === undefined || Array.isArray(entry.parts))
  );
}

function readList(stored: unknown): SentEntry[] {
  return Array.isArray(stored) ? stored.filter(isEntry) : [];
}

export async function sentHistory(): Promise<SentEntry[]> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(KEY).catch(() => ({}));
  return readList(stored[KEY]);
}

/**
 * Adds an entry, dated now unless `at` says otherwise. A failure to save never
 * turns a confirmed send into an error.
 */
export async function recordSent(entry: Omit<SentEntry, 'at'> & { at?: number }): Promise<void> {
  const list = await sentHistory();
  const dated: SentEntry = { ...entry, at: entry.at ?? Date.now() };
  await chrome.storage.local.set({ [KEY]: [dated, ...list].slice(0, LIMIT) }).catch(() => undefined);
}

export async function clearSentHistory(): Promise<void> {
  await chrome.storage.local.remove(KEY).catch(() => undefined);
}

/** Calls `changed` with the new list whenever any panel records or clears an entry. */
export function watchSentHistory(changed: (list: SentEntry[]) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && KEY in changes) changed(readList(changes[KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** How long the card marks a part as reported by this browser. */
export const REPORTED_MARK_MS = 30 * 24 * 60 * 60_000;

/**
 * The newest time each part of `serviceSlug` was reported from this browser
 * within the last 30 days, by part slug.
 */
export function recentlyReported(list: SentEntry[], serviceSlug: string, now = Date.now()): Map<string, number> {
  const marks = new Map<string, number>();
  for (const entry of list) {
    if (entry.kind !== 'report' || entry.serviceSlug !== serviceSlug || now - entry.at > REPORTED_MARK_MS) continue;
    for (const part of entry.parts ?? []) {
      if (part.slug !== undefined && !marks.has(part.slug)) marks.set(part.slug, entry.at);
    }
  }
  return marks;
}
