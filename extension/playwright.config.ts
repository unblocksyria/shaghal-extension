import { defineConfig } from '@playwright/test';

/**
 * Drives the built extension in Playwright's own Chromium. Run `npm run build`
 * first: the specs refuse to start without `.output/chrome-mv3`.
 * The specs live in `e2e/`; traces are kept for a failed run only.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    navigationTimeout: 15_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
});
