import type { ApiError, ApiResult } from './api';
import { uploadEvidence } from './endpoints';

export interface PendingEvidence {
  id: string;
  blob: Blob;
  previewUrl: string;
  filename: string;
  uploadedUrl?: string;
}

export type ScreenshotResult =
  | { ok: true; data: PendingEvidence }
  | { ok: false; error: ApiError };

export function captureVisibleScreenshot(windowId: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(dataUrlToBlob(dataUrl));
    });
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

export async function captureScreenshot(windowId: number): Promise<PendingEvidence> {
  const blob = await captureVisibleScreenshot(windowId);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    blob,
    previewUrl: URL.createObjectURL(blob),
    filename: `unblocksyria-evidence-${new Date().toISOString()}.png`,
  };
}

export async function uploadPendingEvidence(
  item: PendingEvidence,
  reportType: 'submission' | 'correction' | 'functionality_report',
  turnstileToken: string,
): Promise<ApiResult<PendingEvidence>> {
  if (item.uploadedUrl !== undefined) return { ok: true, data: item };
  const upload = await uploadEvidence(item.blob, reportType, turnstileToken);
  if (!upload.ok) return upload;
  return { ok: true, data: { ...item, uploadedUrl: upload.data.url } };
}
