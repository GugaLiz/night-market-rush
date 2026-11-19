import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL || 'http://127.0.0.1:5173';
const output=process.env.ENEMY_BEHAVIOR_IMAGE || fileURLToPath(new URL('../docs/verification/enemies/behavior.webp',import.meta.url));
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[],panels=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));
await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
const snapshot=()=>page.evaluate(()=>window.__gameTest.snapshot());
const capture=()=>page.locator('#game-canvas').evaluate(c=>c.toDataURL('image/webp',.95));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const round=n=>Math.round(n*10)/10;
const cell=p=>2*Number(p.y>=405)+Number(p.x>=640);
const interior=p=>p.x>=355 && p.x<=925 && p.y>=290 && p.y<=520;

async function waitForState(predicate,timeout=9){
  const limit=(await snapshot()).time+timeout;
  for(let i=0;i<Math.ceil(timeout/.032)+50;i++){
    await page.clock.runFor(32);
    const state=await snapshot();
    if(predicate(state))return state;
    if(state.time>limit)break;
  }
  throw Error('Timed out waiting for '+predicate);
}

async function lab(kind,playerX,enemyX){
  await page.evaluate(({kind,playerX,enemyX})=>{
    const game=window.__gameTest.game();
    game.reset(8235,true);
    const s=game.state;
    Object.assign(s.player,{x:playerX,px:playerX,y:395,py:395});
    s.weapon.readyAt=Infinity;
    game.spawnEnemy(kind,{x:enemyX,y:395});
  },{kind,playerX,enemyX});
}

