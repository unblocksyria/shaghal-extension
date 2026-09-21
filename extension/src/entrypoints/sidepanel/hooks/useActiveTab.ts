import { useEffect, useState } from 'react';

export interface ActiveTabInfo {
  tabId: number | null;
  url: string | null;
}

const DEV_FALLBACK: ActiveTabInfo = { tabId: 0, url: 'https://example.com' };

function queryActiveTab(setTab: (tab: ActiveTabInfo) => void): void {
  if (typeof chrome === 'undefined' || chrome?.tabs?.query === undefined) {
    setTab(DEV_FALLBACK);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    setTab({ tabId: tabs[0]?.id ?? null, url: tabs[0]?.url ?? null });
  });
}

export function useActiveTab(): ActiveTabInfo {
  const [tab, setTab] = useState<ActiveTabInfo>({ tabId: null, url: null });

  useEffect(() => {
    if (typeof chrome === 'undefined' || chrome?.tabs?.onActivated === undefined) {
      setTab(DEV_FALLBACK);
      return;
    }
    const refresh = () => queryActiveTab(setTab);
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, []);

  return tab;
}
