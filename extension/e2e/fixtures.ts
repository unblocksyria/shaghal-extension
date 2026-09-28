import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubFor, TEST_PAGE_HTML, TEST_PAGE_ORIGIN } from './stubs';

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.output', 'chrome-mv3');

/** Chrome's extension ID: the first 16 bytes of sha256(manifest key), each hex digit mapped to a-p. */
export function extensionId(): string {
  const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')) as { key?: string };
  if (manifest.key === undefined) throw new Error('The built manifest carries no key, so its ID cannot be derived.');
  const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (digit) => 'abcdefghijklmnop'.charAt(Number.parseInt(digit, 16)));
}

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ApiStub {
  /** Requests no stub answered; the fixture fails the test when any appear. */
  readonly unstubbed: string[];
  /** Stubbed requests, in arrival order. */
  readonly calls: RecordedCall[];
}

/**
 * Chromium with the built extension loaded and the panel open in its own tab.
 * Every http(s) request is answered by a stub, so nothing reaches a real host.
 */
export const test = base.extend<{ context: BrowserContext; page: Page; panel: Page; api: ApiStub }>({
  context: async ({}, use) => {
    if (!existsSync(path.join(extensionDir, 'manifest.json'))) {
      throw new Error(`No built extension at ${extensionDir}. Run \`npm run build\` first.`);
    }
    const profile = mkdtempSync(path.join(tmpdir(), 'shaghal-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      // Full Chromium. Branded Chrome refuses --load-extension, and Playwright's
      // headless shell cannot host extensions.
      channel: 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        // Recent Chromium ignores --load-extension without this, and the panel fails with ERR_BLOCKED_BY_CLIENT.
        '--enable-unsafe-extension-testing',
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  },
  // `page` and `panel` depend on `api`, so the routes exist before any request.
  api: async ({ context }, use) => {
    const calls: RecordedCall[] = [];
    const unstubbed: string[] = [];
    // http(s) only. Routing chrome-extension:// pages blocks them.
    await context.route(
      (url) => url.protocol === 'http:' || url.protocol === 'https:',
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === TEST_PAGE_ORIGIN) {
          await route.fulfill({ status: 200, contentType: 'text/html', body: TEST_PAGE_HTML });
          return;
        }
        const answer = stubFor(request.method(), url.pathname);
        if (answer === undefined) {
          unstubbed.push(`${request.method()} ${url.href}`);
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'UNSTUBBED', message: 'No stub answered this request' }),
          });
          return;
        }
        calls.push({
          method: request.method(),
          path: url.pathname,
          headers: request.headers(),
          body: request.postData(),
        });
        await route.fulfill({ status: answer.status ?? 200, contentType: answer.contentType, body: answer.body });
      },
    );
    await use({ calls, unstubbed });
    expect(unstubbed, `Requests no stub answered:\n${unstubbed.join('\n')}`).toEqual([]);
  },
  page: async ({ context, api }, use) => {
    const existing = context.pages()[0];
    await use(existing ?? (await context.newPage()));
  },
  panel: async ({ context, api }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId()}/sidepanel.html`);
    await use(page);
  },
});

export { expect };
