/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The preconnect module, built against the given hosts. */
async function preconnectWith(config: { API_BASE: string; VERIFY_BASE: string; IS_LOCAL_API: boolean }) {
  vi.resetModules();
  vi.doMock('./config', () => config);
  return (await import('./preconnect')).preconnect;
}

const hints = () =>
  Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')).map((link) => ({
    href: link.href,
    crossOrigin: link.crossOrigin,
  }));

afterEach(() => {
  document.head.innerHTML = '';
  vi.doUnmock('./config');
});

describe('opening connections early', () => {
  it('opens an anonymous connection to the API and a credentialed one to the verification page', async () => {
    const preconnect = await preconnectWith({
      API_BASE: 'https://api.example.test',
      VERIFY_BASE: 'https://verify.example.test/path',
      IS_LOCAL_API: false,
    });
    preconnect();
    expect(hints()).toEqual([
      { href: 'https://api.example.test/', crossOrigin: 'anonymous' },
      { href: 'https://verify.example.test/', crossOrigin: null },
    ]);
  });

  it('skips the verification page with a local API, which needs no verification', async () => {
    const preconnect = await preconnectWith({
      API_BASE: 'http://localhost:8787',
      VERIFY_BASE: 'http://localhost:8790',
      IS_LOCAL_API: true,
    });
    preconnect();
    expect(hints()).toEqual([{ href: 'http://localhost:8787/', crossOrigin: 'anonymous' }]);
  });
});
