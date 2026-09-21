import { useEffect, useState } from 'react';

export interface ActiveTabInfo {
  tabId: number | null;
  url: string | null;
}

export function useActiveTab(): ActiveTabInfo {
  const [tab, setTab] = useState<ActiveTabInfo>({ tabId: null, url: null });

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome?.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        setTab({ tabId: tabs[0]?.id ?? null, url: tabs[0]?.url ?? null });
      });
    } else {
      setTab({ tabId: 0, url: 'https://example.com' });
    }
  }, []);

  return tab;
}
