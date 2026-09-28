import { VERIFY_BASE } from './config';

/**
 * The verification page's contract with a Firefox add-on. Chrome receives the
 * page's messages by postMessage, which needs a fixed extension origin the
 * page can name; a Firefox add-on has a random origin per install, so the page
 * dispatches each message as a DOM event instead, and the add-on's content
 * script hands it on (platform, apps/verify/src/index.ts).
 */

/** The page path, under VERIFY_BASE. */
export const VERIFY_PATH = '/extension/turnstile';

/** The DOM event the page dispatches. Its `detail` is the message as JSON. */
export const RELAY_EVENT = 'unblocksyria-turnstile';

/** The runtime message the content script sends the panel. */
export const RELAY_MESSAGE_TYPE = 'unblocksyria-turnstile-relay';

export interface RelayMessage {
  type: typeof RELAY_MESSAGE_TYPE;
  /** The page's message, still as JSON: the panel parses it after checking the sender. */
  detail: string;
}

export function isRelayMessage(value: unknown): value is RelayMessage {
  if (typeof value !== 'object' || value === null) return false;
  const fields = value as Record<string, unknown>;
  return fields.type === RELAY_MESSAGE_TYPE && typeof fields.detail === 'string';
}

/**
 * The match pattern for the content script: the page on the build's
 * verification host. Match patterns carry no port, so a local host matches
 * whichever port the Worker serves on.
 */
export function verifyPageMatch(): string {
  const base = new URL(VERIFY_BASE);
  return `${base.protocol}//${base.hostname}${VERIFY_PATH}*`;
}

/**
 * Whether `url`, a message sender's document address, is the frame the panel
 * opened for `nonce` and `action`. Every content script on the page can hear
 * the page's event, and the page is framed by whichever add-on asks, so the
 * panel trusts only the frame carrying its own nonce.
 */
export function isVerifyFrame(url: string | undefined, nonce: string, action: string): boolean {
  if (url === undefined) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.origin === new URL(VERIFY_BASE).origin &&
    parsed.pathname === VERIFY_PATH &&
    parsed.searchParams.get('nonce') === nonce &&
    parsed.searchParams.get('action') === action
  );
}
