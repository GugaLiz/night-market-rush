import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const output=process.env.PICKUP_CAPTURE||fileURLToPath(new URL('../docs/verification/clay/drifting-pickups.webp',import.meta.url));
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const panels=[];
const button=(page,name)=>page.getByRole('button',{name,exact:true}).click({force:true});

async function practice(mobile){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},
    deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  const start=new Date('2026-02-01T20:00:00Z');
  await page.clock.install({time:start});await page.clock.pauseAt(new Date(+start+1000));
  await page.goto(base,{waitUntil:'networkidle'});
  if(mobile){
    await button(page,'操作设置');
    await page.getByRole('tab',{name:'画面'}).click({force:true});
    await page.getByRole('switch',{name:'减少动态'}).click({force:true});
    await button(page,'简化');await button(page,'应用');
  }
  await button(page,'配送试验场');
  const edge=await page.evaluate(async()=>{
    const [{loadAssets},{WORLD,CONFIG}]=await Promise.all([import('/src/render/assets.ts'),import('/src/core/config.ts')]);
    const {sprites}=await loadAssets();
    const canvas=document.querySelector('#game-canvas'),ctx=canvas.getContext('2d');
    const keys=new Map(['fan','spirit','weaponCrate'].map(k=>{
      const s=sprites[k];return [[s.image.src,s.x,s.y].join('/'),k];
    }));
    const clear=ctx.clearRect.bind(ctx),draw=ctx.drawImage.bind(ctx);
    ctx.clearRect=(...args)=>{window.paint={};return clear(...args);};
    ctx.drawImage=(image,...args)=>{
      if(image instanceof HTMLImageElement && args.length===8){
        const kind=keys.get([image.src,args[0],args[1]].join('/'));
        if(kind&&ctx.globalAlpha>.1){
          const matrix=ctx.getTransform();
          window.paint[kind]={x:matrix.e*WORLD.width/canvas.width,y:matrix.f*WORLD.height/canvas.height};
        }
      }
      return draw(image,...args);
    };
    const g=window.__gameTest.game(),s=g.state;
    g.clearArena();s.weapon.readyAt=Infinity;
    Object.assign(s.player,{x:884,px:884,y:448,py:448,vx:0,vy:0});
    g.addPickup('fan',{x:1008,y:342},{vx:98,vy:27});
    s.weaponDrops.push({id:9900,kind:'spirit',x:1040,y:527,radius:CONFIG.weapons.dropRadius,
      bornAt:s.time,readyAt:s.time,expiresAt:s.time+30,returnDrop:false,leftPickupCircle:true});
    return WORLD.bounds.right-CONFIG.pickup.radius;
  });
  await button(page,'继续试验');
  const read=()=>page.evaluate(()=>{
    const s=window.__gameTest.game().state,p=s.pickups.find(p=>p.kind==='fan');
    return {t:s.time,item:p&&{x:p.x,y:p.y,vx:p.vx,vy:p.vy},weapon:s.weaponDrops.map(d=>[d.kind,d.x,d.y]),
      equipped:s.weapon.kind,fanFields:s.fields.filter(f=>f.kind==='fire').length,paint:window.paint};
  });
  const capture=async caption=>{
    if(mobile)return;
    const image=await page.evaluate(()=>{
      const c=document.querySelector('#game-canvas'),out=document.createElement('canvas');
      out.width=500;out.height=318;
      const sx=c.width/1280,sy=c.height/720;
      out.getContext('2d').drawImage(c,772*sx,243*sy,out.width*sx,out.height*sy,0,0,out.width,out.height);
      return out.toDataURL('image/webp',.97);
    });
    panels.push({caption,image});
  };
  const fixed=[['spirit',1040,527]];
  const checkFrame=s=>{
    assert.deepEqual(s.weapon,fixed);
    assert.equal(s.equipped,'tongs');
    assert.ok(s.paint.spirit&&s.paint.weaponCrate,'fixed station and its weapon are both visible');
    assert.ok(Math.abs(s.paint.weaponCrate.x-1040)<2);
    if(s.item){
      assert.ok(s.paint.fan,'flying skill visible on canvas');
      assert.ok(Math.abs(s.paint.fan.x-s.item.x)<12,'sprite stays with the moving pickup');
    }
  };
  await page.clock.runFor(96);
  const first=await read();checkFrame(first);
  assert.ok(first.item.vx>0);
  await capture('技能向右飘，武器留在原位');
  let state=first,furthest=first.item.x;
  for(let n=0;n<48&&state.item.vx>0;n++){
    await page.clock.runFor(64);state=await read();checkFrame(state);
    furthest=Math.max(furthest,state.item.x);
  }
  assert.ok(state.item.vx<0&&Math.abs(furthest-edge)<7,'right boundary reflected the skill');
  await capture('到达街边，技能折返');
  const reflected=state.item.x;
  await button(page,'试验工具');
  const paused=await read();await page.clock.runFor(480);
  assert.deepEqual((await read()).item,paused.item,'skill freezes while the lab menu is open');
  await button(page,'继续试验');
  await page.clock.runFor(960);
  state=await read();checkFrame(state);
  assert.ok(state.item.x<reflected-75&&state.item.y>first.item.y+42);
  await capture('技能沿新方向飞回街面');
  await page.keyboard.down('ArrowRight');
  for(let n=0;n<32&&state.item;n++){
    await page.clock.runFor(32);state=await read();checkFrame(state);
  }
  await page.keyboard.up('ArrowRight');
  assert.ok(!state.item&&state.fanFields>0,'crossing the skill released the fan');
  await page.clock.runFor(320);
  await capture('迎面接到风扇，热风生效');

  // Walk onto the same stationary box and verify the standard weapon exchange.
  for(let n=0;n<32&&state.equipped!=='spirit';n++){
    const target=await page.evaluate(()=>{
      const p=window.__gameTest.game().state.player;return {dx:1040-p.x,dy:527-p.y};
    });
    const key=Math.abs(target.dy)>Math.abs(target.dx)?(target.dy>0?'ArrowDown':'ArrowUp'):(target.dx>0?'ArrowRight':'ArrowLeft');
    await page.keyboard.down(key);await page.clock.runFor(32);await page.keyboard.up(key);
    state=await read();
  }
  assert.equal(state.equipped,'spirit');
  assert.deepEqual(state.weapon.map(w=>w[0]),['tongs']);
  const returnCrate=state.weapon;
  await page.clock.runFor(320);assert.deepEqual((await read()).weapon,returnCrate,'return crate moved');
  assert.deepEqual(errors,[]);
  await page.close();
  return {mobile,first:first.item.x,rightmost:furthest,reflected,weapon:fixed,returnCrate};
}

try{
  const desktop=await practice(false),mobile=await practice(true);
  const page=await browser.newPage();
  const sheet=await page.evaluate(async panels=>{
    const out=document.createElement('canvas'),w=500,h=318,label=34,gap=5;
    out.width=w*2+gap;out.height=(h+label)*2+gap;
    const ctx=out.getContext('2d');
    ctx.fillStyle='#302b2c';ctx.fillRect(0,0,out.width,out.height);
    for(const [i,{caption,image}] of panels.entries()){
      const x=i%2*(w+gap),y=Math.floor(i/2)*(h+label+gap),im=new Image();im.src=image;await im.decode();
      ctx.drawImage(im,x,y+label);ctx.fillStyle='#ffe7b6';ctx.font='bold 16px "Microsoft YaHei",sans-serif';
      ctx.fillText(caption,x+12,y+23);
    }
    return out.toDataURL('image/webp',.94).split(',')[1];
  },panels);
  await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(sheet,'base64'));
  console.log(JSON.stringify({desktop,mobile,output},null,2));
}finally{await browser.close();}
