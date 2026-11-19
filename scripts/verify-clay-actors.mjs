import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
  for(let i=0;i<120 && await page.locator('#game-shell').getAttribute('data-view')!=='play';i++)await page.clock.runFor(32);
  assert.equal(await page.locator('#game-shell').getAttribute('data-view'),'play');
  // Capture the actual public canvas frame; test-only placement isolates simultaneous sprite states.
  await page.evaluate(async()=>{
    const {loadAssets}=await import('/src/render/assets.ts'),assets=await loadAssets();
    const aliases=new Map();
    for(const [name,sprite] of Object.entries(assets.sprites)){
      if(name==='giantBun'||name==='courierB')continue;
      aliases.set([sprite.image.src,sprite.x,sprite.y].join('|'),name);
    }
    const canvas=document.querySelector('#game-canvas'),c=canvas.getContext('2d');
    const draw=c.drawImage.bind(c),clear=c.clearRect.bind(c);window.clayDrawn=[];window.clayPlates=[];
    c.clearRect=(...args)=>{window.clayDrawn=[];window.clayPlates=[];return clear(...args);};
    c.drawImage=(img,...args)=>{
      if(img instanceof HTMLImageElement && args.length===4 && (img.src===assets.background.src||img.src===assets.riverside.src)){
        window.clayDrawn.push(new URL(img.src).pathname.split('/').at(-1));
      }
      if(img instanceof HTMLImageElement && args.length===8){
        const key=aliases.get([img.src,args[0],args[1]].join('|'));
        if(key)window.clayDrawn.push(key);
        if(key==='tray'){
          const center=new DOMPoint(args[4]+args[6]/2,args[5]+args[7]/2).matrixTransform(c.getTransform());
          window.clayPlates.push({x:center.x,y:center.y});
        }
      }
      return draw(img,...args);
    };
    const game=window.__gameTest.game();game.reset(777,true);
    const s=game.state;s.weapon.readyAt=9999;
    for(const [kind,x,y] of [['bun',450,385],['bun',525,385],['bun',600,385],['box',805,385],['bowl',875,385]]){
      const e=game.spawnEnemy(kind,{x,y});e.march={x:0,y:0,until:20};e.phaseUntil=e.shotReadyAt=9999;
      if(x===525){e.hurtAt=0;e.hp=10;}if(x===600){e.hp=10;}
    }
    s.player.x=700;s.player.px=700;s.player.y=385;s.player.py=385;
  });
  await page.clock.runFor(80);
  const first=await page.evaluate(()=>window.clayDrawn);
  for(const key of ['clay-night-market.webp','rigHeadFront','rigTorsoFront','rigHipFront','rigBagSide','bunHurt','bunLow'])assert.ok(first.includes(key),'Missing actual paint '+key+' in '+first.join(','));
  assert.equal(first.filter(name=>name.startsWith('rigShoe')).length,2,'Count the pair irrespective of shared atlas frames');
  for(const kind of ['bun','box','bowl'])assert.ok([kind,kind+'Grin',kind+'Curious'].some(name=>first.includes(name)),'Missing '+kind);
  await mkdir('test-results/clay-art',{recursive:true});
  await page.screenshot({clip:{x:408,y:224,width:535,height:225},path:'test-results/clay-art/poses.png'});
  await page.screenshot({path:'test-results/clay-art/night-market.png'});
  await page.evaluate(()=>{
    const game=window.__gameTest.game(),p=game.state.player;
    game.spawnEnemy('bun',{x:p.x+7,y:p.y});
  });
  await page.clock.runFor(65);
  assert.ok(await page.evaluate(()=>window.clayDrawn.includes('rigHeadHurt')));
  assert.equal(await page.evaluate(()=>window.__gameTest.snapshot().player.hp),92);
  await page.screenshot({clip:{x:615,y:223,width:180,height:205},path:'test-results/clay-art/courier-hit.png'});
  await page.keyboard.down('KeyW');await page.clock.runFor(165);
  assert.ok(await page.evaluate(()=>window.clayDrawn.includes('rigHeadBack')));
  await page.keyboard.up('KeyW');
  for(const kind of ['bag','tray']){
    await page.evaluate(kind=>window.__gameTest.game().setWeapon(kind),kind);
    await page.clock.runFor(32);
    assert.ok(await page.evaluate(kind=>window.clayDrawn.includes(kind),kind),'Held '+kind);
  }
  await page.evaluate(()=>{
    const g=window.__gameTest.game();g.reset(441,true);g.setWeapon('tray');g.state.weapon.readyAt=0;
  });
  let flying=[],catchGap=Infinity,reloaded=false;
  for(let i=0;i<180;i++){
    if(i===122)await page.keyboard.down('KeyD');
    await page.clock.runFor(16);
    const frame=await page.evaluate(()=>{
      const s=window.__gameTest.game().state,q=s.projectiles;
      // A second natural windup overlaps the first volley. Suppress a third launch to inspect the final catch.
      if(q.some(p=>p.attackId!==q[0]?.attackId))s.weapon.readyAt=Infinity;
      return {count:q.length,windup:s.weapon.attack?.phase==='windup',centers:window.clayPlates,speed:Math.hypot(s.player.vx,s.player.vy)};
    });
    if(frame.count){
      if(frame.windup&&frame.centers.length===frame.count+1)reloaded=true;
      flying=frame.centers;
    }else if(flying.length && frame.centers.length===1){
      assert.ok(frame.speed>100,'Check the catch while the courier is moving');
      const caught=frame.centers[0];catchGap=Math.min(...flying.map(q=>Math.hypot(q.x-caught.x,q.y-caught.y)));break;
    }
  }
  await page.keyboard.up('KeyD');
  assert.ok(reloaded,'A fresh plate must appear in the hand before a second throw');
  assert.ok(catchGap<17,'Incoming plate must meet the held rim within one frame: '+catchGap);
  await page.evaluate(()=>window.__gameTest.game().setupWaveDemo());
  await page.clock.runFor(4000);
  assert.equal(await page.evaluate(()=>window.__gameTest.snapshot().wave),2);
  assert.ok(await page.evaluate(()=>window.clayDrawn.includes('clay-riverside-market.webp')));
  await page.screenshot({path:'test-results/clay-art/riverside-market.png'});
  assert.deepEqual(errors,[]);
  console.log('Verified both markets, hurt/low HP, moving courier, held weapons, overlapping plate reload and catch ('+catchGap.toFixed(1)+' px).');
} finally { await browser.close(); }
