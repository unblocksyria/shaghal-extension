import { describe, expect, it } from 'vitest';
import { withEdits, type PendingEvidence } from './evidence';
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
