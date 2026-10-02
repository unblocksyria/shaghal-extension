import { fakeApi } from '../testing/fakeApi';
import upload from '../testing/fixtures/upload.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureScreenshot,
  EVIDENCE_ACCEPT,
  fromFile,
  shrinkToFit,
  uploadPendingEvidence,
  withEdits,
  type PendingEvidence,
} from './evidence';
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

// Node has no canvas or image decoder. These fakes record what the resize asks of them.
describe('fitting a capture under the upload limit', () => {
  const drawn: { size: [number, number]; drawImage: unknown[]; convert: unknown }[] = [];
  /** Each convertToBlob hands out the next of these. */
  const outputs: Blob[] = [];
  let noContext = false;
  const bitmap = { width: 4000, height: 3000, close: vi.fn() };
  const decode = vi.fn(() => Promise.resolve(bitmap));

  class FakeCanvas {
    private readonly record: { size: [number, number]; drawImage: unknown[]; convert: unknown };
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      this.record = { size: [width, height], drawImage: [], convert: undefined };
      drawn.push(this.record);
    }
    getContext() {
      if (noContext) return null;
      const record = this.record;
      return {
        drawImage: (...args: unknown[]) => {
          record.drawImage = args;
        },
      };
    }
    convertToBlob(options: unknown): Promise<Blob> {
      this.record.convert = options;
      const next = outputs.shift();
      if (next === undefined) throw new Error('The test queued no output for this canvas');
      return Promise.resolve(next);
    }
  }

  const over = () => new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]);

  beforeEach(() => {
    drawn.length = 0;
    outputs.length = 0;
    noContext = false;
    bitmap.close.mockClear();
    decode.mockClear();
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  });

  it('leaves a capture that already fits untouched', async () => {
    const blob = new Blob(['small']);
    expect(await shrinkToFit(blob)).toBe(blob);
    expect(decode).not.toHaveBeenCalled();
  });

  it('scales an oversized capture down by a quarter at a time until it fits', async () => {
    const small = new Blob(['small']);
    outputs.push(over(), small);

    expect(await shrinkToFit(over())).toBe(small);
    expect(drawn.map((canvas) => canvas.size)).toEqual([
      [3000, 2250],
      [2250, 1688],
    ]);
    expect(drawn[0]?.drawImage).toEqual([bitmap, 0, 0, 3000, 2250]);
    expect(drawn[0]?.convert).toEqual({ type: 'image/jpeg', quality: 0.85 });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('gives up after four attempts and still frees the decoded image', async () => {
    outputs.push(over(), over(), over(), over());
    await expect(shrinkToFit(over())).rejects.toThrow('The screenshot is too large. Capture a smaller area.');
    expect(drawn).toHaveLength(4);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('says so when the browser cannot resize, and still frees the decoded image', async () => {
    noContext = true;
    await expect(shrinkToFit(over())).rejects.toThrow('This browser cannot resize the screenshot.');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe('capturing the tab', () => {
  it('asks for a JPEG of the window and keeps the bytes and type it gets back', async () => {
    const captureVisibleTab = vi.fn(() => Promise.resolve('data:image/png;base64,aGVsbG8='));
    vi.stubGlobal('chrome', { tabs: { captureVisibleTab } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');

    const item = await captureScreenshot(7);
    expect(captureVisibleTab).toHaveBeenCalledWith(7, { format: 'jpeg', quality: 90 });
    expect(item.blob.type).toBe('image/png');
    expect(await item.blob.text()).toBe('hello');
    expect(item.previewUrl).toBe('blob:preview');
    expect(item.filename).toMatch(/^unblocksyria-evidence-\d{4}-\d{2}-\d{2}T[\d:.]+Z\.jpg$/);
    expect(item.uploadedUrl).toBeUndefined();
  });

  it('assumes JPEG when the data URL names no type, and gives every capture its own id', async () => {
    vi.stubGlobal('chrome', { tabs: { captureVisibleTab: () => Promise.resolve('data:;base64,aGVsbG8=') } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');

    const first = await captureScreenshot(1);
    const second = await captureScreenshot(1);
    expect(first.blob.type).toBe('image/jpeg');
    expect(first.id).not.toBe(second.id);
  });
});

describe('a file picked from disk', () => {
  it('keeps the bytes, the type and the name the picker gave it', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picked');
    const file = new File(['png-bytes'], 'evidence.png', { type: 'image/png' });

    const item = fromFile(file);
    expect(item.blob).toBe(file);
    expect(item.blob.type).toBe('image/png');
    expect(item.filename).toBe('evidence.png');
    expect(item.previewUrl).toBe('blob:picked');
    expect(item.uploadedUrl).toBeUndefined();
  });

  it.each([
    ['a text file', 'notes.txt', 'text/plain'],
    ['a vector image', 'logo.svg', 'image/svg+xml'],
    ['a document', 'report.pdf', 'application/pdf'],
    ['a file with no type at all', 'mystery', ''],
  ])('refuses %s with a message', (_name, filename, type) => {
    const file = new File(['x'], filename, { type });
    expect(() => fromFile(file)).toThrow('That file is not a JPEG, PNG, GIF or WebP image.');
  });

  it('refuses an empty file before it can fail later, when editing or uploading', () => {
    const file = new File([], 'empty.png', { type: 'image/png' });
    expect(() => fromFile(file)).toThrow('That file is empty. Pick an image that has content.');
  });

  it('refuses an image over the upload limit instead of rescaling it', () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
    expect(() => fromFile(big)).toThrow('That image is larger than 5 MiB. Pick a smaller one.');
  });

  it('names the four image types a form will accept', () => {
    expect(EVIDENCE_ACCEPT.split(',')).toEqual(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  });
});
