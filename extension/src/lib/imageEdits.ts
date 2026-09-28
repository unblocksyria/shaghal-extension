/**
 * Screenshot edits: a crop and black boxes. Coordinates are in image pixels,
 * independent of the editor's display size. No DOM access.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Filled solid black. A blur can sometimes be reversed on text. */
export interface HideBox extends Rect {
  id: string;
}

export interface ImageEdits {
  crop: Rect;
  boxes: HideBox[];
}

/** The rendered image and the edits it came from, kept so they can be changed. */
export interface EditedScreenshot {
  blob: Blob;
  edits: ImageEdits;
}

/** A corner or side of a rectangle, by compass point. */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface Size {
  width: number;
  height: number;
}

export function noEdits(image: Size): ImageEdits {
  return { crop: { x: 0, y: 0, width: image.width, height: image.height }, boxes: [] };
}

/** True if the crop is smaller than the image or a box overlaps the crop. */
export function hasEdits(edits: ImageEdits, image: Size): boolean {
  const { crop } = edits;
  const cropped = crop.x > 0 || crop.y > 0 || crop.width < image.width || crop.height < image.height;
  return cropped || edits.boxes.some((box) => intersect(box, crop) !== null);
}

export function sameEdits(a: ImageEdits, b: ImageEdits): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The rectangle between two drag points, in either direction, clamped to `bounds`. */
export function spanRect(from: Point, to: Point, bounds: Rect): Rect {
  const x1 = clamp(Math.min(from.x, to.x), bounds.x, bounds.x + bounds.width);
  const y1 = clamp(Math.min(from.y, to.y), bounds.y, bounds.y + bounds.height);
  const x2 = clamp(Math.max(from.x, to.x), bounds.x, bounds.x + bounds.width);
  const y2 = clamp(Math.max(from.y, to.y), bounds.y, bounds.y + bounds.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Moves `rect` by (dx, dy), keeping it fully inside `bounds`. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Rect): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, bounds.x, bounds.x + bounds.width - rect.width),
    y: clamp(rect.y + dy, bounds.y, bounds.y + bounds.height - rect.height),
  };
}

/**
 * Moves one handle by (dx, dy). Opposite edges stay fixed, the result stays in
 * `bounds`, and neither side shrinks below `minSize` (capped at the bounds).
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Rect, minSize: number): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  const min = Math.min(minSize, bounds.width, bounds.height);

  if (handle.includes('w')) left = clamp(left + dx, bounds.x, right - min);
  if (handle.includes('e')) right = clamp(right + dx, left + min, bounds.x + bounds.width);
  if (handle.includes('n')) top = clamp(top + dy, bounds.y, bottom - min);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, bounds.y + bounds.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The overlap of two rectangles, or null when they only touch or miss. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Rounds outward to whole pixels, so a partly covered edge cannot leak a line of text. */
export function roundRect<T extends Rect>(rect: T): T {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  return {
    ...rect,
    x,
    y,
    width: Math.ceil(rect.x + rect.width) - x,
    height: Math.ceil(rect.y + rect.height) - y,
  };
}

/** Undo history of whole edit states. Each finished gesture is one step. */
export interface EditHistory {
  past: ImageEdits[];
  present: ImageEdits;
  future: ImageEdits[];
}

export function startHistory(edits: ImageEdits): EditHistory {
  return { past: [], present: edits, future: [] };
}

export function commit(history: EditHistory, next: ImageEdits): EditHistory {
  if (sameEdits(history.present, next)) return history;
  return { past: [...history.past, history.present], present: next, future: [] };
}

export function undo(history: EditHistory): EditHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: EditHistory): EditHistory {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
