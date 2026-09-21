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
  },
});
