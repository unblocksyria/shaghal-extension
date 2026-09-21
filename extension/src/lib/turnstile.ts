export const DEV_TOKEN_STORAGE_KEY = 'devTurnstileToken';
export const SKIP_TURNSTILE_KEY = 'skipTurnstile';

export async function readDevToken(): Promise<string> {
  const stored = await chrome.storage.local.get(DEV_TOKEN_STORAGE_KEY);
  return (stored[DEV_TOKEN_STORAGE_KEY] as string | undefined) ?? '';
}

export async function writeDevToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [DEV_TOKEN_STORAGE_KEY]: token });
}

export async function isTurnstileSkipped(): Promise<boolean> {
  const stored = await chrome.storage.local.get(SKIP_TURNSTILE_KEY);
  return stored[SKIP_TURNSTILE_KEY] === true;
}

export async function setTurnstileSkipped(skipped: boolean): Promise<void> {
  await chrome.storage.local.set({ [SKIP_TURNSTILE_KEY]: skipped });
}

export async function resolveTurnstileToken(): Promise<string> {
  if (await isTurnstileSkipped()) return '';
  return readDevToken();
}

export async function turnstileHeader(): Promise<Record<string, string>> {
  const token = await resolveTurnstileToken();
  if (token.length === 0) return {};
  return { 'X-Turnstile-Token': token };
}
