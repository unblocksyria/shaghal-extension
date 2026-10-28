/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchTurnstileToken, registerTurnstileHost, turnstileToken } from './turnstile';

vi.mock('./config', () => ({ IS_FIREFOX: false, IS_LOCAL_API: false, VERIFY_BASE: 'https://verify.example.test' }));

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = '';
});

/** A slot beside a button, as VerificationSlot renders it. */
function slot(visible = true): HTMLDivElement {
  const host = document.createElement('div');
  host.checkVisibility = () => visible;
  document.body.append(host);
  cleanups.push(registerTurnstileHost(host));
  return host;
}

/** Speaks as the page inside the n-th verification frame. */
function framePage(index = 0) {
  const frame = document.querySelectorAll('iframe')[index];
  if (frame === undefined) throw new Error('No verification frame was opened');
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
  const box = frame.parentElement as HTMLElement;
  return { frame, box, url, send };
}

describe('verification in a slot', () => {
  it('shows a needed click under the button that asked, not over the panel', async () => {
    const host = slot();
    const result = turnstileToken('vote');
    const { box, send } = framePage();
    expect(host.contains(box)).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
    // Laid over the slot, out of sight and out of reach, until a click is needed.
    expect(box.dataset.state).toBe('waiting');
    expect(box.inert).toBe(true);

    send({ status: 'interactive' });
    expect(box.dataset.state).toBe('shown');
    expect(box.inert).toBe(false);
    expect(box.textContent).toContain('Confirm you are human to continue.');
    expect(document.activeElement?.textContent).toBe('Cancel');

    send({ status: 'solved', token: 'inline' });
    expect(await result).toEqual({ ok: true, token: 'inline' });
    expect(host.childElementCount).toBe(0);
  });

  it('uses the dialog when the only slot is hidden, as under Settings', async () => {
    const host = slot(false);
    const result = turnstileToken('report');
    expect(host.childElementCount).toBe(0);
    expect(document.querySelector('dialog iframe')).not.toBeNull();
    framePage().send({ status: 'solved', token: 'dialog' });
    expect(await result).toEqual({ ok: true, token: 'dialog' });
  });

  it('takes Escape in the slot as Cancel', async () => {
    slot();
    const result = turnstileToken('report');
    const { box, send } = framePage();
    send({ status: 'interactive' });
    // Other keys, such as Tab into the challenge, leave it running.
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    box.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(box.isConnected).toBe(true);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    box.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(await result).toEqual({ ok: false, message: 'Verification cancelled.' });
  });

  it('scrolls a needed click into view, without motion when the tester asks for less', async () => {
    slot();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const result = turnstileToken('vote');
    const { send } = framePage();
    send({ status: 'interactive' });
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    send({ status: 'solved', token: 'still' });
    await result;
  });

  it('stops only the challenge in the slot that leaves, not one in another slot', async () => {
    const kept = slot();
    const leaving = document.createElement('div');
    document.body.append(leaving);
    const unregister = registerTurnstileHost(leaving);
    const inLeaving = turnstileToken('vote');
    unregister();
    unregister();
    expect(await inLeaving).toEqual({ ok: false, message: 'Verification cancelled.' });

    const inKept = turnstileToken('report');
    const other = document.createElement('div');
    document.body.append(other);
    registerTurnstileHost(other)();
    expect(kept.querySelector('iframe')).not.toBeNull();
    framePage().send({ status: 'solved', token: 'kept' });
    expect(await inKept).toEqual({ ok: true, token: 'kept' });
  });

  it('stops the challenge when its slot leaves the page', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const unregister = registerTurnstileHost(host);
    const result = turnstileToken('vote');
    unregister();
    expect(await result).toEqual({ ok: false, message: 'Verification cancelled.' });
  });
});

describe('a token fetched ahead', () => {
  it('is used by the next request, which shows its click only then', async () => {
    const host = slot();
    prefetchTurnstileToken('vote');
    const { box, send } = framePage();
    send({ status: 'interactive' });
    // Nobody asked yet, so the click stays hidden.
    expect(box.dataset.state).toBe('waiting');

    const result = turnstileToken('vote');
    expect(box.dataset.state).toBe('shown');
    send({ status: 'solved', token: 'early' });
    expect(await result).toEqual({ ok: true, token: 'early' });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(host.childElementCount).toBe(0);
  });

  it('hands over a token solved before the request came, without a new frame', async () => {
    slot();
    prefetchTurnstileToken('upload');
    framePage().send({ status: 'solved', token: 'ready' });
    await Promise.resolve();
    expect(await turnstileToken('upload')).toEqual({ ok: true, token: 'ready' });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('is replaced by a fresh challenge when it failed or went stale', async () => {
    slot();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    prefetchTurnstileToken('vote');
    framePage().send({ status: 'solved', token: 'stale' });
    await Promise.resolve();

    clock.mockReturnValue(now + 5 * 60_000);
    const result = turnstileToken('vote');
    await vi.waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(1));
    framePage().send({ status: 'solved', token: 'fresh' });
    expect(await result).toEqual({ ok: true, token: 'fresh' });
  });

  it('stands as cancelled when the tester cancels it after the request claimed it', async () => {
    slot();
    prefetchTurnstileToken('vote');
    const { send } = framePage();
    send({ status: 'interactive' });
    const result = turnstileToken('vote');
    (document.activeElement as HTMLElement).click();
    expect(await result).toEqual({ ok: false, message: 'Verification cancelled.' });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('is replaced when it failed before anyone asked for it', async () => {
    slot();
    prefetchTurnstileToken('upload');
    framePage().send({ status: 'error', code: '300030' });
    const result = turnstileToken('upload');
    await vi.waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(1));
    framePage().send({ status: 'solved', token: 'second try' });
    expect(await result).toEqual({ ok: true, token: 'second try' });
  });

  it('is fetched once however often the pointer passes', () => {
    slot();
    prefetchTurnstileToken('vote');
    prefetchTurnstileToken('vote');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });
});
