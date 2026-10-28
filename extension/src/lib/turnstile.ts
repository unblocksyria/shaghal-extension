import { IS_FIREFOX, IS_LOCAL_API, VERIFY_BASE } from './config';
import { i18next } from './i18n';
import { VERIFY_PATH, isRelayMessage, isVerifyFrame } from './verifyRelay';

/** The Turnstile action each API endpoint expects its token to carry. */
export type TurnstileAction = 'vote' | 'submission' | 'report' | 'correction' | 'upload';

/** Time for the verification page to load and answer before any challenge is shown. */
const LOAD_TIMEOUT_MS = 30_000;
/** How long the tester has to finish a challenge once one is shown. */
const INTERACTIVE_TIMEOUT_MS = 120_000;

type BridgeMessage =
  { status: 'interactive' } | { status: 'solved'; token: string } | { status: 'error'; code: string };

/** Parses a verification-page message. Null unless well formed and for this nonce and action. */
export function readMessage(data: unknown, nonce: string, action: TurnstileAction): BridgeMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  if (fields.type !== 'unblocksyria-turnstile' || fields.nonce !== nonce || fields.action !== action) return null;
  if (fields.status === 'interactive') return { status: 'interactive' };
  if (
    fields.status === 'solved' &&
    typeof fields.token === 'string' &&
    fields.token.trim().length > 0 &&
    fields.token.length <= 2048
  )
    return { status: 'solved', token: fields.token };
  if (fields.status === 'error') return { status: 'error', code: String(fields.code) };
  return null;
}

/** Turnstile tokens expire after five minutes. One fetched ahead is used only while it has a margin left. */
const TOKEN_LIFETIME_MS = 4 * 60_000;

/**
 * Where a challenge shows when Turnstile needs a click: the slot next to the
 * button that asked (see VerificationSlot), newest first. With none on screen,
 * it shows in a dialog over the panel.
 */
const hosts: HTMLElement[] = [];

/** Challenges under way, so a slot that leaves the page can stop its own. */
const running = new Set<Challenge>();

/** Tokens fetched ahead, one per action, waiting for the request that needs them. */
const ahead = new Map<TurnstileAction, Challenge>();

/**
 * Makes `element` the place for challenges until the returned function runs.
 * Running it also stops any challenge still inside it, since its frame goes
 * with the element.
 */
export function registerTurnstileHost(element: HTMLElement): () => void {
  hosts.push(element);
  return () => {
    const index = hosts.lastIndexOf(element);
    if (index >= 0) hosts.splice(index, 1);
    for (const challenge of running) if (challenge.host === element) challenge.cancel();
  };
}

function currentHost(): HTMLElement | null {
  for (let index = hosts.length - 1; index >= 0; index -= 1) {
    const host = hosts[index]!;
    // A slot inside a hidden view, such as a form under Settings, can't show a challenge.
    const visible = typeof host.checkVisibility === 'function' ? host.checkVisibility() : true;
    if (host.isConnected && visible) return host;
  }
  return null;
}

interface Challenge {
  action: TurnstileAction;
  host: HTMLElement | null;
  startedAt: number;
  /** The token, or a displayable error. Never rejects unhandled. */
  result: Promise<{ ok: true; token: string; at: number } | { ok: false; message: string }>;
  /** Shows a challenge that was held back while it waited to be needed. */
  reveal(): void;
  cancel(): void;
  /** Whether it already has its outcome. */
  settled(): boolean;
}

