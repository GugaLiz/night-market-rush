import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('test-results/production');
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
try{
  await page.goto('http://localhost:4173');
  await page.locator('[data-view="home"]').waitFor();
  if(await page.evaluate(()=>typeof window.__gameTest!=='undefined'))throw new Error('Development hook leaked into production');
  await page.screenshot({animations:'disabled',path:path.join(output,'home.png')});
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-view="tutorial"]').waitFor();
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-view="play"]').waitFor({timeout:10000});
  await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');
  const timing=await page.evaluate(()=>new Promise(resolve=>{
    const start=performance.now();let frames=0,previous=start;const gaps=[];
    function next(now){frames++;gaps.push(now-previous);previous=now;if(now-start>=2000){gaps.sort((a,b)=>a-b);resolve({frames,durationMs:now-start,fps:frames*1000/(now-start),p95FrameMs:gaps[Math.floor(gaps.length*.95)]});}else requestAnimationFrame(next);}
    requestAnimationFrame(next);
  }));
  await page.screenshot({animations:'disabled',path:path.join(output,'play.png')});
  await page.keyboard.press('Escape');
  await page.locator('[data-view="pause"]').waitFor();
  await page.screenshot({animations:'disabled',path:path.join(output,'pause.png')});
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-tab="sound"]').click();
  await page.screenshot({animations:'disabled',path:path.join(output,'settings.png')});
  const result={productionURL:'http://localhost:4173',developmentHookAbsent:true,timing,errors,checkedAt:new Date().toISOString()};
  await writeFile(path.join(output,'report.json'),JSON.stringify(result,null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}

