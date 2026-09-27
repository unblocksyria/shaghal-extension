import { describe, expect, it } from 'vitest';
import { uploadEvidence } from './endpoints';
import { fakeApi } from '../testing/fakeApi';
import upload from '../testing/fixtures/upload.json';

const screenshot = new Blob(['jpeg'], { type: 'image/jpeg' });

describe('uploadEvidence', () => {
  it('answers with the uploaded file’s address', async () => {
    fakeApi().on('POST', '/uploads/evidence', { json: upload }).install();
    expect(await uploadEvidence(screenshot, 'shot.jpg', 'submission')).toEqual({ ok: true, data: upload.file.url });
  });

  // A 200 without a file address used to throw, which left the form sending forever.
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