/**
 * Solves a Turnstile challenge for `action` on the verification page.
 *
 * The API accepts only tokens solved on a hostname it trusts, and an extension
 * cannot load Turnstile's script, so the panel frames a page on
 * verify.unblocksyria.com. Contract with that page:
 *
 * - URL: `${VERIFY_BASE}/extension/turnstile?action=<action>&nonce=<uuid>`.
 * - It produces `{ type: 'unblocksyria-turnstile', nonce, action, status }`
 *   messages. `status` is `interactive` when the tester must click, `solved`
 *   with a `token`, or `error` with a `code`.
 * - In Chrome it posts them to this extension's origin only, and its
 *   `frame-ancestors` names the store extension's origin.
 * - In Firefox, which gives an add-on no fixed origin, it dispatches them as
 *   DOM events, and the content script in entrypoints/verify-relay.content.ts
 *   sends them here. See lib/verifyRelay.ts for why only the frame carrying
 *   this nonce is trusted.
 *
 * The frame stays invisible unless Turnstile needs a click. It is created
 * where it will be shown, because moving a frame reloads it: inside the
 * current slot, laid over the slot until it is needed, or else in a dialog.
 * `hold` keeps a needed click hidden until `reveal`, for a token fetched ahead.
 */
function startChallenge(action: TurnstileAction, options: { hold?: boolean } = {}): Challenge {
  const nonce = crypto.randomUUID();
  const host = currentHost();
  const { promise: result, resolve } = Promise.withResolvers<
    { ok: true; token: string; at: number } | { ok: false; message: string }
  >();

  const box = document.createElement(host === null ? 'dialog' : 'div');
  const previousFocus = document.activeElement;
  box.setAttribute('aria-hidden', 'true');
  box.inert = true;
  box.setAttribute('aria-label', i18next.t('turnstile.dialogLabel'));
  if (host === null) {
    // Invisible but rendered, so the challenge runs. Shown on `interactive`.
    box.style.cssText =
      'position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;box-sizing:border-box;border:0;z-index:1000;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:12px;padding:16px;background:rgba(0,0,0,0.72);opacity:0;pointer-events:none;';
  } else {
    box.className = 'us-verify';
    box.dataset.state = 'waiting';
    box.setAttribute('role', 'group');
  }

  const label = document.createElement('p');
  label.id = `verify-${nonce}`;
  label.textContent = i18next.t('turnstile.confirm');
  if (host === null) label.style.cssText = 'margin:0;color:#ffffff;font-size:14px;text-align:center;';
  else label.className = 'us-verify-label';

  const frame = document.createElement('iframe');
  const url = new URL(VERIFY_PATH, VERIFY_BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('nonce', nonce);
  frame.src = url.toString();
  frame.title = i18next.t('turnstile.frameTitle');
  if (host === null) {
    frame.style.cssText =
      'width:100%;max-width:340px;height:140px;border:0;border-radius:10px;background:var(--us-card);';
  } else {
    frame.className = 'us-verify-frame';
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = i18next.t('turnstile.cancel');
  cancel.setAttribute('aria-describedby', label.id);
  if (host === null) {
    cancel.style.cssText =
      'background:var(--us-card);border:1px solid var(--us-border);color:var(--us-text-primary);' +
      'border-radius:8px;padding:6px 14px;cursor:pointer;font-family:inherit;';
  } else {
    cancel.className = 'us-verify-cancel';
  }

  let finished = false;
  let interactive = false;
  let held = options.hold === true;
  let timer = setTimeout(() => finish(new Error(i18next.t('turnstile.loadFailed'))), LOAD_TIMEOUT_MS);

  const challenge: Challenge = {
    action,
    host,
    startedAt: Date.now(),
    result,
    // Called once, by the request that claims the token from `ahead`.
    reveal() {
      held = false;
      if (interactive) show();
    },
    cancel() {
      finish(new Error(i18next.t('turnstile.cancelled')));
    },
    settled: () => finished,
  };
  running.add(challenge);

  function finish(outcome: string | Error) {
    if (finished) return;
    finished = true;
    running.delete(challenge);
    if (ahead.get(action) === challenge && outcome instanceof Error) ahead.delete(action);
    if (IS_FIREFOX) chrome.runtime.onMessage.removeListener(onRelay);
    else window.removeEventListener('message', onMessage);
    clearTimeout(timer);
    if (box instanceof HTMLDialogElement && box.open) box.close();
    const hadFocus = box.contains(document.activeElement);
    box.remove();
    if (interactive && (host === null || hadFocus) && previousFocus instanceof HTMLElement) previousFocus.focus();
    resolve(
      typeof outcome === 'string'
        ? { ok: true, token: outcome, at: Date.now() }
        : { ok: false, message: outcome.message },
    );
  }

  function show() {
    box.inert = false;
    box.removeAttribute('aria-hidden');
    if (host === null) {
      const dialog = box as HTMLDialogElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      box.style.opacity = '1';
      box.style.pointerEvents = 'auto';
    } else {
      box.dataset.state = 'shown';
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      box.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    }
    cancel.focus();
    clearTimeout(timer);
    timer = setTimeout(() => finish(new Error(i18next.t('turnstile.timedOut'))), INTERACTIVE_TIMEOUT_MS);
  }

  /** Chrome: the page posts to this origin, from the frame. */
  function onMessage(event: MessageEvent) {
    if (event.origin !== new URL(VERIFY_BASE).origin || event.source !== frame.contentWindow) return;
    handle(readMessage(event.data, nonce, action));
  }

  /** Firefox: the content script relays the page's event. The sender must be this frame. */
  function onRelay(message: unknown, sender: chrome.runtime.MessageSender) {
    if (!isRelayMessage(message) || !isVerifyFrame(sender.url, nonce, action)) return;
    let data: unknown;
    try {
      data = JSON.parse(message.detail);
    } catch {
      return;
    }
    handle(readMessage(data, nonce, action));
  }

  function handle(message: ReturnType<typeof readMessage>) {
    if (message === null) return;
    if (message.status === 'solved') {
      finish(message.token);
    } else if (message.status === 'error') {
      // Include Turnstile's error code so a tester's report can be traced.
      finish(new Error(i18next.t('turnstile.failed', { code: message.code })));
    } else if (!interactive) {
      interactive = true;
      if (held) {
        // Wait to be needed, but no longer than a token would last.
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error(i18next.t('turnstile.timedOut'))), TOKEN_LIFETIME_MS);
      } else show();
    }
  }

  if (host !== null) {
    // Inline, Escape cancels as it would in the dialog.
    box.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.preventDefault();
      finish(new Error(i18next.t('turnstile.cancelled')));
    });
  }
  if (box instanceof HTMLDialogElement) {
    box.oncancel = (event) => {
      event.preventDefault();
      finish(new Error(i18next.t('turnstile.cancelled')));
    };
  }
  cancel.onclick = () => finish(new Error(i18next.t('turnstile.cancelled')));
  if (IS_FIREFOX) chrome.runtime.onMessage.addListener(onRelay);
  else window.addEventListener('message', onMessage);
  box.append(label, frame, cancel);
  (host ?? document.body).append(box);
  return challenge;
}