try{
  const clock=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:clock});await page.clock.pauseAt(new Date(+clock+1000));
  for(let run=0;run<3;run++){
    await page.clock.setSystemTime(new Date(+clock+run*100003));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
    const first=await waitForState(s=>s.enemies.length>0);
    assert.equal(first.practice,false);
    assert.ok(first.enemies.every(e=>first.time-e.spawnAt<.6));
    const seed=first.seed,initialIds=new Set(first.enemies.map(e=>e.id)),later=new Map();
    const quadrants=[0,0,0,0],laterQuadrants=[0,0,0,0];
    let minPlayerGap=Infinity,minEnemyGap=Infinity;
    for(const [i,e] of first.enemies.entries()){
      quadrants[cell(e)]++;
      minPlayerGap=Math.min(minPlayerGap,dist(e,first.player)-e.radius-first.player.radius);
      for(const other of first.enemies.slice(i+1))minEnemyGap=Math.min(minEnemyGap,dist(e,other)-e.radius-other.radius);
    }
    const openingInterior=first.enemies.filter(interior).length;
    assert.ok(quadrants.every(n=>n>0) && openingInterior>0 && minPlayerGap>=118.8-1e-6 && minEnemyGap>=43-1e-6);
    if(run===0)panels.push({label:'普通第一波 · 出生预警',image:await capture()});
    for(let i=0;i<62;i++){
      await page.clock.runFor(112);
      const s=await snapshot();
      for(const e of s.enemies)if(!initialIds.has(e.id) && !later.has(e.id)){
        assert.ok(s.time-e.spawnAt<.6,'Observed each reinforcement while its warning was active');
        later.set(e.id,e);laterQuadrants[cell(e)]++;
      }
      if(run===0 && i===15)panels.push({label:'同一局 · 全场游荡',image:await capture()});
    }
    assert.ok(later.size>0);
    runs.push({seed,opening:first.enemies.length,quadrants,openingInterior,minPlayerGap:round(minPlayerGap),minEnemyGap:round(minEnemyGap),
      reinforcements:later.size,laterQuadrants,laterInterior:[...later.values()].filter(interior).length});
  }
  assert.equal(new Set(runs.map(r=>r.seed)).size,3);
  assert.ok([0,1,2,3].every(i=>runs.some(r=>r.laterQuadrants[i]>0)));
  assert.ok(runs.some(r=>r.laterInterior>0),'Reinforcements reached the interior of the market');

  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
  await page.getByRole('button',{name:'装备并体验'}).click({force:true});
  const config=await page.evaluate(async()=> (await import('/src/core/config.ts')).CONFIG);
  // Identical RNG and enemy, courier on opposite sides. An unaware wander must have identical coordinates.
  const paths=[];
  for(const playerX of [255,1045]){
    // Advance an independent copy in exact simulation steps so frame interpolation cannot skew the comparison.
    const samples=await page.evaluate(async playerX=>{
      const {Game}=await import('/src/core/game.ts'),g=new Game(8235);g.reset(8235,true);
      Object.assign(g.state.player,{x:playerX,px:playerX,y:395,py:395});g.state.weapon.readyAt=Infinity;
      const e=g.spawnEnemy('bun',{x:650,y:395}),points=[];
      for(let i=0;i<150;i++){g.update(1/60,{x:0,y:0});points.push([e.x,e.y,e.alerted]);}
      return points;
    },playerX);
    assert.ok(samples.every(([, ,alerted])=>alerted===false));
    paths.push(samples);
  }
  assert.deepEqual(paths[0],paths[1]);
  const wanderDistance=dist({x:paths[0][0][0],y:paths[0][0][1]},{x:paths[0].at(-1)[0],y:paths[0].at(-1)[1]});
  assert.ok(wanderDistance>10);

  // Only the initial placements are controlled. Actual keys move the courier across both thresholds.
  await lab('bun',255,650);
  await page.clock.runFor(448);
  assert.equal((await snapshot()).enemies[0].alerted,false);
  await page.keyboard.down('ArrowRight');
  const noticed=await waitForState(s=>s.enemies[0].alerted);
  await page.keyboard.up('ArrowRight');
  await page.clock.runFor(320);
  const chase=await snapshot(),noticeDistance=dist(noticed.player,noticed.enemies[0]);
  assert.ok(noticeDistance<=config.awareness.bun.notice && noticeDistance>config.awareness.bun.notice-18);
  assert.ok(dist(chase.player,chase.enemies[0])<noticeDistance-7);
  await page.keyboard.down('ArrowLeft');
  const lost=await waitForState(s=>!s.enemies[0].alerted);
  await page.keyboard.up('ArrowLeft');
  const releaseDistance=dist(lost.player,lost.enemies[0]);
  assert.ok(releaseDistance>config.awareness.bun.release && releaseDistance<config.awareness.bun.release+18);
  await page.clock.runFor(480);
  const wandering=await snapshot();
  assert.equal(wandering.enemies[0].alerted,false);assert.ok(dist(wandering.enemies[0],lost.enemies[0])>3);

  let aimDistance,warningSeconds,flightDistance,hpAfter;
  const newTargetAtLimit=await page.evaluate(async range=>{
    const {Game}=await import('/src/core/game.ts');
    return [range-1,range+1].map(distance=>{
      const g=new Game(8235);g.reset(8235,true);
      Object.assign(g.state.player,{x:140+distance,px:140+distance,y:395,py:395});g.state.weapon.readyAt=Infinity;
      const e=g.spawnEnemy('bowl',{x:140,y:395});e.shotReadyAt=0;g.update(1/60,{x:0,y:0});
      return {distance,warned:e.shotWarnUntil>g.state.time};
    });
  },config.ranged.range);
  assert.deepEqual(newTargetAtLimit.map(v=>v.warned),[true,false]);
  for(const dodge of [false,true]){
    await lab('bowl',940,140);
    const warning=await waitForState(s=>s.enemies[0].shotWarnUntil>s.time);
    const shooter=warning.enemies[0];
    aimDistance=dist(warning.player,shooter);
    assert.ok(aimDistance>config.awareness.box.release && aimDistance<=config.ranged.range);
    if(!dodge)panels.push({label:'试验场 · 碗怪锁定 '+Math.round(aimDistance)+' 单位外的骑手',image:await capture()});
    const fired=await waitForState(s=>s.enemyShots.length>0);
    const shot=fired.enemyShots[0];
    warningSeconds=shot.bornAt-(shooter.shotWarnUntil-config.ranged.warning);
    assert.ok(Math.abs(warningSeconds-config.ranged.warning)<=config.step+.001);
    if(!dodge){
      const hit=await waitForState(s=>s.player.hp<s.player.maxHp);
      assert.equal(hit.lastDamage,'bowl');hpAfter=hit.player.hp;
      assert.equal(hpAfter,hit.player.maxHp-config.ranged.damage);
    }else{
      await page.keyboard.down('ArrowDown');await page.clock.runFor(312);await page.keyboard.up('ArrowDown');
      let last=shot;
      await waitForState(s=>s.enemyShots.some(q=>q.id===shot.id && dist(q,shooter)>640));
      panels.push({label:'同一射线 · 骑手横移后汤弹继续直飞',image:await capture()});
      const expired=await waitForState(s=>{
        const q=s.enemyShots.find(q=>q.id===shot.id);if(q)last=q;return !q;
      });
      assert.equal(expired.player.hp,expired.player.maxHp);
      flightDistance=dist(last,shooter);
      assert.ok(Math.abs(flightDistance-config.ranged.lifetime*config.ranged.speed)<8);
    }
  }

  assert.deepEqual(errors,[]);
  const data=await page.evaluate(async parts=>{
    const c=document.createElement('canvas'),w=720,h=405,gap=6,label=34;
    c.width=w*2+gap;c.height=(h+label)*2+gap;
    const g=c.getContext('2d');g.fillStyle='#2c2830';g.fillRect(0,0,c.width,c.height);
    for(const [i,p] of parts.entries()){
      const x=i%2*(w+gap),y=Math.floor(i/2)*(h+label+gap),img=new Image();img.src=p.image;await img.decode();
      g.drawImage(img,x,y+label,w,h);g.fillStyle='#ffe9cb';g.font='600 18px "Microsoft YaHei",sans-serif';g.fillText(p.label,x+11,y+24);
    }
    return c.toDataURL('image/webp',.94).split(',')[1];
  },panels);
  await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(data,'base64'));
  console.log(JSON.stringify({runs,wanderDistance:round(wanderDistance),noticeDistance:round(noticeDistance),releaseDistance:round(releaseDistance),
    newTargetAtLimit,aimDistance:round(aimDistance),warningSeconds:round(warningSeconds),flightDistance:round(flightDistance),hpAfter,errors}));
}finally{await browser.close();}
