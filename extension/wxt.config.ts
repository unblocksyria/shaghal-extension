import { defineConfig } from 'wxt';

/** The extension's add-on ID on addons.mozilla.org. Fixed once the add-on is published. */
export const GECKO_ID = 'shaghal@unblocksyria.com';

/**
 * The oldest Firefox the extension supports. 140 is the first that reads
 * data_collection_permissions, which addons.mozilla.org requires of new
 * listings; it also covers light-dark() (120), storage.session (115) and host
 * permissions granted at install (127).
 */
export const MIN_FIREFOX_VERSION = '140.0';

export default defineConfig({
  srcDir: 'src',
  // Manifest V3 in every browser. WXT would build Manifest V2 for Firefox.
  manifestVersion: 3,
  // Not 3000, so it can run beside the website's dev server.
  dev: { server: { port: 3010 } },
  // Chrome rejects the crossorigin modulepreload link in extension pages and
  // logs two console warnings for it. The chunks load from the extension
  // package, so the hint gains nothing.
  vite: () => ({ build: { modulePreload: false } }),
  manifest: ({ browser }) => ({
    // Localized in public/_locales: شغّال in Arabic, Shaghal everywhere else.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.2.0',
    // tabs: read the active tab's URL.
    // sidePanel: Chrome's side panel. Firefox shows the same page through
    // sidebar_action, which needs no permission.
    // <all_urls>: captureVisibleTab on any site, and fetch the API, the country
    // check and a local API in development.
    permissions: browser === 'firefox' ? ['storage', 'tabs'] : ['storage', 'sidePanel', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '__MSG_actionTitle__' },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              strict_min_version: MIN_FIREFOX_VERSION,
              // What addons.mozilla.org shows before install. The panel sends
              // the active tab's address to the API to match it to a service,
              // and forms can send screenshots of the page and an email.
              data_collection_permissions: {
                required: ['browsingActivity', 'websiteContent', 'personallyIdentifyingInfo'],
              },
            },
            // No gecko_android: the add-on is a sidebar, which Firefox for
            // Android does not have, and addons.mozilla.org lets Android be
            // unticked only while the manifest says nothing about it. The
            // validator's warning that 140 predates Android's support for
            // data_collection_permissions is the price, and is harmless.
          },
        }
      : {
          // Chromium only. 123 is the first version with CSS light-dark(), which the theme uses.
          minimum_chrome_version: '123',
          // Chrome Web Store public key. It fixes the extension ID at
          // epmjhaoobmgfclbkelhkiakijjocjgfm, unpacked builds included, which the
          // verification page (verify.unblocksyria.com) requires of its parent.
          // Public by design: the store ships it in every installed manifest.
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEJ8/2SS81prnoFOy8XMC+v3NbFAFn7CDoUOVoLA3xKGU1sziLH+dPRMaBfRyACY0xzDwrN2zMqE/WP8c3tUAFPovDicbVwhqT3WhtHapfOFGnJaApXfh+kcY0AgYSw2Ph7gb3wExWVPIdLilhi1Y/Y0LCJBlGrFYPKuJAaDA8sY617u6xxHQAlfw2M/7+weRw8Hq4v29jjx0QCOhptogeuVq6y38T5nPALs/GD+epRrkDY3Kqfyu6dWGUwy3LZ6MTpEHA7JCj58+Xs3PjJnen/5XvGABPwdUOc+LrJ42EBb/4D5V17ykJehOC8viC9WNvvZrVrF4B/l5WSPO47JtQIDAQAB',
        }),
  }),
  hooks: {
    // WXT turns the side panel into Firefox's sidebar_action, titled from the
    // page's <title>. Use the localized name and the toolbar icons instead.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser !== 'firefox' || manifest.sidebar_action === undefined) return;
      manifest.sidebar_action.default_title = '__MSG_extName__';
      manifest.sidebar_action.default_icon = manifest.icons;
    },
  },
});
