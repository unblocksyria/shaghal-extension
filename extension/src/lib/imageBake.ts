import { shrinkToFit } from './evidence';
import { i18next } from './i18n';
import { intersect, type ImageEdits } from './imageEdits';

/** A screenshot opened for editing. */
export interface EditableImage {
  width: number;
  height: number;
  /** Object URL of the unedited image. */
  url: string;
  bitmap: ImageBitmap;
  dispose: () => void;
}

export async function openEditableImage(blob: Blob): Promise<EditableImage> {
  const bitmap = await createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  return {
    width: bitmap.width,
    height: bitmap.height,
    url,
    bitmap,
    dispose: () => {
      URL.revokeObjectURL(url);
      bitmap.close();
    },
  };
}

/**
 * Renders the edits into a new JPEG. Only the cropped area is drawn and boxes
 * are filled black, so hidden pixels cannot be recovered from the file.
 */
export async function bakeEdits(image: EditableImage, edits: ImageEdits): Promise<Blob> {
  const { crop } = edits;
  const canvas = new OffscreenCanvas(crop.width, crop.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error(i18next.t('editor.cannotDraw'));

  context.drawImage(image.bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  context.fillStyle = '#000000';
  for (const box of edits.boxes) {
    const part = intersect(box, crop);
    if (part !== null) context.fillRect(part.x - crop.x, part.y - crop.y, part.width, part.height);
  }
  return shrinkToFit(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
}
