import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest applies the WXT build settings and provides fakeBrowser, an
// in-memory browser API that tests reset themselves. Tests run in node. A
// component test opts into jsdom with a `/** @vitest-environment jsdom */`
// docblock on its first line.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // React Testing Library needs globals to clean up after each test.
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/testing/setup.ts'],
    testTimeout: 10_000,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
