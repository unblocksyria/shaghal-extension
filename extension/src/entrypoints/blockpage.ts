import { findBlockPhrase } from '../lib/blocklist';

const SCAN_TEXT_LIMIT = 5000;

export default defineUnlistedScript(() => {
  void chrome.runtime.sendMessage({ type: 'BLOCKPAGE_RESULT', payload: buildPageSignal() });

  function buildPageSignal(): { matchedPhrase: string | null; tier?: string; pageTitle: string | null; pageUrl: string | null } {
    const match = findBlockPhrase(collectScanText());
    return {
      matchedPhrase: match?.phrase ?? null,
      tier: match?.tier,
      pageTitle: document.title || null,
      pageUrl: location.href,
    };
  }

  function collectScanText(): string {
    const headings = [...document.querySelectorAll('h1, h2')]
      .map((heading) => heading.textContent ?? '')
      .join(' ');
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    const bodyText = document.body?.innerText.slice(0, SCAN_TEXT_LIMIT) ?? '';
    return [document.title, headings, description, bodyText].join(' ');
  }
});
