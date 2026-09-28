import { IS_LOCAL_API, VERIFY_BASE } from './config';
import { i18next } from './i18n';
import { VERIFY_PATH, isFirefox, isRelayMessage, isVerifyFrame } from './verifyRelay';

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
 * The frame stays invisible unless Turnstile needs a click. Rejects with a
 * displayable message on cancel, page error or timeout.
 */
function requestTurnstileToken(action: TurnstileAction): Promise<string> {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();

    const overlay = document.createElement('dialog');
    const previousFocus = document.activeElement;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.setAttribute('aria-label', i18next.t('turnstile.dialogLabel'));
    // Invisible but rendered, so the challenge runs. Shown on `interactive`.
    overlay.style.cssText =
      'position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;box-sizing:border-box;border:0;z-index:1000;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:12px;padding:16px;background:rgba(0,0,0,0.72);opacity:0;pointer-events:none;';

    const label = document.createElement('p');
    label.textContent = i18next.t('turnstile.confirm');
    label.style.cssText = 'margin:0;color:#ffffff;font-size:14px;text-align:center;';

    const frame = document.createElement('iframe');
    const url = new URL(VERIFY_PATH, VERIFY_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('nonce', nonce);
    frame.src = url.toString();
    frame.title = i18next.t('turnstile.frameTitle');
    frame.style.cssText =
      'width:100%;max-width:340px;height:140px;border:0;border-radius:10px;background:var(--us-card);';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = i18next.t('turnstile.cancel');
    cancel.style.cssText =
      'background:var(--us-card);border:1px solid var(--us-border);color:var(--us-text-primary);' +
      'border-radius:8px;padding:6px 14px;cursor:pointer;font-family:inherit;';

    let finished = false;
    let interactive = false;
    let timer = setTimeout(() => finish(new Error(i18next.t('turnstile.loadFailed'))), LOAD_TIMEOUT_MS);

    function finish(outcome: string | Error) {
      if (finished) return;
      finished = true;
      if (isFirefox()) chrome.runtime.onMessage.removeListener(onRelay);
      else window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      if (overlay.open) overlay.close();
      overlay.remove();
      if (interactive && previousFocus instanceof HTMLElement) previousFocus.focus();
      if (typeof outcome === 'string') resolve(outcome);
      else reject(outcome);
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
        overlay.inert = false;
        overlay.removeAttribute('aria-hidden');
        if (typeof overlay.showModal === 'function') overlay.showModal();
        cancel.focus();
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error(i18next.t('turnstile.timedOut'))), INTERACTIVE_TIMEOUT_MS);
      }
    }

    overlay.oncancel = (event) => {
      event.preventDefault();
      finish(new Error(i18next.t('turnstile.cancelled')));
    };
    cancel.onclick = () => finish(new Error(i18next.t('turnstile.cancelled')));
    if (isFirefox()) chrome.runtime.onMessage.addListener(onRelay);
    else window.addEventListener('message', onMessage);
    overlay.append(label, frame, cancel);
    document.body.append(overlay);
  });
}

/** A token for `action`, '' when IS_LOCAL_API, or a message to show on failure. */
export async function turnstileToken(
  action: TurnstileAction,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (IS_LOCAL_API) return { ok: true, token: '' };
  try {
    return { ok: true, token: await requestTurnstileToken(action) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
