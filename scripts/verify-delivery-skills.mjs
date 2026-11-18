import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'});
const viewport = {width:1280,height:720};
const errors = [], panels = [], report = [];
const button = (page,name) => page.getByRole('button',{name,exact:true}).click({force:true});
const snapshot = page => page.evaluate(() => window.__gameTest.snapshot());

async function practice(quiet=false) {
  const page = await browser.newPage({viewport,deviceScaleFactor:1});
  page.on('pageerror', e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'), socket=>socket.onMessage(()=>{}));
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:start}); await page.clock.pauseAt(new Date(+start+1000));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  if (quiet) {
    await button(page,'操作设置');
    await page.getByRole('tab',{name:'画面'}).click({force:true});
    await page.getByRole('switch',{name:'减少动态'}).click({force:true});
    await button(page,'应用');
  }
  await button(page,'配送试验场');
  await page.getByLabel('试验武器',{exact:true}).selectOption('lunchbox',{force:true});
  await button(page,'装备并体验');
  await page.clock.runFor(960);
  await button(page,'试验工具');
  // Observe the existing canvas calls. Each field's texture samples share its world centre.
  await page.evaluate(()=>{
    const ctx=document.querySelector('#game-canvas').getContext('2d');
    const clear=ctx.clearRect.bind(ctx),draw=ctx.drawImage.bind(ctx);
    ctx.clearRect=(...args)=>{window.paintedUse={fields:[],props:[]};return clear(...args);};
    ctx.drawImage=(img,...args)=>{
      if(img instanceof HTMLImageElement && args.length===8 && ctx.globalAlpha>.04){
        const name=img.src.split('/').at(-1),m=ctx.getTransform(),p=window.paintedUse;
        if(name==='delivery-skills.webp')p.fields.push({
          row:Math.round(args[1]*2/img.naturalHeight),col:Math.round(args[0]*2/img.naturalWidth),
          x:Math.round(m.e),y:Math.round(m.f),angle:+Math.atan2(m.b,m.a).toFixed(4)
        });
        if(name==='skills-v2.png' && args[1]<img.naturalHeight/4){
          const col=Math.floor(args[0]*4/img.naturalWidth);
          if(col===0 || col===2)p.props.push({kind:col===0?'fan':'soda',x:+m.e.toFixed(1),y:+m.f.toFixed(1)});
        }
      }
      return draw(img,...args);
    };
  });
  return page;
}
async function activate(page,kind) {
  await page.getByLabel('试验技能',{exact:true}).selectOption(kind,{force:true});
  await button(page,'触发并体验');
}
const reading = page => page.evaluate(()=>window.paintedUse);
const box = (x,y,width,height)=>({x,y,width,height});

async function recordUse(kind) {
  const page=await practice();
  try{
    await activate(page,kind);
    const initial=await snapshot(page),field=initial.fields[0];
    const fire=kind==='fan';
    assert.equal(initial.fields.length,fire?6:3);
    const expected=initial.fields.map(f=>[f.id,f.x,f.y]);
    const stages=fire ? [
      [96,box(479,209,336,210),'从配送箱取扇'],
      [432,box(381,173,672,420),'风扇落地，热气吹向侧翼'],
      [1728,box(178,55,928,580),'离开后，热餐与风扇留地']
    ] : [
      [96,box(479,209,336,210),'从配送箱取汽水'],
      [336,box(468,225,368,230),'倾瓶，汽水落地溅开'],
      [1728,box(310,145,672,420),'离开后，三个水洼留地']
    ];
    let elapsed=0;
    for(const [i,[at,clip,caption]] of stages.entries()){
      if(i===2){
        await page.keyboard.down('ArrowLeft');
        await page.clock.runFor(880);elapsed+=880;
        await page.keyboard.up('ArrowLeft');
      }
      await page.clock.runFor(at-elapsed);elapsed=at;
      const s=await snapshot(page),drawn=await reading(page);
      assert.deepEqual(s.fields.map(f=>[f.id,f.x,f.y]),expected);
      assert.ok(drawn.fields.every(f=>f.row===Number(!fire)));
      if(i>0)assert.ok(drawn.fields.length,kind+' never reached the floor');
      const prop=drawn.props.find(p=>p.kind===kind);
      if(i<2)assert.ok(prop,kind+' missing from the canvas');
      if(!i)assert.ok(Math.hypot(prop.x-field.x,prop.y-field.y)<95 && prop.y<field.y-32,'tool must start at the worn pack');
      if(i===1 && !fire)assert.ok(prop.y<s.player.y-35,'the pouring bottle dropped to the floor');
      if(i===1 && fire)assert.ok(Math.abs(prop.y-field.y)<16,'placed fan must sit next to the meal');
      if(i===2){
        assert.ok(Math.hypot(s.player.x-field.x,s.player.y-field.y)>175);
        assert.equal(new Set(drawn.fields.map(f=>f.x+','+f.y)).size,expected.length);
        assert.equal(Boolean(prop),fire);
      }
      const shot=await page.screenshot({clip,scale:'css'});
      const age=+(s.time-field.bornAt).toFixed(2);
      panels.push({shot:shot.toString('base64'),caption:caption+'   '+age.toFixed(2)+' s'});
      report.push({skill:kind,age,activeFields:s.fields.filter(f=>f.bornAt<=s.time).length,
        prop,displacement:Math.round(Math.hypot(s.player.x-field.x,s.player.y-field.y))});
    }
    await page.keyboard.up('ArrowLeft');
    await page.clock.runFor(1650);
    assert.equal((await snapshot(page)).fields.length,0);
    assert.equal((await reading(page)).fields.length,0);
  } finally {await page.close();}
}

