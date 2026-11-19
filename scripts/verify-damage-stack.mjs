import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

// Follow three real weapon contacts in practice and inspect the text painted throughout.
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:start});
  await page.clock.pauseAt(new Date(+start+1000));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173', {waitUntil:'networkidle'});
  await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
  await page.getByLabel('敌人类型').selectOption('bowl',{force:true});
  await page.evaluate(() => {
    const ctx = document.querySelector('#game-canvas').getContext('2d');
    const clear = ctx.clearRect.bind(ctx), fill = ctx.fillText.bind(ctx);
    window.healthReadouts=[];
    window.floatingHits=new Set();
    ctx.clearRect = (...args) => {window.healthReadouts.length=0;return clear(...args);};
    ctx.fillText = (str,...args) => {
      if (/^\d+\/\d+$/.test(str))window.healthReadouts.push(str);
      if (/^[+−-]?\d+(?:\.\d+)?(?:段|(?:\s+\+\d+)+)?$/.test(str))window.floatingHits.add(str);
      return fill(str,...args);
    };
  });
  await page.getByRole('button',{name:'生成单只',exact:true}).click({force:true});
  const sample = () => page.evaluate(() => {
    const s = window.__gameTest.snapshot();
    return {time:s.time,weapon:s.weapon.kind,hp:s.enemies[0]?.hp??0,kills:s.kills,readouts:window.healthReadouts,hits:[...window.floatingHits]};
  });
  const capture = () => page.screenshot({clip:{x:535,y:160,width:440,height:265},scale:'css'});
  const frames = [], readings = [];
  for(const hp of [66,12,0]){
    let hit;
    for(let i=0;i<90;i++){
      await page.clock.runFor(32);
      const state=await sample();
      if(state.hp!==hp || !state.readouts.includes(hp+'/120'))continue;
      hit=state;break;
    }
    assert.ok(hit,'Missing health plaque '+hp+'/120');
    assert.equal(hit.weapon,'tongs');assert.equal(hit.hp,hp);
    assert.equal(hit.kills,hp===0?1:0);
    assert.deepEqual(hit.hits,[],'An enemy contact painted floating text');
    readings.push(hit);
    frames.push({shot:(await capture()).toString('base64'),caption:hp?'碗怪剩余 '+hp+' 生命':'碗怪倒下，血条清空'});
  }
  await page.clock.runFor(2400);
  const gone=await sample();
  assert.deepEqual(gone.hits,[]);
  assert.ok(!gone.readouts.includes('0/120'));
  assert.deepEqual(errors,[]);
  const webp=await page.evaluate(async panels=>{
    const out=document.createElement('canvas'),w=440,h=265,space=8;
    out.width=w*panels.length+space*(panels.length-1);out.height=h+40;
    const c=out.getContext('2d');c.fillStyle='#261d25';c.fillRect(0,0,out.width,out.height);
    for(const [i,panel] of panels.entries()){
      const image=new Image();image.src='data:image/png;base64,'+panel.shot;await image.decode();
      const x=i*(w+space);c.drawImage(image,x,0);
      c.fillStyle='#f4e7d0';c.font='500 18px "Microsoft YaHei",sans-serif';c.fillText(panel.caption,x+14,h+27);
    }
    return out.toDataURL('image/webp',.97).split(',')[1];
  },frames);
  const out=process.env.STACK_IMAGE || fileURLToPath(new URL('../docs/verification/impact/damage-stack.webp',import.meta.url));
  await mkdir(dirname(out),{recursive:true});await writeFile(out,Buffer.from(webp,'base64'));
  console.log(JSON.stringify({browser:browser.version(),readings,gone},null,2));
} finally {await browser.close();}
