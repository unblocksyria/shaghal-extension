import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest applies the extension's build settings and provides fakeBrowser,
// an in-memory stand-in for the browser APIs (tests reset it themselves).
// Lib tests run on node; a component test opts into jsdom with a
// `/** @vitest-environment jsdom */` docblock on its first line.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Globals let React Testing Library unmount its trees between tests.
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/testing/setup.ts'],
    testTimeout: 10_000,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
