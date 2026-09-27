import { fakeApi } from '../testing/fakeApi';
import upload from '../testing/fixtures/upload.json';
import { describe, expect, it, vi } from 'vitest';
import { uploadPendingEvidence, withEdits, type PendingEvidence } from './evidence';
import type { ImageEdits } from './imageEdits';

const edits: ImageEdits = { crop: { x: 0, y: 0, width: 5, height: 5 }, boxes: [] };

function captured(): PendingEvidence {
  return {
    id: 'shot',
    blob: new Blob(['capture']),
    previewUrl: 'blob:capture',
    filename: 'unblocksyria-evidence.jpg',
    uploadedUrl: 'https://files.example.invalid/capture.jpg',
  };
}

describe('a screenshot with edits', () => {
  it('sends the edited copy, keeps the capture and the edits, and needs uploading again', async () => {
    const edited = withEdits(captured(), { blob: new Blob(['edited']), edits });
    expect(await edited.blob.text()).toBe('edited');
    expect(await edited.original?.text()).toBe('capture');
    expect(edited.edits).toEqual(edits);
    expect(edited.uploadedUrl).toBeUndefined();
    expect(edited.previewUrl).not.toBe('blob:capture');
    expect(edited.id).toBe('shot');
    expect(edited.filename).toBe('unblocksyria-evidence.jpg');
  });

  it('edits again from the capture, never from an earlier edit', async () => {
    const once = withEdits(captured(), { blob: new Blob(['first']), edits });
    const twice = withEdits(once, { blob: new Blob(['second']), edits });
    expect(await twice.original?.text()).toBe('capture');
    expect(await twice.blob.text()).toBe('second');
  });

  it('goes back to the capture when every edit is taken off', async () => {
    const edited = withEdits(captured(), { blob: new Blob(['edited']), edits });
    const restored = withEdits(edited, null);
    expect(await restored.blob.text()).toBe('capture');
    expect(restored.original).toBeUndefined();
    expect(restored.edits).toBeUndefined();
    expect(restored.uploadedUrl).toBeUndefined();
  });
});

describe('upload lifetime', () => {
  it('reuses a recent claim and refreshes an old one', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const item = { ...captured(), uploadedAt: now };
    const api = fakeApi().on('POST', '/uploads/evidence', { json: upload }).install();
    expect(await uploadPendingEvidence(item, 'submission')).toEqual({ ok: true, data: item });
    expect(api.callsTo('POST', '/uploads/evidence')).toHaveLength(0);
    vi.spyOn(Date, 'now').mockReturnValue(now + 56 * 60_000);
    expect(await uploadPendingEvidence(item, 'submission')).toMatchObject({
      ok: true,
      data: { uploadedUrl: upload.file.url, uploadedAt: now + 56 * 60_000 },
    });
    expect(api.callsTo('POST', '/uploads/evidence')).toHaveLength(1);
  });
  it('refuses an oversized image without making a request', async () => {
    const item = { ...captured(), uploadedUrl: undefined, blob: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]) };
    expect(await uploadPendingEvidence(item, 'submission')).toMatchObject({
      ok: false,
      error: { error: 'INVALID_FILE' },
    });
  });
});
