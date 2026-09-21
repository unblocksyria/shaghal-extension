const EMAIL_STORAGE_KEY = 'testerEmail';

export async function getSavedEmail(): Promise<string> {
  const stored = await chrome.storage.local.get(EMAIL_STORAGE_KEY);
  return (stored[EMAIL_STORAGE_KEY] as string | undefined) ?? '';
}

export async function saveEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ [EMAIL_STORAGE_KEY]: email.trim() });
}
