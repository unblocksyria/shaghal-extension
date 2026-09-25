import { useEffect, useState } from 'react';

export interface ActiveTabInfo {
  url: string | null;
  title: string | null;
}

const DEV_FALLBACK: ActiveTabInfo = { url: 'https://example.com', title: 'Example' };

function queryActiveTab(setTab: (tab: ActiveTabInfo) => void): void {
  if (typeof chrome === 'undefined' || chrome?.tabs?.query === undefined) {
    setTab(DEV_FALLBACK);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    setTab({ url: tabs[0]?.url ?? null, title: tabs[0]?.title ?? null });
  });
}

/**
 * Development builds only: `sidepanel.html?preview=<url>` opened as a tab shows
 * the panel for that address, so a state can be viewed or screenshotted
 * without driving the side panel. There is no page behind it, so a screenshot
 * taken from a preview captures the panel itself.
 */
function previewTab(): ActiveTabInfo | null {
  if (import.meta.env.DEV !== true || typeof location === 'undefined') return null;
  const preview = new URLSearchParams(location.search).get('preview');
  return preview === null ? null : { url: preview, title: null };
}

export function useActiveTab(): ActiveTabInfo {
  const preview = previewTab();
  const tab = useFollowedTab(preview === null);
  return preview ?? tab;
}

function useFollowedTab(enabled: boolean): ActiveTabInfo {
  const chromeTabsAvailable = enabled && typeof chrome !== 'undefined' && chrome?.tabs?.onActivated !== undefined;
  const [tab, setTab] = useState<ActiveTabInfo>(() =>
    chromeTabsAvailable ? { url: null, title: null } : DEV_FALLBACK,
  );

  useEffect(() => {
    if (!chromeTabsAvailable) return;
    const refresh = () => queryActiveTab(setTab);
    // Only the shown tab's address and title matter, not loading, favicon or audio updates.
    const onUpdated = (_tabId: number, change: chrome.tabs.OnUpdatedInfo, updated: chrome.tabs.Tab) => {
      if (updated.active && (change.url !== undefined || change.title !== undefined)) refresh();
    };
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, [chromeTabsAvailable]);

  return tab;
}
