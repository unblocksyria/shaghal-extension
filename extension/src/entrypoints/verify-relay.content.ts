import { RELAY_EVENT, RELAY_MESSAGE_TYPE, verifyPageMatch } from '../lib/verifyRelay';

/**
 * Firefox only: the panel's end of the verification page is in
 * lib/turnstile.ts, and this script is the page's end. It runs in the page
 * the panel frames and hands each of the page's events to the panel, which
 * accepts it only from the frame carrying its own nonce.
 *
 * `allFrames`, because the page is a subframe of the panel; `document_start`,
 * so the listener is in place before the page's script can dispatch.
 */
export default defineContentScript({
  matches: [verifyPageMatch()],
  allFrames: true,
  runAt: 'document_start',
  include: ['firefox'],
  main() {
    document.addEventListener(RELAY_EVENT, (event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== 'string') return;
      // Nothing to do if no panel is listening; the page's deadline reports it.
      void browser.runtime.sendMessage({ type: RELAY_MESSAGE_TYPE, detail }).catch(() => undefined);
    });
  },
});
