import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bakeEdits, openEditableImage, type EditableImage } from './imageBake';
import type { ImageEdits } from './imageEdits';

// Node has no canvas or image decoder. These fakes record what the editor asks
// of them, so the tests check the geometry of what reaches the file.

/** What one fake canvas was asked to draw, in its own pixels. */
interface Drawn {
  size: [number, number];
  drawImage: unknown[];
  fills: [number, number, number, number][];
  fillStyle: string | undefined;
  convert: unknown;
}

const drawn: Drawn[] = [];
/** Each convertToBlob hands out the next of these. */
const outputs: Blob[] = [];
let noContext = false;

class FakeCanvas {
  private readonly record: Drawn;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.record = { size: [width, height], drawImage: [], fills: [], fillStyle: undefined, convert: undefined };
    drawn.push(this.record);
  }
  getContext(kind: string) {
    if (noContext || kind !== '2d') return null;
    const record = this.record;
    return {
      set fillStyle(value: string) {
        record.fillStyle = value;
      },
      drawImage: (...args: unknown[]) => {
        record.drawImage = args;
      },
      fillRect: (x: number, y: number, width: number, height: number) => {
        record.fills.push([x, y, width, height]);
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

const bitmap = { width: 1000, height: 600, close: vi.fn() };
const decode = vi.fn(() => Promise.resolve(bitmap));
let createObjectURL = vi.fn<typeof URL.createObjectURL>();
let revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>();

beforeEach(() => {
  drawn.length = 0;
  outputs.length = 0;
  noContext = false;
  bitmap.close.mockClear();
  decode.mockClear();
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:capture');
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

describe('opening a screenshot for editing', () => {
  it('decodes it once and hands back its size, a preview address and a way to free both', async () => {
    const blob = new Blob(['capture']);
    const image = await openEditableImage(blob);
    expect(decode).toHaveBeenCalledWith(blob);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(image).toMatchObject({ width: 1000, height: 600, url: 'blob:capture' });

    image.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:capture');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe('baking the edits', () => {
  const image: EditableImage = {
    width: 1000,
    height: 600,
    url: 'blob:capture',
    bitmap,
    dispose: () => undefined,
  };
  const crop = { x: 100, y: 50, width: 400, height: 300 };

  it('draws only the cropped area, and blacks out each box where it overlaps the crop', async () => {
    const edits: ImageEdits = {
      crop,
      boxes: [
        { id: 'inside', x: 150, y: 100, width: 50, height: 20 },
        { id: 'partly', x: 450, y: 300, width: 100, height: 100 },
        { id: 'outside', x: 900, y: 0, width: 50, height: 50 },
      ],
    };
    const jpeg = new Blob(['jpeg']);
    outputs.push(jpeg);

    expect(await bakeEdits(image, edits)).toBe(jpeg);
    expect(drawn).toHaveLength(1);
    const canvas = drawn[0];
    // The canvas is the crop's size, so nothing outside it exists in the file.
    expect(canvas?.size).toEqual([400, 300]);
    expect(canvas?.drawImage).toEqual([bitmap, 100, 50, 400, 300, 0, 0, 400, 300]);
    expect(canvas?.fillStyle).toBe('#000000');
    // Boxes are placed relative to the crop, clipped to it, and dropped when outside it.
    expect(canvas?.fills).toEqual([
      [50, 50, 50, 20],
      [350, 250, 50, 50],
    ]);
    expect(canvas?.convert).toEqual({ type: 'image/jpeg', quality: 0.9 });
  });

  it('shrinks the result when the rendered file is over the upload limit', async () => {
    const small = new Blob(['small']);
    outputs.push(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), small);

    const result = await bakeEdits(image, { crop, boxes: [] });
    expect(await result.text()).toBe('small');
    // A second canvas, three quarters the size of the rendered image.
    expect(drawn.map((canvas) => canvas.size)).toEqual([
      [400, 300],
      [750, 450],
    ]);
  });

  it('says so when the browser cannot draw', async () => {
    noContext = true;
    await expect(bakeEdits(image, { crop, boxes: [] })).rejects.toThrow(
      'This browser cannot draw the edited screenshot.',
    );
    expect(drawn).toHaveLength(1);
  });
});
