import type { ApiResult } from './api';
import { uploadEvidence } from './endpoints';

export interface PendingEvidence {
  id: string;
  blob: Blob;
  previewUrl: string;
  filename: string;
  uploadedUrl?: string;
}

/** The API refuses evidence files over 5 MB. */
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** A JPEG of the visible page, scaled down if still over the upload cap. */
async function captureVisibleScreenshot(windowId: number): Promise<Blob> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 });
  const blob = dataUrlToBlob(dataUrl);
  return blob.size <= MAX_EVIDENCE_BYTES ? blob : shrinkToFit(blob);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const type = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

async function shrinkToFit(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  let scale = 0.75;
  let smaller = blob;
  // A few steps down is always enough: each one roughly halves the pixels.
  for (let step = 0; step < 4 && smaller.size > MAX_EVIDENCE_BYTES; step += 1) {
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    smaller = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    scale *= 0.75;
  }
  bitmap.close();
  return smaller;
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

export async function uploadPendingEvidence(
  item: PendingEvidence,
  reportType: 'submission' | 'correction' | 'functionality_report',
): Promise<ApiResult<PendingEvidence>> {
  if (item.uploadedUrl !== undefined) return { ok: true, data: item };
  const upload = await uploadEvidence(item.blob, item.filename, reportType);
  if (!upload.ok) return upload;
  return { ok: true, data: { ...item, uploadedUrl: upload.data } };
}
