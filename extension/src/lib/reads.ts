import type { ApiResult } from './api';
import { createReadCache } from './cache';
import {
  getCategories,
  getFunctionalities,
  getServiceBySlug,
  servicesToTest,
  type CatalogService,
  type CategoryItem,
  type FunctionalityItem,
  type ServiceMatch,
  type ServiceRecord,
  type TestQueue,
} from './endpoints';
import { activeLanguage } from './i18n';

const MINUTE = 60_000;

/**
 * Page lookups by address. useServiceMatch reads and fills this itself, since
 * a lookup is cancelled when the page moves on.
 */
export const matchCache = createReadCache<ServiceMatch>({
  storageKey: 'cache.match',
  freshMs: 5 * MINUTE,
  keepMs: 30 * MINUTE,
  limit: 50,
});

const records = createReadCache<ServiceRecord>({
  storageKey: 'cache.record',
  freshMs: 5 * MINUTE,
  keepMs: 30 * MINUTE,
  limit: 20,
});

const recordKey = (slug: string) => `${activeLanguage()}:${slug}`;

/** A service's full record in the panel's language, kept or fetched. */
export function loadRecord(slug: string, options?: { force?: boolean }): Promise<ApiResult<ServiceRecord>> {
  return records.load(recordKey(slug), () => getServiceBySlug(slug), options);
}

/** The kept record, if any, without asking. */
export function peekRecord(slug: string): { value: ServiceRecord; fresh: boolean } | undefined {
  return records.peek(recordKey(slug));
}

const functionalities = createReadCache<FunctionalityItem[]>({
  storageKey: 'cache.functionalities',
  freshMs: 60 * MINUTE,
  keepMs: 24 * 60 * MINUTE,
  limit: 3,
});

/** The parts a report can name, in the panel's language. */
export function loadFunctionalities(): Promise<ApiResult<FunctionalityItem[]>> {
  return functionalities.load(activeLanguage(), getFunctionalities);
}

const categories = createReadCache<CategoryItem[]>({
  storageKey: 'cache.categories',
  freshMs: 60 * MINUTE,
  keepMs: 24 * 60 * MINUTE,
  limit: 3,
});

/** Every category, in the panel's language. */
export function loadCategories(): Promise<ApiResult<CategoryItem[]>> {
  return categories.load(activeLanguage(), getCategories);
}

const queues = createReadCache<CatalogService[]>({
  storageKey: 'cache.queue',
  freshMs: 10 * MINUTE,
  keepMs: 60 * MINUTE,
  limit: 6,
});

/** How many services each "help check these" queue offers. */
export const QUEUE_SIZE = 5;

/** A queue of services to test, kept or fetched. */
export function loadQueue(queue: TestQueue): Promise<ApiResult<CatalogService[]>> {
  return queues.load(`${activeLanguage()}:${queue}`, () => servicesToTest(queue, QUEUE_SIZE));
}

/** The kept queue, if any, without asking. */
export function peekQueue(queue: TestQueue): CatalogService[] | undefined {
  return queues.peek(`${activeLanguage()}:${queue}`)?.value;
}
