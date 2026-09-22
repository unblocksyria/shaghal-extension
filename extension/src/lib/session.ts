import type { RedactedRequestLog } from './redact';
import type { BlockTier } from './blocklist';

const SESSION_KEY = 'testerSession';
const LAST_ENDED_KEY = 'lastEndedSession';

function sessionArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export async function getLastEndedSession(): Promise<TesterSession | undefined> {
  const stored = await chrome.storage.local.get(LAST_ENDED_KEY);
  return stored[LAST_ENDED_KEY] as TesterSession | undefined;
}

export async function saveLastEndedSession(session: TesterSession): Promise<void> {
  await chrome.storage.local.set({ [LAST_ENDED_KEY]: session });
}

export interface SessionMetadata {
  name?: string;
  description?: string;
  keywords?: string;
  favicon?: string;
  serviceUrl?: string;
}

export interface ContentSignal {
  matchedPhrase: string | null;
  tier?: BlockTier;
  pageTitle: string | null;
  pageUrl: string | null;
  at: number;
}

const CONTENT_HISTORY_LIMIT = 10;

export interface TesterSession {
  tabId: number;
  startedAt: number;
  logs: RedactedRequestLog[];
  metadata?: SessionMetadata;
  contentSignal?: ContentSignal;
  contentHistory?: ContentSignal[];
}

export async function updateSession(tabId: number, update: (session: TesterSession) => void): Promise<void> {
  return enqueueWrite(async () => {
    const session = await getSession();
    if (session === undefined || session.tabId !== tabId) return;
    update(session);
    await setSession(session);
  });
}

export async function getSession(): Promise<TesterSession | undefined> {
  const stored = await sessionArea().get(SESSION_KEY);
  return stored[SESSION_KEY] as TesterSession | undefined;
}

export async function setSession(session: TesterSession): Promise<void> {
  await sessionArea().set({ [SESSION_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await sessionArea().remove(SESSION_KEY);
}

export async function appendLog(tabId: number, log: RedactedRequestLog): Promise<void> {
  return enqueueWrite(async () => {
    const session = await getSession();
    if (session === undefined || session.tabId !== tabId) return;
    session.logs.push(log);
    await setSession(session);
  });
}

export async function recordContentSignal(tabId: number, signal: Omit<ContentSignal, 'at'>): Promise<void> {
  return updateSession(tabId, (session) => {
    const stored: ContentSignal = { ...signal, at: Date.now() };
    session.contentSignal = stored;
    session.contentHistory = [...(session.contentHistory ?? []), stored].slice(-CONTENT_HISTORY_LIMIT);
  });
}

let writeQueue: Promise<void> = Promise.resolve();

// Queueing is not reentrant: a queued operation must never call enqueueWrite,
// updateSession, or appendLog — an operation that awaits another queued
// operation deadlocks the queue and blocks every later write (e.g. appendLog).
function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}
