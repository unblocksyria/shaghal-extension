// Pure route dispatch for the mock API. Answers come from the fixtures in
// src/testing/fixtures/ so the mock, component tests, and e2e stubs share one
// source of truth. The server (server.mjs) handles HTTP; this file only
// decides what a request answers: { status, body } where body is a string.
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('../src/testing/fixtures/', import.meta.url);

function fixture(name) {
  return readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8');
}

// Reads answer the `{ data }` envelope the panel unwraps; writes answer the
// raw payload the real API returns (apiRequest with unwrap:'raw').
const READ = (name) => JSON.stringify({ data: JSON.parse(fixture(name)) });

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// The vote counter starts at the count the fixtures show for each slug (the
// card's number) and moves one per vote. It resets when the mock restarts (a
// map in memory, nothing on disk).
const voteCounts = new Map();

// Where a slug's count starts: its own fixture value (Netflix 12, Google 3,
// YouTube 7), with vote.json as the fallback for slugs no fixture knows.
const seedCount = (slug) => {
  const entry = KNOWN.get(slug);
  const shown = entry ? entry.voteCount : JSON.parse(fixture('vote')).voteCount;
  return Number.isInteger(shown) ? shown : 0;
};

const currentCount = (slug) => {
  if (!voteCounts.has(slug)) voteCounts.set(slug, seedCount(slug));
  return voteCounts.get(slug);
};

// POST adds one vote, DELETE removes one, never below zero.
function changeVote(slug, delta) {
  voteCounts.set(slug, Math.max(currentCount(slug) + delta, 0));
  return { voteCount: voteCounts.get(slug) };
}

// Lookups answer the live counter, so a vote survives a panel reload.
function applyVoteCounts(match) {
  for (const entry of [match.service, ...(match.alternatives ?? [])]) {
    if (entry) entry.voteCount = currentCount(entry.slug);
  }
  return match;
}

// A test triplet the whole receipt flow can be driven through: the key you
// send decides the answer.
const receiptMagic = (key) =>
  key.includes('-completed')
    ? { state: 'completed', status: 200 }
    : key.includes('-unconfirmed')
      ? { state: 'unconfirmed' }
      : { state: 'expired' };

// Which lookup answer a page gets: one match for netflix, a pick list for
// google, nothing tracked for anything else (spec AC-3).
export function matchAnswerFor(url) {
  const host = hostOf(url);
  if (host === null) return 'match-none';
  if (host === 'netflix.com' || host.endsWith('.netflix.com')) return 'match';
  if (host === 'google.com' || host.endsWith('.google.com')) return 'match-many';
  return 'match-none';
}

// The services the fixtures know, so a fetched record can carry the picked
// service's own identity. Seeded from match.json and the pick list.
const KNOWN = (() => {
  const known = new Map();
  for (const name of ['match', 'match-many']) {
    const payload = JSON.parse(fixture(name));
    for (const entry of [payload.service, ...(payload.alternatives ?? [])]) {
      if (entry) known.set(entry.slug, entry);
    }
  }
  return known;
})();

const VERIFIED_FORMS = new Set(['/functionality-reports', '/corrections', '/submissions']);

export function dispatch(method, pathname, rawBody, headers = {}) {
  // CORS preflight: permissive, nothing real is reachable through the mock.
  if (method === 'OPTIONS') {
    return { status: 204, body: '', cors: true };
  }

  const idempotencyKey = (headers['idempotency-key'] ?? '').toString().trim();

  if (method === 'POST' && pathname === '/services/match') {
    const parsed = parseJson(rawBody);
    if (!parsed.ok || typeof parsed.value?.url !== 'string') return { status: 400, body: { error: 'malformed body' } };
    const match = applyVoteCounts(JSON.parse(fixture(matchAnswerFor(parsed.value.url))));
    return { status: 200, body: JSON.stringify({ data: match }) };
  }

  if (method === 'GET' && pathname.startsWith('/services/')) {
    const slug = pathname.slice('/services/'.length);
    if (!slug || slug.includes('/')) return { status: 404, body: { error: 'not found' } };
    const record = JSON.parse(fixture('service-details'));
    const entry = KNOWN.get(slug);
    if (entry) {
      record.id = entry.id;
      record.slug = entry.slug;
      record.name = entry.name;
      record.company = entry.company;
    }
    return { status: 200, body: JSON.stringify({ data: record }) };
  }

  if (method === 'GET' && pathname === '/functionalities') return { status: 200, body: READ('functionalities') };
  if (method === 'GET' && pathname === '/categories') return { status: 200, body: READ('categories') };

  if ((method === 'POST' || method === 'DELETE') && pathname.startsWith('/services/')) {
    const rest = pathname.slice('/services/'.length);
    const [slug, tail] = rest.split('/');
    if (tail === 'vote' && slug)
      return { status: 200, body: JSON.stringify(changeVote(slug, method === 'POST' ? 1 : -1)) };
  }

  if (method === 'POST' && pathname === '/uploads/evidence') {
    const multipart = typeof rawBody === 'string' && rawBody.includes('name="file"');
    if (!multipart) return { status: 400, body: { error: 'no file part' } };
    return { status: 200, body: fixture('upload') };
  }

  if (method === 'POST' && VERIFIED_FORMS.has(pathname)) {
    if (!idempotencyKey) {
      return { status: 400, body: { error: 'missing Idempotency-Key header' } };
    }
    const parsed = parseJson(rawBody);
    if (!parsed.ok) return { status: 400, body: { error: 'malformed body' } };
    return { status: 200, body: JSON.stringify({ id: `mock-${crypto.randomUUID()}` }) };
  }

  if (method === 'POST' && pathname === '/submission-receipts') {
    const parsed = parseJson(rawBody);
    if (!parsed.ok || typeof parsed.value?.key !== 'string') return { status: 400, body: { error: 'malformed body' } };
    return { status: 200, body: JSON.stringify(receiptMagic(parsed.value.key)) };
  }

  return { status: 404, body: { error: 'not found' } };
}
