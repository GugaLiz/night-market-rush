import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

// Play normal practice controls. Observe exactly the text painted in the current frame.
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:start});
  await page.clock.pauseAt(new Date(+start+1000));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173', {waitUntil:'networkidle'});
  await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
  await page.getByLabel('敌人类型').selectOption('bowl',{force:true});
  await page.evaluate(() => {
    const ctx = document.querySelector('#game-canvas').getContext('2d');
    const clear = ctx.clearRect.bind(ctx), fill = ctx.fillText.bind(ctx);
    window.paintedNumbers = [];
    ctx.clearRect = (...args) => {window.paintedNumbers.length=0; return clear(...args);};
    ctx.fillText = (str,...args) => {
      if (/^(54|108|120|\d+段)$/.test(str)) window.paintedNumbers.push({text:str,alpha:ctx.globalAlpha});
      return fill(str,...args);
    };
  });
  await page.getByRole('button',{name:'生成单只',exact:true}).click({force:true});
  const sample = () => page.evaluate(() => {
    const s = window.__gameTest.snapshot();
    return {time:s.time, weapon:s.weapon.kind, hp:s.enemies[0]?.hp??0, kills:s.kills, labels:window.paintedNumbers};
  });
  const capture = () => page.screenshot({clip:{x:535,y:160,width:440,height:265},scale:'css'});
  const frames = [], readings = [];
  for(const [amount,count,hp] of [[54,5,66],[108,10,12],[120,12,0]]){
    let hit;
    for(let i=0;i<90;i++){
      await page.clock.runFor(32);
      const state=await sample();
      if(!state.labels.some(label=>label.text===String(amount)))continue;
      hit=state;break;
    }
    assert.ok(hit, 'Missing painted total '+amount);
    assert.equal(hit.weapon,'tongs');assert.equal(hit.hp,hp);
    assert.equal(hit.kills,hp===0?1:0);
    assert.ok(hit.labels.some(label=>label.text===count+'段'));
    readings.push(hit);
    if(hp)frames.push({shot:(await capture()).toString('base64'),caption:'碗怪剩余 '+hp+' 生命'});
  }
  await page.clock.runFor(1824);
  const linger=await sample(), killed=readings.at(-1);
  const getAlpha = state => state.labels.find(label=>label.text==='120')?.alpha;
  assert.ok(getAlpha(linger)>.70 && getAlpha(linger)<1);
  frames.push({shot:(await capture()).toString('base64'),caption:'击败后 '+(linger.time-killed.time).toFixed(2)+' 秒'});
  await page.clock.runFor(464);
  const fading=await sample();
  assert.ok(getAlpha(fading)>0 && getAlpha(fading)<.25);
  await page.clock.runFor(176);
  const gone=await sample();
  assert.equal(getAlpha(gone),undefined);
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
  console.log(JSON.stringify({browser:browser.version(),readings,linger,fading,gone},null,2));
} finally {await browser.close();}
