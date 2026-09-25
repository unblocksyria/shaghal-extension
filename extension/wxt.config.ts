import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // Off 3000, which the website uses in development, so both can run side by side.
  dev: { server: { port: 3010 } },
  manifest: {
    // Localized in public/_locales: شغّال in Arabic, Shaghal everywhere else.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.1.0',
    // Chromium browsers only (Chrome, Edge, Brave, Opera). 123 is the first
    // with CSS light-dark(), which the theme is built on.
    minimum_chrome_version: '123',
    // tabs: read the shown tab's address to look it up.
    // <all_urls>: screenshot any site as evidence (captureVisibleTab) and reach
    // the API, the country check and, in development, a local API.
    permissions: ['storage', 'sidePanel', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '__MSG_actionTitle__' },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    // The Chrome Web Store item's public key. It fixes the extension ID at
    // epmjhaoobmgfclbkelhkiakijjocjgfm for unpacked builds too, which the
    // verification page (verify.unblocksyria.com) requires of its parent.
    // Public by design: the store ships it in every installed manifest.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEJ8/2SS81prnoFOy8XMC+v3NbFAFn7CDoUOVoLA3xKGU1sziLH+dPRMaBfRyACY0xzDwrN2zMqE/WP8c3tUAFPovDicbVwhqT3WhtHapfOFGnJaApXfh+kcY0AgYSw2Ph7gb3wExWVPIdLilhi1Y/Y0LCJBlGrFYPKuJAaDA8sY617u6xxHQAlfw2M/7+weRw8Hq4v29jjx0QCOhptogeuVq6y38T5nPALs/GD+epRrkDY3Kqfyu6dWGUwy3LZ6MTpEHA7JCj58+Xs3PjJnen/5XvGABPwdUOc+LrJ42EBb/4D5V17ykJehOC8viC9WNvvZrVrF4B/l5WSPO47JtQIDAQAB',
  },
});
