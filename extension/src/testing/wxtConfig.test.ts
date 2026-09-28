import { describe, expect, it } from 'vitest';
import config, { GECKO_ID, MIN_FIREFOX_VERSION } from '../../wxt.config';

const env = { mode: 'production', command: 'build', manifestVersion: 3 } as const;

async function manifest(browser: 'chrome' | 'firefox') {
  expect(config.manifest).toBeTypeOf('function');
  if (typeof config.manifest !== 'function') throw new Error('unreachable');
  return await config.manifest({ ...env, browser });
}

// See the modulepreload comment in wxt.config.ts.
describe('the extension build', () => {
  it('leaves the modulepreload hint off', async () => {
    expect(config.vite).toBeTypeOf('function');
    if (typeof config.vite !== 'function') return;
    const vite = await config.vite({ ...env, browser: 'chrome' });
    expect(vite.build?.modulePreload).toBe(false);
  });

  it('builds Manifest V3 for every browser', () => {
    expect(config.manifestVersion).toBe(3);
  });
});

describe('the manifest', () => {
  it('pins the Chrome build to the store ID and keeps Firefox keys out of it', async () => {
    const chrome = await manifest('chrome');
    // The verification page frames only this ID's origin.
    expect(chrome.key).toMatch(/^MIIB/);
    expect(chrome.minimum_chrome_version).toBe('123');
    expect(chrome.permissions).toEqual(['storage', 'sidePanel', 'tabs']);
    expect(chrome.browser_specific_settings).toBeUndefined();
  });

  it('gives the Firefox build its add-on ID, minimum version and data-collection notice', async () => {
    const firefox = await manifest('firefox');
    expect(firefox.key).toBeUndefined();
    expect(firefox.minimum_chrome_version).toBeUndefined();
    // sidebar_action needs no permission.
    expect(firefox.permissions).toEqual(['storage', 'tabs']);
    expect(firefox.browser_specific_settings).toEqual({
      gecko: {
        id: GECKO_ID,
        strict_min_version: MIN_FIREFOX_VERSION,
        data_collection_permissions: {
          required: ['browsingActivity', 'websiteContent', 'personallyIdentifyingInfo'],
        },
      },
      // Declaring gecko_android would lock the listing to Android; see wxt.config.ts.
    });
  });

  it('asks both builds for every site, which the API, captures and the relay need', async () => {
    for (const browser of ['chrome', 'firefox'] as const)
      expect((await manifest(browser)).host_permissions).toEqual(['<all_urls>']);
  });
});
