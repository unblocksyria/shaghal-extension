import { describe, expect, it } from 'vitest';
import {
  uploadEvidence,
  matchService,
  getCategories,
  getFunctionalities,
  getServiceBySlug,
  voteForService,
} from './endpoints';
import { fakeApi } from '../testing/fakeApi';
import match from '../testing/fixtures/match.json';
import upload from '../testing/fixtures/upload.json';

const screenshot = new Blob(['jpeg'], { type: 'image/jpeg' });

describe('uploadEvidence', () => {
  it('answers with the uploaded file’s address', async () => {
    fakeApi().on('POST', '/uploads/evidence', { json: upload }).install();
    expect(await uploadEvidence(screenshot, 'shot.jpg', 'submission')).toEqual({ ok: true, data: upload.file.url });
  });

  // A 200 without a file address must fail cleanly, or the form stays stuck sending.
  it.each([
    ['nothing', null],
    ['no file', {}],
    ['a file with no address', { file: {} }],
    ['an empty address', { file: { url: '' } }],
    ['an address that is not text', { file: { url: 42 } }],
  ])('refuses an answer with %s, and never throws', async (_name, json) => {
    fakeApi().on('POST', '/uploads/evidence', { json }).install();
    expect(await uploadEvidence(screenshot, 'shot.jpg', 'submission')).toEqual({
      ok: false,
      error: { error: 'BAD_RESPONSE', message: 'The upload answered without a file address.', status: 200 },
    });
  });
});

describe('untrusted API data', () => {
  it.each([
    ['POST', '/services/match', () => matchService('https://example.com'), { service: {}, alternatives: [] }],
    ['POST', '/services/match', () => matchService('https://example.com'), { ...match, matchType: 'sibling' }],
    [
      'POST',
      '/services/match',
      () => matchService('https://example.com'),
      { ...match, service: { ...match.service, company: {} } },
    ],
    [
      'POST',
      '/services/match',
      () => matchService('https://example.com'),
      { ...match, service: { ...match.service, voteCount: 1.5 } },
    ],
    ['GET', '/categories', getCategories, [{ id: 'x' }]],
    ['GET', '/functionalities', getFunctionalities, null],
    ['GET', '/functionalities', getFunctionalities, [{ slug: 'constructor', name: 'Constructor' }]],
    ['GET', '/services/x', () => getServiceBySlug('x'), { id: 'x', name: 'X', url: null, functionalities: [{}] }],
    [
      'GET',
      '/services/x',
      () => getServiceBySlug('x'),
      { id: 'x', name: 'X', url: null, functionalities: [{ slug: 'a', name: 'A', level: 'broken' }] },
    ],
    [
      'GET',
      '/services/x',
      () => getServiceBySlug('x'),
      {
        id: 'x',
        name: 'X',
        url: null,
        functionalities: [{ slug: 'a', name: 'A', level: 'working', lastObservedAt: 7 }],
      },
    ],
  ] as const)('rejects malformed data from %s %s', async (method, path, request, data) => {
    fakeApi().on(method, path, { data }).install();
    expect(await request()).toMatchObject({ ok: false, error: { error: 'BAD_RESPONSE' } });
  });
  it.each([null, {}, { voteCount: -1 }, { voteCount: '12' }])('rejects malformed vote receipts', async (json) => {
    fakeApi().on('POST', '/services/x/vote', { json }).install();
    expect(await voteForService('x')).toMatchObject({ ok: false, error: { error: 'BAD_RESPONSE' } });
  });
});