async function checkCrowdAndPause() {
  const page=await practice(true);
  try{
    await page.getByLabel('敌人类型',{exact:true}).selectOption('bowl',{force:true});
    for(let i=0;i<8;i++){await button(page,'生成敌群');await button(page,'试验工具');}
    const crowd=(await snapshot(page)).enemies.length;
    assert.ok(crowd>=40);
    await activate(page,'fan');await page.clock.runFor(576);
    const s=await snapshot(page);
    assert.ok(s.enemies.some(e=>e.hp<e.maxHp)||s.kills>0);
    const painted=await reading(page);
    assert.equal(new Set(painted.fields.map(f=>f.x+','+f.y)).size,6);
    assert.ok(painted.fields.every(f=>f.row===0));
    const hub=s.fields.find(f=>f.id===f.castId);
    const angles=draws=>draws.fields.filter(f=>f.x===hub.x&&f.y===hub.y).map(f=>f.angle);
    assert.ok(angles(painted).length>1);
    await page.clock.runFor(336);
    assert.deepEqual(angles(await reading(page)),angles(painted),'reduced-motion steam rotated around its source');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#game-shell').getAttribute('data-view'),'pause');
    await page.clock.runFor(48);
    const paused=await snapshot(page),still=await reading(page);
    await page.clock.runFor(900);
    assert.equal((await snapshot(page)).time,paused.time);
    assert.deepEqual(await reading(page),still);
    return {crowd,visibleSteamPockets:6,simulationTimeDuringPause:paused.time};
  } finally {await page.close();}
}

try {
  await recordUse('fan'); await recordUse('soda');
  const crowd=await checkCrowdAndPause();
  const page=await browser.newPage();
  const bytes=await page.evaluate(async panels=>{
    const w=410,h=256,gap=6,caption=34,out=document.createElement('canvas');
    out.width=w*3+gap*2;out.height=(h+caption)*2+gap;
    const c=out.getContext('2d');c.fillStyle='#2f2b35';c.fillRect(0,0,out.width,out.height);
    for(const [i,p] of panels.entries()){
      const img=new Image();img.src='data:image/png;base64,'+p.shot;await img.decode();
      const x=i%3*(w+gap),y=Math.floor(i/3)*(h+caption+gap);
      c.drawImage(img,x,y,w,h);c.fillStyle='#fff0d9';c.font='bold 16px "Microsoft YaHei",sans-serif';c.fillText(p.caption,x+11,y+h+23);
    }
    return out.toDataURL('image/webp',.96).split(',')[1];
  },panels);
  assert.deepEqual(errors,[]);
  const target=process.env.SKILL_IMAGE||fileURLToPath(new URL('../docs/verification/courier/skills.webp',import.meta.url));
  await mkdir(dirname(target),{recursive:true});await writeFile(target,Buffer.from(bytes,'base64'));
  console.log(JSON.stringify({browser:browser.version(),report,crowd,errors},null,2));
} finally {await browser.close();}
