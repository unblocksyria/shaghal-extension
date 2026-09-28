import { defineConfig } from '@playwright/test';

/** Runs e2e/ against the built extension. Needs `npm run build` first, for `.output/chrome-mv3`. */
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
