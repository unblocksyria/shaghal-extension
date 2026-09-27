import type { ApiResult } from './api';
import { uploadEvidence } from './endpoints';
import type { ImageEdits } from './imageEdits';

export interface PendingEvidence {
  id: string;
  /** What gets uploaded: the capture, or the edited copy once it has been edited. */
  blob: Blob;
  previewUrl: string;
  filename: string;
  uploadedUrl?: string;
  uploadedAt?: number;
  /**
   * The capture as taken and the edits on it, so the edits can be changed
   * again. Both stay in the panel; only `blob` is ever uploaded.
   */
  original?: Blob;
  edits?: ImageEdits;
}

/** The API refuses evidence files over 5 MB. */
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** A JPEG of the visible page, scaled down if still over the upload cap. */
async function captureVisibleScreenshot(windowId: number): Promise<Blob> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 });
  const blob = dataUrlToBlob(dataUrl);
  return shrinkToFit(blob);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const type = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

export async function shrinkToFit(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX_EVIDENCE_BYTES) return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    let scale = 0.75;
    let smaller = blob;
    for (let step = 0; step < 4 && smaller.size > MAX_EVIDENCE_BYTES; step += 1) {
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('This browser cannot resize the screenshot.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      smaller = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      scale *= 0.75;
    }
    if (smaller.size > MAX_EVIDENCE_BYTES) throw new Error('The screenshot is too large. Capture a smaller area.');
    return smaller;
  } finally {
    bitmap.close();
  }
}

export async function captureScreenshot(windowId: number): Promise<PendingEvidence> {
  const blob = await captureVisibleScreenshot(windowId);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    blob,
    previewUrl: URL.createObjectURL(blob),
    filename: `unblocksyria-evidence-${new Date().toISOString()}.jpg`,
  };
}

/**
 * The screenshot with new edits, or back to the capture when `edited` is null.
 * It needs uploading again, and its old preview is the caller's to revoke.
 */
export function withEdits(item: PendingEvidence, edited: { blob: Blob; edits: ImageEdits } | null): PendingEvidence {
  const original = item.original ?? item.blob;
  const blob = edited?.blob ?? original;
  return {
    id: item.id,
    filename: item.filename,
    blob,
    previewUrl: URL.createObjectURL(blob),
    ...(edited !== null && { original, edits: edited.edits }),
  };
}

export async function uploadPendingEvidence(
  item: PendingEvidence,
  reportType: 'submission' | 'correction' | 'functionality_report',
): Promise<ApiResult<PendingEvidence>> {
  // Claims expire after an hour. Leave five minutes for verification and submission.
  if (item.uploadedUrl !== undefined && item.uploadedAt !== undefined && Date.now() - item.uploadedAt < 55 * 60_000)
    return { ok: true, data: item };
  if (item.blob.size === 0 || item.blob.size > MAX_EVIDENCE_BYTES)
    return {
      ok: false,
      error: { error: 'INVALID_FILE', message: 'Screenshots must be between 1 byte and 5 MB.', status: 0 },
    };
  const upload = await uploadEvidence(item.blob, item.filename, reportType);
  if (!upload.ok) return upload;
  return { ok: true, data: { ...item, uploadedUrl: upload.data, uploadedAt: Date.now() } };
}
