/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyThemePreference, readThemePreference, saveThemePreference } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('the theme preference', () => {
  it('is System until a choice is saved, and for a value it does not know', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem('theme', 'sepia');
    expect(readThemePreference()).toBe('system');
    saveThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('marks the page for Light or Dark, and leaves it to the OS for System', () => {
    saveThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');

    saveThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('still applies the choice when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    saveThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    // Nothing was kept, so the next open follows the OS again.
    expect(readThemePreference()).toBe('system');
    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
