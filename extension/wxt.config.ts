import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // Not 3000, so it can run beside the website's dev server.
  dev: { server: { port: 3010 } },
  // Chrome rejects the crossorigin modulepreload link in extension pages and
  // logs two console warnings for it. The chunks load from the extension
  // package, so the hint gains nothing.
  vite: () => ({ build: { modulePreload: false } }),
  manifest: {
    // Localized in public/_locales: شغّال in Arabic, Shaghal everywhere else.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.1.0',
    // Chromium only. 123 is the first version with CSS light-dark(), which the theme uses.
    minimum_chrome_version: '123',
    // tabs: read the active tab's URL.
    // <all_urls>: captureVisibleTab on any site, and fetch the API, the country
    // check and a local API in development.
    permissions: ['storage', 'sidePanel', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '__MSG_actionTitle__' },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    // Chrome Web Store public key. It fixes the extension ID at
    // epmjhaoobmgfclbkelhkiakijjocjgfm, unpacked builds included, which the
    // verification page (verify.unblocksyria.com) requires of its parent.
    // Public by design: the store ships it in every installed manifest.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEJ8/2SS81prnoFOy8XMC+v3NbFAFn7CDoUOVoLA3xKGU1sziLH+dPRMaBfRyACY0xzDwrN2zMqE/WP8c3tUAFPovDicbVwhqT3WhtHapfOFGnJaApXfh+kcY0AgYSw2Ph7gb3wExWVPIdLilhi1Y/Y0LCJBlGrFYPKuJAaDA8sY617u6xxHQAlfw2M/7+weRw8Hq4v29jjx0QCOhptogeuVq6y38T5nPALs/GD+epRrkDY3Kqfyu6dWGUwy3LZ6MTpEHA7JCj58+Xs3PjJnen/5XvGABPwdUOc+LrJ42EBb/4D5V17ykJehOC8viC9WNvvZrVrF4B/l5WSPO47JtQIDAQAB',
  },
});
