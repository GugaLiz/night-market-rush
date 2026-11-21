import {defineConfig} from '@playwright/test';

// Isolated origin: both the unmodified Cocos debug build and the old dist are
// served from different paths on this port. Playwright creates a fresh profile.
const build=process.env.COCOS_BUILD_NAME??'web-mobile-check1121';
if(!/^[a-zA-Z0-9_-]+$/.test(build))throw new Error('Invalid Cocos build directory name');
process.env.COCOS_STORAGE_BUILD=build;
export default defineConfig({
  testDir:'./tests/cocos-storage-e2e',workers:1,timeout:60000,
  outputDir:'.runtime/cocos-storage-test-results',reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:45581',browserName:'chromium',channel:'chrome',viewport:{width:1280,height:720}},
  webServer:{command:`"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 45581 --strictPort`,
    url:'http://127.0.0.1:45581',reuseExistingServer:false,timeout:30000},
});