/**
 * Starts solving a challenge for `action` before it is needed, for example
 * when the pointer reaches a vote button or the next screenshot is about to
 * upload, so the token is ready by the time the request goes out. A click it
 * needs stays hidden until the request claims it. Does nothing when a token
 * for `action` is already on its way, or with a local API.
 */
export function prefetchTurnstileToken(action: TurnstileAction): void {
  if (IS_LOCAL_API) return;
  const early = ahead.get(action);
  if (early !== undefined && Date.now() - early.startedAt < TOKEN_LIFETIME_MS) return;
  early?.cancel();
  ahead.set(action, startChallenge(action, { hold: true }));
}

/** A token for `action`, '' when IS_LOCAL_API, or a message to show on failure. */
export async function turnstileToken(
  action: TurnstileAction,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (IS_LOCAL_API) return { ok: true, token: '' };
  const early = ahead.get(action);
  ahead.delete(action);
  if (early !== undefined) {
    const settledEarly = early.settled();
    early.reveal();
    const outcome = await early.result;
    if (outcome.ok && Date.now() - outcome.at < TOKEN_LIFETIME_MS) return { ok: true, token: outcome.token };
    // Failing once this request needed it, say by Cancel, is the answer. One that
    // failed or went stale while nobody waited on it costs nothing: ask again.
    if (!outcome.ok && !settledEarly) return outcome;
  }
  const outcome = await startChallenge(action).result;
  return outcome.ok ? { ok: true, token: outcome.token } : outcome;
}
