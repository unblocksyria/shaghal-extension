import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

// See the modulepreload comment in wxt.config.ts.
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
