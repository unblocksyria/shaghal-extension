import { useEffect, useState } from 'react';

/** Every site: the API, the country check, the verification page and captureVisibleTab need it. */
const ALL_SITES: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

/**
 * Whether the extension may reach websites. The manifest asks for every site
 * and both browsers grant it at install, but Firefox lets the user withdraw
 * it from the add-on's settings, and Chrome's site-access menu can withhold
 * it. Without it the panel can neither look up a page nor send anything, so
 * it offers to ask again. `request` must run inside a click: a browser grants
 * a permission only on a user gesture.
 *
 * Assumed granted wherever chrome.permissions is absent or refuses to answer,
 * as in unit tests: a missing notice is the safe failure.
 */
export function useHostAccess(): { granted: boolean; request: () => void } {
  const [granted, setGranted] = useState(true);

  useEffect(() => {
    const permissions = typeof chrome === 'undefined' ? undefined : chrome.permissions;
    if (permissions === undefined) return;
    let cancelled = false;
    const check = () => {
      // Started inside a promise, so a synchronous throw is caught too.
      Promise.resolve()
        .then(() => permissions.contains(ALL_SITES))
        .then((has) => {
          if (!cancelled) setGranted(has);
        })
        .catch(() => undefined);
    };
    check();
    try {
      permissions.onAdded.addListener(check);
      permissions.onRemoved.addListener(check);
    } catch {
      // No change events: the answer is read once.
      return () => {
        cancelled = true;
      };
    }
    return () => {
      cancelled = true;
      permissions.onAdded.removeListener(check);
      permissions.onRemoved.removeListener(check);
    };
  }, []);

  const request = () => {
    Promise.resolve()
      .then(() => chrome.permissions.request(ALL_SITES))
      .then((has) => setGranted(has))
      .catch(() => undefined);
  };

  return { granted, request };
}
