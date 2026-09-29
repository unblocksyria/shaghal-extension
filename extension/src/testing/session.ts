/**
 * A `chrome.storage.session` that clones the way Chrome does.
 *
 * The fake browser writes every value through JSON, which quietly turns a
 * stored `ArrayBuffer` into an empty object. Chrome keeps binary bytes whole,
 * so anything that stores a draft's screenshot bytes has to clone structurally
 * instead. Call it once per test, after the fake browser has been reset.
 */

type Query = string | string[] | Record<string, unknown> | null | undefined;

type Session = {
  set(items: Record<string, unknown>): Promise<void>;
  get(query?: Query): Promise<Record<string, unknown>>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

const store = new Map<string, unknown>();

function pick(query: Query): Record<string, unknown> {
  if (query === undefined || query === null) return Object.fromEntries(store);
  if (typeof query === 'string') {
    const found = store.get(query);
    return found === undefined ? {} : { [query]: found };
  }
  if (Array.isArray(query)) {
    const out: Record<string, unknown> = {};
    for (const key of query) {
      const found = store.get(key);
      if (found !== undefined) out[key] = found;
    }
    return out;
  }
  const out: Record<string, unknown> = { ...query };
  for (const [key, fallback] of Object.entries(query)) {
    const found = store.get(key);
    out[key] = found === undefined ? fallback : found;
  }
  return out;
}

export function stubSession(): void {
  store.clear();
  const session = chrome.storage.session as unknown as Session;
  session.set = (items) => {
    for (const [key, value] of Object.entries(items)) store.set(key, structuredClone(value));
    return Promise.resolve();
  };
  session.get = (query) => Promise.resolve(structuredClone(pick(query)));
  session.remove = (keys) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) store.delete(key);
    return Promise.resolve();
  };
  session.clear = () => {
    store.clear();
    return Promise.resolve();
  };
}
