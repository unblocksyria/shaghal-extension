import type { RedactedRequestLog } from './redact';

const SESSION_KEY = 'testerSession';
const LAST_ENDED_KEY = 'lastEndedSession';

export async function getLastEndedSession(): Promise<TesterSession | undefined> {
  const stored = await chrome.storage.local.get(LAST_ENDED_KEY);
  return stored[LAST_ENDED_KEY] as TesterSession | undefined;
}

export async function saveLastEndedSession(session: TesterSession): Promise<void> {
  await chrome.storage.local.set({ [LAST_ENDED_KEY]: session });
}

export interface TesterSession {
  tabId: number;
  startedAt: number;
  logs: RedactedRequestLog[];
}

export async function getSession(): Promise<TesterSession | undefined> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return stored[SESSION_KEY] as TesterSession | undefined;
}

export async function setSession(session: TesterSession): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function appendLog(tabId: number, log: RedactedRequestLog): Promise<void> {
  return enqueueWrite(async () => {
    const session = await getSession();
    if (session === undefined || session.tabId !== tabId) return;
    session.logs.push(log);
    await setSession(session);
  });
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}
