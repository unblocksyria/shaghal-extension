import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Unblock Syria Tester',
    description: 'Internal testing tool for unblocksyria.com reporters',
    version: '0.1.0',
    permissions: ['activeTab', 'storage', 'sidePanel', 'tabs', 'webRequest'],
    host_permissions: ['https://api.unblocksyria.com/*', '<all_urls>'],
    action: { default_title: 'Open Unblock Syria Tester' },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
