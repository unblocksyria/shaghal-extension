// Direct tests of the pure dispatch. These pin the routes the panel talks to
// (the API boundary table in ARCHITECTURE.md) so the mock cannot drift from
// the client's contract unnoticed. No server, no port.
import { describe, expect, it } from 'vitest';
import { dispatch, matchAnswerFor } from './dispatch.mjs';

const KEY = { 'idempotency-key': 'test-key-1' };

describe('lookup dispatch by page host (AC-3)', () => {
  it('answers netflix.com with the single match payload', () => {
    const { status, body } = dispatch(
      'POST',
      '/services/match',
      JSON.stringify({ url: 'https://www.netflix.com/title/123' }),
    );
    expect(status).toBe(200);
    const answer = JSON.parse(body);
    expect(answer.data.service.slug).toBe('netflix');
  });

  it('answers google.com with the pick list', () => {
    const { body } = dispatch('POST', '/services/match', JSON.stringify({ url: 'https://google.com/search?q=x' }));
    expect(JSON.parse(body).data.service).toBeNull();
    expect(Array.isArray(JSON.parse(body).data.alternatives)).toBe(true);
  });

  it('answers every other host with nothing tracked', () => {
    const { body } = dispatch('POST', '/services/match', JSON.stringify({ url: 'https://example.com' }));
    expect(JSON.parse(body).data).toEqual({ service: null, matchType: null, alternatives: [] });
  });

  it('answers a malformed lookup with 400 (AC-8)', () => {
    const bad = dispatch('POST', '/services/match', 'not json at all');
    const missingUrl = dispatch('POST', '/services/match', JSON.stringify({ locale: 'en' }));
    expect(bad.status).toBe(400);
    expect(missingUrl.status).toBe(400);
  });

  it('reads every fixture as valid JSON, wrapped in data (AC-2)', () => {
    const reads = [
      dispatch('GET', '/services/svc-netflix', ''),
      dispatch('GET', '/functionalities', ''),
      dispatch('GET', '/categories', ''),
    ];
    for (const answer of reads) {
      expect(answer.status).toBe(200);
      expect(JSON.parse(answer.body).data).toBeDefined();
    }
  });
});

describe('writes (AC-4)', () => {
  it('answers a vote with a count that moves, then down on unvote', () => {
    const up = dispatch('POST', '/services/svc-netflix/vote', '');
    expect(up.status).toBe(200);
    const afterUp = JSON.parse(up.body).voteCount;
    expect(afterUp).toBeGreaterThan(0);
    const down = JSON.parse(dispatch('DELETE', '/services/svc-netflix/vote', '').body).voteCount;
    expect(down).toBe(afterUp - 1);
  });

  it('answers an upload with a file url, and no file part with 400', () => {
    const withFile = dispatch(
      'POST',
      '/uploads/evidence',
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\n',
    );
    expect(withFile.status).toBe(200);
    expect(JSON.parse(withFile.body).file.url).toContain('https://');
    expect(dispatch('POST', '/uploads/evidence', '').status).toBe(400);
  });

  it('each form send needs its Idempotency-Key and answers a fake receipt', () => {
    const paths = ['/functionality-reports', '/corrections', '/submissions'];
    for (const pathname of paths) {
      const refused = dispatch('POST', pathname, JSON.stringify({}));
      expect(refused.status).toBe(400);
      const ok = dispatch('POST', pathname, JSON.stringify({}), KEY);
      expect(ok.status).toBe(200);
      expect(JSON.parse(ok.body).id).toMatch(/^mock-/);
      expect(dispatch('POST', pathname, 'broken', KEY).status).toBe(400);
    }
  });
});

describe('receipts magic key convention (AC-5)', () => {
  it('answers the three states by key suffix', () => {
    const send = (key) => JSON.parse(dispatch('POST', '/submission-receipts', JSON.stringify({ key })).body);
    expect(send('abc-completed')).toEqual({ state: 'completed', status: 200 });
    expect(send('abc-unconfirmed')).toEqual({ state: 'unconfirmed' });
    expect(send('abc-other')).toEqual({ state: 'expired' });
  });

  it('refuses a malformed receipt lookup with 400', () => {
    expect(dispatch('POST', '/submission-receipts', '{}').status).toBe(400);
    expect(dispatch('POST', '/submission-receipts', 'oops').status).toBe(400);
  });
});

describe('edges (AC-8)', () => {
  it('answers an unknown route with 404', () => {
    expect(dispatch('GET', '/nope', '').status).toBe(404);
    expect(dispatch('POST', '/corrections/extra', '', KEY).status).toBe(404);
  });

  it('answers the vote route only when the tail is vote', () => {
    expect(dispatch('POST', '/services/svc-x/other', '').status).toBe(404);
  });
});

describe('host parsing helpers', () => {
  it('handles unparsable urls', () => {
    expect(matchAnswerFor(':: garbage')).toBe('match-none');
  });

  it('answers www subdomains like the apex host (AC-3)', () => {
    expect(matchAnswerFor('https://www.netflix.com/browse')).toBe('match');
    expect(matchAnswerFor('https://www.google.com/maps')).toBe('match-many');
    expect(matchAnswerFor('https://netflix.example.com')).toBe('match-none');
  });

  it('keeps the answer free of the locale the client sends (AC-2)', () => {
    const en = dispatch('POST', '/services/match', JSON.stringify({ url: 'https://netflix.com', locale: 'en' }));
    const ar = dispatch('POST', '/services/match', JSON.stringify({ url: 'https://netflix.com', locale: 'ar' }));
    expect(en.body).toBe(ar.body);
  });
});

describe('a fetched record carries the picked service identity (AC-2)', () => {
  it('answers a known slug with its own identity fields', () => {
    const { body } = dispatch('GET', '/services/google', '');
    const record = JSON.parse(body).data;
    expect(record).toMatchObject({ id: 'svc-google', slug: 'google', name: 'Google' });
  });

  it('keeps the placeholder record for an unknown slug', () => {
    const { body } = dispatch('GET', '/services/unknown-thing', '');
    expect(JSON.parse(body).data.id).toBe('svc-netflix');
  });
});

describe('vote counts follow the fixture the card shows (AC-4)', () => {
  it('moves a pick list count by one per vote, starting from its fixture value', () => {
    const up = JSON.parse(dispatch('POST', '/services/youtube/vote', '').body).voteCount;
    const down = JSON.parse(dispatch('DELETE', '/services/youtube/vote', '').body).voteCount;
    expect(up).toBe(8);
    expect(down).toBe(7);
  });

  it('answers lookups with the live count after a vote', () => {
    const up = JSON.parse(dispatch('POST', '/services/google/vote', '').body).voteCount;
    const match = JSON.parse(dispatch('POST', '/services/match', JSON.stringify({ url: 'https://google.com' })).body);
    const entry = match.data.alternatives.find((alternative) => alternative.slug === 'google');
    expect(entry.voteCount).toBe(up);
  });
});
