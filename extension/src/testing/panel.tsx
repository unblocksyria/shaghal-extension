import { render, screen, type RenderResult } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SidePanelApp } from '../entrypoints/sidepanel/SidePanelApp';
import { applyStoredLanguage } from '../lib/i18n';
import type { LanguagePreference } from '../lib/settings';
import { stubSession } from './session';

/**
 * Renders the panel against a fresh fakeBrowser with one active tab.
 * - `url`: the tab's address, or null for none.
 * - `language`: the stored language setting. Unset means `system`.
 * - `uiLanguage`: what `chrome.i18n.getUILanguage()` returns. Defaults to `en-US`.
 * - `keepSession`: reopen without forgetting what the last open stored, the way a
 *   panel that closes and comes back keeps its session storage.
 */
export async function openPanel(
  url: string | null,
  options: { language?: LanguagePreference; uiLanguage?: string; keepSession?: boolean } = {},
): Promise<RenderResult> {
  // Typed as void, but fakeBrowser.reset() returns a promise.
  await Promise.resolve(fakeBrowser.reset());
  vi.stubGlobal('chrome', fakeBrowser);
  if (options.keepSession !== true) stubSession();
  // fakeBrowser lacks chrome.i18n, which the panel reads to resolve `system`.
  Object.assign(fakeBrowser, { i18n: { getUILanguage: () => options.uiLanguage ?? 'en-US' } });
  if (options.language !== undefined) await fakeBrowser.storage.local.set({ language: options.language });
  // The panel queries the active tab in the current window, so one must be focused.
  const created = await fakeBrowser.windows.create({ focused: true });
  await fakeBrowser.tabs.create({ url: url ?? undefined, active: true, windowId: created?.id });
  // Like main.tsx, apply the language before the first render.
  await applyStoredLanguage();
  return render(<SidePanelApp />);
}

/** Stubs object URLs (missing in jsdom) and captureVisibleTab (missing in fakeBrowser). */
export function stubScreenshot(): void {
  URL.createObjectURL = () => 'blob:fake-evidence';
  URL.revokeObjectURL = () => undefined;
  fakeBrowser.tabs.captureVisibleTab = () => Promise.resolve('data:image/jpeg;base64,aGVsbG8=');
}

/**
 * Presses a form's send button and, when the form asks about a missing
 * screenshot, "Send anyway", as a tester sending without one would.
 */
export async function pressSend(user: UserEvent, name: string): Promise<void> {
  await user.click(screen.getByRole('button', { name }));
  const anyway = screen.queryByRole('button', { name: /^(Send anyway|أرسل على أي حال|Dîsa jî bişîne)$/ });
  if (anyway !== null) await user.click(anyway);
}
