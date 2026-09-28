import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getSavedEmail,
  getSavedLanguage,
  saveEmail,
  saveLanguage,
  watchSavedEmail,
  watchSavedLanguage,
} from './settings';

beforeEach(async () => {
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
});

describe('the saved email', () => {
  it('is empty until one is saved, and is saved trimmed', async () => {
    expect(await getSavedEmail()).toBe('');
    await saveEmail('  tester@example.com ');
    expect(await getSavedEmail()).toBe('tester@example.com');
  });

  it('is empty when storage holds something that is not text', async () => {
    await fakeBrowser.storage.local.set({ testerEmail: 42 });
    expect(await getSavedEmail()).toBe('');
  });

  it('is empty when storage cannot be read, so a form still opens', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(new Error('unavailable'));
    expect(await getSavedEmail()).toBe('');
  });

  it('tells a watcher about changes in local storage only, until it stops watching', async () => {
    const seen: string[] = [];
    const stop = watchSavedEmail((email) => seen.push(email));

    await fakeBrowser.storage.local.set({ testerEmail: 'one@example.com' });
    // Another area, another key, and a removal.
    await fakeBrowser.storage.session.set({ testerEmail: 'ignored@example.com' });
    await fakeBrowser.storage.local.set({ language: 'ar' });
    await fakeBrowser.storage.local.remove('testerEmail');
    expect(seen).toEqual(['one@example.com', '']);

    stop();
    await fakeBrowser.storage.local.set({ testerEmail: 'two@example.com' });
    expect(seen).toEqual(['one@example.com', '']);
  });
});

describe('the saved language', () => {
  it('is System until one is picked, and for a value it does not know', async () => {
    expect(await getSavedLanguage()).toBe('system');
    await fakeBrowser.storage.local.set({ language: 'fr' });
    expect(await getSavedLanguage()).toBe('system');
    await saveLanguage('ar');
    expect(await getSavedLanguage()).toBe('ar');
  });

  it('reports a picked language to watchers, and anything else as System', async () => {
    const seen: string[] = [];
    const stop = watchSavedLanguage((language) => seen.push(language));

    await saveLanguage('ar');
    await fakeBrowser.storage.local.set({ language: 'klingon' });
    await fakeBrowser.storage.local.remove('language');
    await fakeBrowser.storage.session.set({ language: 'en' });
    expect(seen).toEqual(['ar', 'system', 'system']);

    stop();
    await saveLanguage('en');
    expect(seen).toEqual(['ar', 'system', 'system']);
  });
});
