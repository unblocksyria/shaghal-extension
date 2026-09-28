import { describe, expect, it } from 'vitest';
import {
  commit,
  hasEdits,
  intersect,
  moveRect,
  noEdits,
  redo,
  resizeRect,
  roundRect,
  spanRect,
  startHistory,
  undo,
  type ImageEdits,
} from './imageEdits';

const image = { width: 1000, height: 600 };
const bounds = { x: 0, y: 0, width: 1000, height: 600 };

describe('the edit geometry', () => {
  it('spans a rectangle whichever way the drag went, inside the bounds', () => {
    expect(spanRect({ x: 300, y: 200 }, { x: 100, y: 50 }, bounds)).toEqual({ x: 100, y: 50, width: 200, height: 150 });
    expect(spanRect({ x: 900, y: 500 }, { x: 1200, y: 700 }, bounds)).toEqual({
      x: 900,
      y: 500,
      width: 100,
      height: 100,
    });
  });

  it('moves a rectangle without letting it leave the bounds', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(moveRect(rect, 50, -20, bounds)).toEqual({ x: 150, y: 80, width: 200, height: 100 });
    expect(moveRect(rect, 5000, 5000, bounds)).toEqual({ x: 800, y: 500, width: 200, height: 100 });
    expect(moveRect(rect, -5000, -5000, bounds)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('resizes from a corner, keeping the opposite corner still', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeRect(rect, 'nw', -50, -30, bounds, 10)).toEqual({ x: 50, y: 70, width: 250, height: 130 });
    expect(resizeRect(rect, 'se', 40, 20, bounds, 10)).toEqual({ x: 100, y: 100, width: 240, height: 120 });
  });

  it('resizes a side in one direction only', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeRect(rect, 'e', 30, 999, bounds, 10)).toEqual({ x: 100, y: 100, width: 230, height: 100 });
    expect(resizeRect(rect, 'n', 999, -40, bounds, 10)).toEqual({ x: 100, y: 60, width: 200, height: 140 });
  });

  it('never resizes below the minimum or past the bounds', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeRect(rect, 'w', 500, 0, bounds, 40)).toEqual({ x: 260, y: 100, width: 40, height: 100 });
    expect(resizeRect(rect, 'se', 5000, 5000, bounds, 40)).toEqual({ x: 100, y: 100, width: 900, height: 500 });
  });

  it('finds the overlap of two rectangles, or none', () => {
    expect(intersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 60, width: 100, height: 100 })).toEqual({
      x: 50,
      y: 60,
      width: 50,
      height: 40,
    });
    expect(intersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it('rounds outward to whole pixels, so a hidden edge never shows', () => {
    expect(roundRect({ x: 10.6, y: 20.2, width: 30.1, height: 5.5 })).toEqual({ x: 10, y: 20, width: 31, height: 6 });
  });

  it('counts a crop or a visible box as an edit, and nothing else', () => {
    expect(hasEdits(noEdits(image), image)).toBe(false);
    expect(hasEdits({ ...noEdits(image), crop: { x: 0, y: 0, width: 999, height: 600 } }, image)).toBe(true);
    const box = { id: 'a', x: 10, y: 10, width: 20, height: 20 };
    expect(hasEdits({ ...noEdits(image), boxes: [box] }, image)).toBe(true);
    // A box entirely outside the crop hides nothing.
    expect(hasEdits({ ...noEdits(image), boxes: [{ ...box, x: 2000 }] }, image)).toBe(false);
  });
});

describe('undo and redo', () => {
  const first = noEdits(image);
  const cropped: ImageEdits = { ...first, crop: { x: 0, y: 0, width: 500, height: 600 } };
  const boxed: ImageEdits = { ...cropped, boxes: [{ id: 'a', x: 1, y: 1, width: 9, height: 9 }] };

  it('steps back and forward through committed edits', () => {
    let history = commit(commit(startHistory(first), cropped), boxed);
    expect(history.present).toEqual(boxed);

    history = undo(history);
    expect(history.present).toEqual(cropped);
    history = undo(history);
    expect(history.present).toEqual(first);
    expect(undo(history)).toBe(history);

    history = redo(redo(history));
    expect(history.present).toEqual(boxed);
    expect(redo(history)).toBe(history);
  });

  it('drops the redo steps once a new edit is made', () => {
    const history = commit(undo(commit(startHistory(first), cropped)), boxed);
    expect(history.future).toEqual([]);
    expect(history.past).toEqual([first]);
  });

  it('records nothing for an edit that changes nothing', () => {
    const history = startHistory(first);
    expect(commit(history, noEdits(image))).toBe(history);
  });
});
