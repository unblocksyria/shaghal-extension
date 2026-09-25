/**
 * Light, dark, or the system's choice.
 *
 * `system` leaves <html> without a data-theme, so theme.css follows the
 * operating system through `color-scheme: light dark`. `light` and `dark` pin
 * it. Kept in localStorage, which the panel reads synchronously before its
 * first render, so a pinned theme applies without a flash.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (preference === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
  applyThemePreference(preference);
}
