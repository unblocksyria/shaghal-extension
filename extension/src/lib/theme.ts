/**
 * `system` leaves <html> without `data-theme`, so theme.css follows the OS
 * through `color-scheme: light dark`. The choice is kept in localStorage, which
 * the panel reads synchronously before first render to avoid a theme flash.
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
    // Storage is unavailable. The theme still applies until the panel closes.
  }
  applyThemePreference(preference);
}
