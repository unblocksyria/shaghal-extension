/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileToken } from './turnstile';

vi.mock('./config', () => ({ IS_FIREFOX: false, IS_LOCAL_API: false, VERIFY_BASE: 'https://verify.example.test' }));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** The frame the panel opened, and a way to speak as the page inside it. */
function page() {
  const dialog = document.querySelector('dialog');
  const frame = document.querySelector('iframe');
  if (dialog === null || frame === null) throw new Error('The verification frame was not opened');
  const url = new URL(frame.src);
  const send = (fields: object) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: url.origin,
        source: frame.contentWindow,
        data: {
          type: 'unblocksyria-turnstile',
          nonce: url.searchParams.get('nonce'),
          action: url.searchParams.get('action'),
          ...fields,
        },
      }),
    );
  const cancel = dialog.querySelector('button');
  if (cancel === null) throw new Error('The verification dialog has no Cancel button');
  return { dialog, frame, url, send, cancel };
}

describe('the verification frame', () => {
  it('frames the verification page for the action, with a fresh nonce each time, out of sight', async () => {
    const first = turnstileToken('upload');
    const { dialog, frame, url, send } = page();
    expect(url.origin).toBe('https://verify.example.test');
    expect(url.pathname).toBe('/extension/turnstile');
    expect(url.searchParams.get('action')).toBe('upload');
    expect(url.searchParams.get('nonce')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(frame.title).toBe('Verify you are human');
    // Rendered, so the challenge runs, but neither visible nor reachable.
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.inert).toBe(true);
    expect(dialog.style.opacity).toBe('0');
    send({ status: 'solved', token: 'first' });
    expect(await first).toEqual({ ok: true, token: 'first' });

    const second = turnstileToken('upload');
    expect(page().url.searchParams.get('nonce')).not.toBe(url.searchParams.get('nonce'));
    page().send({ status: 'solved', token: 'second' });
    expect(await second).toEqual({ ok: true, token: 'second' });
  });

  it('gives up when the page never answers', async () => {
    vi.useFakeTimers();
    const result = turnstileToken('vote');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(document.querySelector('iframe')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({
      ok: false,
      message: 'Verification did not load. Check your connection and try again.',
    });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('shows the challenge when a click is needed, and Cancel stops it and gives focus back', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();

    const result = turnstileToken('report');
    const { dialog, send, cancel } = page();
    send({ status: 'interactive' });
    expect(dialog.hasAttribute('aria-hidden')).toBe(false);
    expect(dialog.inert).toBe(false);
    expect(dialog.style.opacity).toBe('1');
    expect(dialog.style.pointerEvents).toBe('auto');
    expect(document.activeElement).toBe(cancel);

    cancel.click();
    expect(await result).toEqual({ ok: false, message: 'Verification cancelled.' });
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it('takes Escape as Cancel', async () => {
    const result = turnstileToken('report');
    const { dialog, send } = page();
    send({ status: 'interactive' });
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(await result).toEqual({ ok: false, message: 'Verification cancelled.' });
  });

  it('listens to the page no further once it has an answer', async () => {
    const result = turnstileToken('vote');
    const { send } = page();
    send({ status: 'solved', token: 'real' });
    send({ status: 'error', code: '300030' });
    send({ status: 'interactive' });
    expect(await result).toEqual({ ok: true, token: 'real' });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('uses the native modal where the browser has one, and closes it again', async () => {
    // jsdom has no showModal. Stand one in, as browsers have it.
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    try {
      const result = turnstileToken('vote');
      const { dialog, send, cancel } = page();
      send({ status: 'interactive' });
      expect(showModal).toHaveBeenCalledOnce();
      expect(dialog.open).toBe(true);
      cancel.click();
      await result;
      expect(close).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });
});
