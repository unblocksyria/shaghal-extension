import type { TesterSession } from './session';

export interface HarvestedMetadata {
  name?: string;
  description?: string;
  keywords?: string;
}

export type ExtensionMessage =
  | { type: 'START_TEST'; tabId: number }
  | { type: 'END_TEST' }
  | { type: 'GET_SESSION' }
  | { type: 'HARVEST_RESULT'; payload: HarvestedMetadata };

export interface SessionResponse {
  ok: boolean;
  session?: TesterSession | null;
  error?: string;
}

export async function sendSessionMessage(message: ExtensionMessage): Promise<SessionResponse> {
  const result = await chrome.runtime.sendMessage(message).catch(() => null);
  return (result as SessionResponse | null) ?? { ok: false, error: 'NO_RESPONSE' };
}
