import type { TesterSession, ContentSignal } from './session';

export interface HarvestedMetadata {
  name?: string;
  description?: string;
  keywords?: string;
}

export type ExtensionMessage =
  | { type: 'START_TEST'; tabId: number }
  | { type: 'END_TEST' }
  | { type: 'GET_SESSION' }
  | { type: 'HARVEST_RESULT'; payload: HarvestedMetadata }
  | { type: 'BLOCKPAGE_RESULT'; payload: Omit<ContentSignal, 'at'> };

export interface SessionResponse {
  ok: boolean;
  session?: TesterSession | null;
  error?: string;
}

export async function sendSessionMessage(message: ExtensionMessage): Promise<SessionResponse> {
  const result = (await chrome.runtime.sendMessage(message).catch(() => null)) as unknown;
  return (result as SessionResponse | null) ?? { ok: false, error: 'NO_RESPONSE' };
}
