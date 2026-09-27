const EMAIL_STORAGE_KEY = 'testerEmail';

export async function getSavedEmail(): Promise<string> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(EMAIL_STORAGE_KEY).catch(() => ({}));
  const email = stored[EMAIL_STORAGE_KEY];
  return typeof email === 'string' ? email : '';
}

export async function saveEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ [EMAIL_STORAGE_KEY]: email.trim() });
}

/** Calls `onChange` with each newly saved email; returns the unsubscribe. */
export function watchSavedEmail(onChange: (email: string) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const change = changes[EMAIL_STORAGE_KEY];
    if (area === 'local' && change !== undefined) onChange(typeof change.newValue === 'string' ? change.newValue : '');
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
