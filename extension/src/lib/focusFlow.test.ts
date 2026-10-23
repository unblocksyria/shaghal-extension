/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { captureOpener, queueRestore, rememberFallbackHeading, restoreFocus, runQueuedFocus } from './focusFlow';

function mounted(tag: string, focusable: boolean): HTMLElement {
  const el = document.createElement(tag);
  if (focusable) el.setAttribute('tabindex', '-1');
  document.body.append(el);
  return el;
}

describe('focusFlow', () => {
  it('puts focus back on the opener while it is still connected', () => {
    const from = mounted('button', true);
    from.focus();
    captureOpener();
    rememberFallbackHeading(null);
    expect(restoreFocus()).toBe('opener');
    expect(document.activeElement).toBe(from);
  });

  it('lands on the fallback heading when the opener is gone', () => {
    const from = mounted('button', true);
    from.focus();
    captureOpener();
    from.remove();
    rememberFallbackHeading(null);
    const heading = mounted('h1', true);
    rememberFallbackHeading(heading);
    expect(restoreFocus()).toBe('fallback');
    expect(document.activeElement).toBe(heading);
  });

  it('focuses nothing when opener and fallback are both gone', () => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.focus();
    captureOpener();
    rememberFallbackHeading(null);
    expect(restoreFocus()).toBe('none');
    expect(document.activeElement).toBe(document.body);
  });

  it('ignores a fallback the panel removed long ago', () => {
    const from = mounted('button', true);
    from.focus();
    captureOpener();
    from.remove();
    const heading = mounted('h1', true);
    rememberFallbackHeading(heading);
    heading.remove();
    expect(restoreFocus()).toBe('none');
  });

  it('never falls back to the page body itself', () => {
    document.body.focus();
    captureOpener();
    rememberFallbackHeading(null);
    expect(restoreFocus()).toBe('none');
  });
});

describe('the queued restore', () => {
  it('runs once, when the close is over', () => {
    const from = mounted('button', true);
    from.focus();
    captureOpener();
    rememberFallbackHeading(null);
    expect(runQueuedFocus()).toBeNull();
    queueRestore();
    expect(runQueuedFocus()).toBe('opener');
    expect(runQueuedFocus()).toBeNull();
  });

  it('keeps the view opener when Settings opens over it, for the view to return to later', () => {
    const report = mounted('button', true);
    report.focus();
    captureOpener();
    const gear = mounted('button', true);
    gear.focus();
    captureOpener();
    rememberFallbackHeading(null);
    // Closing Settings returns to the gear.
    queueRestore();
    expect(runQueuedFocus()).toBe('opener');
    expect(document.activeElement).toBe(gear);
    // Back in the form then finds its own opener gone, so the card's heading.
    report.remove();
    rememberFallbackHeading(null);
    const heading = mounted('h1', true);
    rememberFallbackHeading(heading);
    queueRestore();
    expect(runQueuedFocus()).toBe('fallback');
    expect(document.activeElement).toBe(heading);
  });
});
