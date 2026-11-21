import {defineConfig} from '@playwright/test';

/** Run only after building the Cocos web-mobile development prototype. */
const buildName=process.env.COCOS_BUILD_NAME??'web-mobile';
if(!/^[a-zA-Z0-9_-]+$/.test(buildName))throw new Error('Invalid Cocos build directory name');
export default defineConfig({
  testDir:'./tests/cocos-e2e',workers:1,timeout:60000,
  reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:45575',browserName:'chromium',channel:'chrome',viewport:{width:1280,height:720}},
  webServer:{
    command:`"${process.execPath}" node_modules/vite/bin/vite.js cocos/build/${buildName} --host 127.0.0.1 --port 45575 --strictPort`,
    url:'http://127.0.0.1:45575',reuseExistingServer:false,timeout:30000,
  },
});
