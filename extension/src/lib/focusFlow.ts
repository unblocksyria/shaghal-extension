/**
 * Where focus goes when a view opens and closes over another one.
 *
 * A view that opens (a form, Settings, the sent screen) puts focus on its own
 * heading. The control that opened it is remembered first, so returning can put
 * focus back — or on the card's heading when that control is gone, say because
 * the card it sat on was replaced.
 */

/** What `restoreFocus` managed to focus, if anything. */
export type FocusGoal = 'opener' | 'fallback' | 'none';

let opener: WeakRef<HTMLElement> | null = null;
let fallback: WeakRef<HTMLElement> | null = null;

/** Remembers the control that currently has focus, while it still does. */
export function captureOpener(): void {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? new WeakRef(active) : null;
}

/**
 * The heading to land on when the opener is gone. Called as a ref callback on a
 * view's heading, so the newest one in the current view wins.
 */
export function rememberFallbackHeading(node: HTMLElement | null): void {
  fallback = node === null ? null : new WeakRef(node);
}

/** Puts focus back on the opener, or on the fallback heading if the opener is gone. */
export function restoreFocus(): FocusGoal {
  const back = opener?.deref();
  if (back !== undefined && back.isConnected) {
    back.focus();
    return 'opener';
  }
  const heading = fallback?.deref();
  if (heading !== undefined && heading.isConnected) {
    heading.focus();
    return 'fallback';
  }
  return 'none';
}

let queued: 'restore' | null = null;

/**
 * A close handler asks for a restore before React re-renders; the return trip
 * then lands after the destination view is committed, and only once.
 */
export function queueRestore(): void {
  queued = 'restore';
}

/** Runs the queued restore. Returns null when nothing was asked for. */
export function runQueuedFocus(): FocusGoal | null {
  const asked = queued;
  queued = null;
  return asked === 'restore' ? restoreFocus() : null;
}
