import type { ApiResult } from './api';

/**
 * Answers to API reads, kept so the panel asks for each one once.
 *
 * Each cache lives in memory and, when it names a `storageKey`, is mirrored to
 * `chrome.storage.session`. Session storage is held in memory too and emptied
 * when the browser closes, so nothing reaches the disk, but a panel that is
 * closed and reopened starts with the answers it had.
 *
 * An answer younger than `freshMs` is used as is. One younger than `keepMs` is
 * still shown while a new one loads. Older ones are dropped. Only successful
 * answers are kept, and at most `limit` per cache, oldest out first.
 */

interface Entry<T> {
  value: T;
  /** When the answer arrived, in ms since the epoch. */
  at: number;
}

export interface ReadCache<T> {
  /** The kept answer and whether it is still fresh, without asking the API. */
  peek(key: string): { value: T; fresh: boolean } | undefined;
  /**
   * The fresh answer if there is one, else a request. Concurrent loads of one
   * key share a request. `force` asks again even when the answer is fresh.
   */
  load(key: string, fetcher: () => Promise<ApiResult<T>>, options?: { force?: boolean }): Promise<ApiResult<T>>;
  /** Keeps an answer that arrived some other way. */
  put(key: string, value: T): void;
  delete(key: string): void;
}

interface Registered {
  storageKey?: string;
  restore(stored: unknown): void;
  clear(): void;
}

const registry: Registered[] = [];

function sessionStorage(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session;
}

export function createReadCache<T>(options: {
  storageKey?: string;
  freshMs: number;
  keepMs: number;
  limit: number;
}): ReadCache<T> {
  const entries = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<ApiResult<T>>>();
  let writeQueued = false;

  const live = (key: string): Entry<T> | undefined => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.at > options.keepMs) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  // One write per turn of the event loop, however many answers arrived in it.
  const persist = () => {
    const area = sessionStorage();
    if (options.storageKey === undefined || area === undefined || writeQueued) return;
    writeQueued = true;
    queueMicrotask(() => {
      writeQueued = false;
      // A full or missing session storage only costs the warm start.
      void area.set({ [options.storageKey!]: Object.fromEntries(entries) }).catch(() => undefined);
    });
  };

  const store = (key: string, value: T) => {
    entries.delete(key);
    if (entries.size >= options.limit) entries.delete(entries.keys().next().value!);
    entries.set(key, { value, at: Date.now() });
    persist();
  };

  registry.push({
    storageKey: options.storageKey,
    restore(stored) {
      if (typeof stored !== 'object' || stored === null) return;
      for (const [key, entry] of Object.entries(stored as Record<string, unknown>)) {
        if (entries.has(key) || typeof entry !== 'object' || entry === null) continue;
        const { value, at } = entry as Partial<Entry<T>>;
        if (typeof at !== 'number' || value === undefined || Date.now() - at > options.keepMs) continue;
        if (entries.size >= options.limit) break;
        entries.set(key, { value, at });
      }
    },
    clear() {
      entries.clear();
      pending.clear();
    },
  });

  return {
    peek(key) {
      const entry = live(key);
      return entry === undefined ? undefined : { value: entry.value, fresh: Date.now() - entry.at <= options.freshMs };
    },
    load(key, fetcher, loadOptions = {}) {
      const entry = live(key);
      if (loadOptions.force !== true && entry !== undefined && Date.now() - entry.at <= options.freshMs) {
        return Promise.resolve({ ok: true, data: entry.value });
      }
      const inFlight = pending.get(key);
      if (inFlight !== undefined) return inFlight;
      const request = fetcher().then((result) => {
        if (pending.get(key) === request) pending.delete(key);
        if (result.ok) store(key, result.data);
        return result;
      });
      pending.set(key, request);
      return request;
    },
    put: store,
    delete(key) {
      entries.delete(key);
      pending.delete(key);
      persist();
    },
  };
}

/** Restores every persisted cache from session storage. Run once before the first render. */
export async function hydrateReadCaches(): Promise<void> {
  const area = sessionStorage();
  const keys = registry.flatMap((cache) => (cache.storageKey === undefined ? [] : [cache.storageKey]));
  if (area === undefined || keys.length === 0) return;
  const stored: Record<string, unknown> = await area.get(keys).catch(() => ({}));
  for (const cache of registry) if (cache.storageKey !== undefined) cache.restore(stored[cache.storageKey]);
}

/** Forgets every kept answer, in memory only. For tests. */
export function clearReadCaches(): void {
  for (const cache of registry) cache.clear();
}
