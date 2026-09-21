import { appendLog, clearSession, getSession, saveLastEndedSession, setSession } from '../lib/session';
import { sendSessionMessage, type ExtensionMessage, type SessionResponse } from '../lib/messaging';
import { redactUrl, type RedactedRequestLog } from '../lib/redact';

export default defineBackground(() => {
  registerWebRequestCapture();
  registerMessageHandling();
  registerPanelOpenBehavior();
});

function registerWebRequestCapture(): void {
  const recordLog = async (tabId: number, log: RedactedRequestLog): Promise<void> => {
    if (tabId < 0) return;
    await appendLog(tabId, log);
  };

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      void recordLog(details.tabId, {
        url: redactUrl(details.url),
        method: details.method,
        statusCode: details.statusCode,
        error: null,
        timestamp: details.timeStamp,
        resourceType: details.type,
      });
    },
    { urls: ['<all_urls>'] },
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      void recordLog(details.tabId, {
        url: redactUrl(details.url),
        method: details.method,
        statusCode: null,
        error: details.error,
        timestamp: details.timeStamp,
        resourceType: details.type,
      });
    },
    { urls: ['<all_urls>'] },
  );
}

function registerMessageHandling(): void {
  chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    void handleMessage(rawMessage as ExtensionMessage).then((result) => sendResponse(result));
    return true;
  });
}

function registerPanelOpenBehavior(): void {
  if (typeof chrome.sidePanel !== 'undefined') {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
    return;
  }
  const legacySidebar = (chrome as ChromeWithLegacySidebar).sidebarAction;
  if (legacySidebar !== undefined) {
    chrome.action.onClicked.addListener(() => {
      void legacySidebar.open();
    });
  }
}

interface ChromeWithLegacySidebar {
  sidebarAction?: { open(): Promise<void> };
}

async function handleMessage(message: ExtensionMessage): Promise<SessionResponse> {
  switch (message.type) {
    case 'START_TEST': {
      await setSession({ tabId: message.tabId, startedAt: Date.now(), logs: [] });
      return { ok: true };
    }
    case 'END_TEST': {
      const session = await getSession();
      await clearSession();
      if (session !== undefined) await saveLastEndedSession(session);
      return { ok: true, session: session ?? null };
    }
    case 'GET_SESSION': {
      return { ok: true, session: (await getSession()) ?? null };
    }
  }
}
