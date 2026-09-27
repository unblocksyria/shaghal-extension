import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

// The modulepreload link Chrome declines inside an extension page, calling it a
// cross world resource mismatch and then reporting the same resource as
// preloaded but never used. Those two messages are the panel's only console
// noise, so the hint stays off in the build (commit ce4930d).
describe('the extension build', () => {
  it('leaves the modulepreload hint off', async () => {
    expect(config.vite).toBeTypeOf('function');
    if (typeof config.vite !== 'function') return;
    const vite = await config.vite({
      mode: 'production',
      command: 'build',
      browser: 'chrome',
      manifestVersion: 3,
    });
    expect(vite.build?.modulePreload).toBe(false);
  });
});
