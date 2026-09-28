import { useEffect, useState } from 'react';

export interface ActiveTabInfo {
  url: string | null;
  title: string | null;
}

const DEV_FALLBACK: ActiveTabInfo = { url: 'https://example.com', title: 'Example' };

/**
 * Dev builds only. Opening `sidepanel.html?preview=<url>` in a tab renders the
 * panel for that URL, for viewing a state without the side panel. A screenshot
 * taken in preview captures the panel itself, since there is no page behind it.
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
    let sequence = 0;
    let disposed = false;
    const refresh = () => {
      const request = ++sequence;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        if (disposed || request !== sequence) return;
        setTab(error ? { url: null, title: null } : { url: tabs[0]?.url ?? null, title: tabs[0]?.title ?? null });
      });
    };
    // Only the shown tab's address and title matter, not loading, favicon or audio updates.
    const onUpdated = (_tabId: number, change: chrome.tabs.OnUpdatedInfo, updated: chrome.tabs.Tab) => {
      if (updated.active && (change.url !== undefined || change.title !== undefined)) refresh();
    };
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      disposed = true;
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, [chromeTabsAvailable]);

  return tab;
}
