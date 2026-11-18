import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='docs/verification/v2';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5173');await page.waitForSelector('[data-view=home]');
const weapons=['tongs','bag','chopsticks','spirit','knife','tray','umbrella','sword','lunchbox','talisman'];
const results=[];
for(const weapon of process.argv.includes('--feedback-only')?[]:weapons){
  await page.evaluate(kind=>{window.__gameTest.scenario('showcase');const g=window.__gameTest.game();g.reset(1234,true);g.setWeapon(kind);g.state.player.invulnerableUntil=kind==='umbrella'?0:100;for(let i=0;i<3;i++){const e=g.spawnEnemy('bowl',{x:640+(kind==='lunchbox'?150:100)+i*25,y:370+i*25});if(kind!=='umbrella')e.stunUntil=1;}},weapon);
  await page.waitForTimeout(1050);
  await page.screenshot({scale:'css',path:`${dir}/weapon-${weapon}.png`});
  results.push(await page.evaluate(()=>{const s=window.__gameTest.snapshot();return{weapon:s.weapon.kind,hp:s.player.hp,enemies:s.enemies.map(e=>e.hp),projectiles:s.projectiles.length};}));
}
await page.evaluate(()=>{window.__gameTest.scenario('showcase');const g=window.__gameTest.game();g.reset(123,true);g.setWeapon('knife');g.state.player.hp=76;g.state.player.invulnerableUntil=100;g.spawnEnemy('bowl',{x:696,y:370});g.spawnEnemy('box',{x:700,y:415});g.triggerSkill('skate');g.triggerSkill('bubble');});
await page.waitForTimeout(650);await page.screenshot({scale:'css',path:`${dir}/damage-stack.png`});
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);if(await page.locator('[data-view=pause]').count())await page.getByRole('button',{name:'继续挑战',exact:true}).click();await page.waitForTimeout(100);await page.screenshot({scale:'css',path:`${dir}/mobile-battle.png`});
await page.setViewportSize({width:1280,height:720});
await page.evaluate(()=>{window.__gameTest.scenario('showcase');const g=window.__gameTest.game();g.reset(45,true);g.state.player.invulnerableUntil=100;g.setWeapon('talisman');for(let i=0;i<60;i++){const a=i*2.4,r=90+(i%6)*42;g.spawnEnemy(i%3===0?'bowl':i%3===1?'box':'bun',{x:640+Math.cos(a)*r,y:370+Math.sin(a)*r});}for(const skill of ['skate','lure','bubble','cones','route','heat','stamp','supply'])g.triggerSkill(skill);});
await page.waitForTimeout(150);
const perf=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now();const frame=t=>{times.push(t-previous);previous=t;if(times.length<150)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);const s=window.__gameTest.snapshot();resolve({frames:times.length,median:times[75],p95:times[142],enemies:s.enemies.length,projectiles:s.projectiles.length,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]});}};requestAnimationFrame(frame);}));
await page.screenshot({scale:'css',path:`${dir}/stress.png`});
await writeFile(`${dir}/report.json`,JSON.stringify({weapons:results,performance:perf,errors},null,2));console.log(JSON.stringify({performance:perf,errors}));await browser.close();if(errors.length)process.exitCode=1;
