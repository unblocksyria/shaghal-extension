const EMAIL_STORAGE_KEY = 'testerEmail';
const LANGUAGE_STORAGE_KEY = 'language';

/** `system` means the browser language decides. */
export type LanguagePreference = 'system' | 'en' | 'ar';

export async function getSavedEmail(): Promise<string> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(EMAIL_STORAGE_KEY).catch(() => ({}));
  const email = stored[EMAIL_STORAGE_KEY];
  return typeof email === 'string' ? email : '';
}

export async function saveEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ [EMAIL_STORAGE_KEY]: email.trim() });
}

/** Calls `onChange` when the saved email changes. Returns an unsubscribe function. */
export function watchSavedEmail(onChange: (email: string) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const change = changes[EMAIL_STORAGE_KEY];
    if (area === 'local' && change !== undefined) onChange(typeof change.newValue === 'string' ? change.newValue : '');
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** The saved language, or `system` when the tester has never picked one. */
export async function getSavedLanguage(): Promise<LanguagePreference> {
  const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
  const value = stored[LANGUAGE_STORAGE_KEY];
  return value === 'en' || value === 'ar' ? value : 'system';
}

/** Only Settings writes the language key. */
export async function saveLanguage(language: LanguagePreference): Promise<void> {
  await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: language });
}

/** Calls `onChange` when the saved language changes. Returns an unsubscribe function. */
export function watchSavedLanguage(onChange: (language: LanguagePreference) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const change = changes[LANGUAGE_STORAGE_KEY];
    if (area === 'local' && change !== undefined) {
      const value = change.newValue;
      onChange(value === 'en' || value === 'ar' ? value : 'system');
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
