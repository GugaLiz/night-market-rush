import {defineConfig} from '@playwright/test';

// This profile and port are isolated from normal browser storage and services.
const build=process.env.COCOS_CANDIDATE_BUILD??'web-storage-candidate1121';
if(!/^[a-zA-Z0-9_-]+$/.test(build))throw new Error('Invalid candidate build directory');
process.env.COCOS_CANDIDATE_TEST_BUILD=build;
export default defineConfig({
  testDir:'./tests/cocos-candidate-e2e',workers:1,timeout:60000,
  outputDir:'.runtime/cocos-candidate-test-results',reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:45584',browserName:'chromium',channel:'chrome',viewport:{width:1280,height:720}},
  webServer:{command:`"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 45584 --strictPort`,
    url:'http://127.0.0.1:45584',reuseExistingServer:false,timeout:30000},
});
