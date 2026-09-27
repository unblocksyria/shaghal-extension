import { readFileSync } from 'node:fs';
import type { CategoryItem, FunctionalityItem, ServiceMatch, ServiceRecord } from '../src/lib/endpoints';

/** One stubbed answer, keyed by `METHOD path`. */
export interface StubAnswer {
  status?: number;
  contentType?: string;
  body: string;
}

/** The page the tester reads while the panel follows it; nothing real sits behind it. */
export const TEST_PAGE_ORIGIN = 'https://stream.test';

/** The token the stubbed verification page solves, asserted on every write. */
export const VERIFICATION_TOKEN = 'e2e-verification-token';

export const TEST_PAGE_HTML = '<!doctype html><meta charset="utf-8"><title>Stream</title><h1>Stream</h1>';

// Serves the same contract as the real verification page: it posts the solved
// token back to the panel's frame (lib/turnstile.ts reads exactly this message).
const VERIFY_PAGE = `<!doctype html><meta charset="utf-8"><script>
const params = new URLSearchParams(location.search);
parent.postMessage(
  {
    type: 'unblocksyria-turnstile',
    nonce: params.get('nonce'),
    action: params.get('action'),
    status: 'solved',
    token: '${VERIFICATION_TOKEN}',
  },
  '*',
);
</script>`;

/** The same fixture files the component tests read, loaded for the browser. */
function fixture<T>(name: string): T {
  const url = new URL(`../src/testing/fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

function json(payload: unknown): StubAnswer {
  return { contentType: 'application/json', body: JSON.stringify(payload) };
}

const answers = new Map<string, StubAnswer>([
  ['POST /services/match', json({ data: fixture<ServiceMatch>('match') })],
  ['GET /services/netflix', json({ data: fixture<ServiceRecord>('service-record') })],
  ['GET /categories', json({ data: fixture<CategoryItem[]>('categories') })],
  ['GET /functionalities', json({ data: fixture<FunctionalityItem[]>('functionalities') })],
  ['POST /services/netflix/vote', json(fixture<{ voteCount: number }>('vote'))],
  ['POST /functionality-reports', json({ id: 'receipt' })],
  ['GET /cdn-cgi/trace', { contentType: 'text/plain', body: 'fl=v8\nloc=SY\nts=1758000000\n' }],
  ['GET /extension/turnstile', { contentType: 'text/html', body: VERIFY_PAGE }],
]);

/** The answer for a request, or undefined when nothing stubbed it, which fails the test. */
export function stubFor(method: string, pathname: string): StubAnswer | undefined {
  return answers.get(`${method} ${pathname}`);
}
