import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const output=process.env.ULTIMATE_CAPTURE||fileURLToPath(new URL('../docs/verification/clay/ultimates.webp',import.meta.url));
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],captures=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));
await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
await page.addInitScript(()=>{
  window.renderedUltimateTiles=new Set();
  window.flyingParcelX=[];
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
    if(this.canvas.id==='game-canvas' && image instanceof HTMLImageElement && image.src.endsWith('clay-ultimate-fx.webp') && args.length===8){
      window.renderedUltimateTiles.add(Math.round(args[0]/args[2])+2*Math.round(args[1]/args[3]));
    }
    const parcel=window.expressParcelSprite;
    if(this.canvas.id==='game-canvas' && parcel && image instanceof HTMLImageElement && image.src===parcel.src &&
      args.length===8 && args[0]===parcel.x && args[1]===parcel.y && args[7]===48)window.flyingParcelX.push(this.getTransform().e/this.canvas.width);
    return original.call(this,image,...args);
  };
});

try{
  await page.clock.install({time:new Date('2026-02-01T20:00:00Z')});
  await page.clock.pauseAt(new Date('2026-02-01T20:00:01Z'));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const {loadAssets}=await import('/src/render/assets.ts');
    const {image,x,y}=(await loadAssets()).sprites.rigBagSide;
    window.expressParcelSprite={src:image.src,x,y};
  });
  const button=name=>page.getByRole('button',{name,exact:true}).click({force:true});
  await button('配送试验场');
  for(const [kind,label,delay,tiles] of [
    ['icebox','保冷箱冰浪',426,[0,4]],['steamer','蒸笼开席',532,[1,5]],
    ['express','加急三连送',7024,[2]],['berry','杨梅汽水炸屏',432,[3,6,7]],
  ]){
    // Place the same material targets every run, then activate through the real laboratory control.
    const starting=await page.evaluate(kind=>{
      const g=window.__gameTest.game(),s=g.state;
      g.clearArena();s.weapon.readyAt=Infinity;
      Object.assign(s.player,{x:kind==='express'?240:640,y:kind==='express'?295:370,
        px:kind==='express'?240:640,py:kind==='express'?295:370,vx:0,vy:0,moveDirection:{x:1,y:0},facing:1});
      // Keep the stationary observer alive while all twelve legs pass the target group.
      if(kind==='express')s.player.invulnerableUntil=s.time+17;
      const positions=[[212,235],[282,420],[190,550],[358,310],[415,520],[515,270],[579,455],
        [711,375],[760,224],[790,515],[868,328],[930,590],[988,450],[1117,260],[1115,545]];
      for(const [i,[x,y]] of positions.entries()){
        const e=g.spawnEnemy(['bun','box','bowl'][i%3],{x,y});
        e.shotReadyAt=s.time+6;e.phaseUntil=s.time+6;
      }
      window.renderedUltimateTiles.clear();
      window.flyingParcelX=[];
      return {kills:s.kills,health:s.enemies.reduce((sum,e)=>sum+e.hp,0),rider:{x:s.player.x,y:s.player.y}};
    },kind);
    await page.getByLabel('试验技能',{exact:true}).selectOption(kind);
    await button('触发并体验');
    await page.clock.runFor(delay);
    const data=await page.evaluate(kind=>{
      const s=window.__gameTest.snapshot(),cast=s.ultimates?.find(c=>c.kind===kind);
      return {active:!!cast,time:s.time,kills:s.kills,health:s.enemies.reduce((sum,e)=>sum+e.hp,0),
        stamps:[...window.renderedUltimateTiles],landings:cast?.landings?.length,parcelX:window.flyingParcelX,rider:{x:s.player.x,y:s.player.y},
        image:document.querySelector('#game-canvas').toDataURL('image/webp',.94)};
    },kind);
    assert.ok(data.active,kind+' is active in this frame');
    assert.ok(tiles.every(tile=>data.stamps.includes(tile)),kind+' drew its clay textures');
    assert.ok(data.health<starting.health,kind+' caused real HP damage');
    if(kind==='express'){
      assert.equal(data.landings,6,'the second order is still crossing the street seven seconds in');
      assert.ok(Math.min(...data.parcelX)<.25&&Math.max(...data.parcelX)>.75,'the visible parcel crosses the street');
      assert.deepEqual(data.rider,starting.rider,'an idle rider remains at the chosen spot');
      assert.match(await page.locator('[data-status="express"]').textContent(),/急送第 2 单/);
      await page.clock.runFor(7350);
      assert.match(await page.locator('[data-status="express"]').textContent(),/急送第 3 单/);
      await page.clock.runFor(840);
      const landed=await page.evaluate(()=>window.__gameTest.snapshot().ultimates.find(c=>c.kind==='express').landings.length);
      assert.equal(landed,13,'the twelfth leg delivered the final seal at fifteen seconds');
      await page.clock.runFor(700);
      assert.equal(await page.evaluate(()=>window.__gameTest.snapshot().ultimates.some(c=>c.kind==='express')),false);
    }
    reports.push({kind,kills:data.kills-starting.kills,hpRemoved:starting.health-data.health,tiles:data.stamps});
    captures.push({label,image:data.image});
    await page.clock.runFor(3456);
    await button('试验工具');
  }
  const sheet=await page.evaluate(async panels=>{
    const w=720,h=405,caption=31,gap=6;
    const canvas=document.createElement('canvas');canvas.width=w*2+gap;canvas.height=(h+caption)*2+gap;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#292730';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const [i,panel] of panels.entries()){
      const x=(i%2)*(w+gap),y=Math.floor(i/2)*(h+caption+gap);
      const img=new Image();img.src=panel.image;await img.decode();
      ctx.drawImage(img,x,y+caption,w,h);
      ctx.fillStyle='#ffdda7';ctx.font='bold 18px Microsoft YaHei,sans-serif';
      ctx.fillText(panel.label,x+11,y+22);
    }
    return canvas.toDataURL('image/webp',.94).split(',')[1];
  },captures);
  assert.deepEqual(errors,[]);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,Buffer.from(sheet,'base64'));
  console.log(JSON.stringify({reports,output},null,2));
}finally{await browser.close();}
