import type { ApiError } from './api';
import { uploadEvidence, type EvidenceUploadResult } from './endpoints';

export type { EvidenceUploadResult };

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

export type ScreenshotResult =
  | { ok: true; data: EvidenceUploadResult }
  | { ok: false; error: ApiError };

export async function captureAndUploadScreenshot(
  windowId: number,
  reportType: 'submission' | 'correction' | 'functionality_report',
  turnstileToken: string,
): Promise<ScreenshotResult> {
  let blob: Blob;
  try {
    blob = await captureVisibleScreenshot(windowId);
  } catch (captureError) {
    return { ok: false, error: { error: 'CAPTURE_FAILED', message: `Screenshot failed: ${String(captureError)}`, status: 0 } };
  }

  const upload = await uploadEvidence(blob, reportType, turnstileToken);
  if (!upload.ok) {
    return { ok: false, error: upload.error };
  }
  return upload;
}
