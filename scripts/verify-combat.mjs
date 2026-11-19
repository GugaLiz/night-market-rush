import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {recordNormalRun, round, position} from './gameplay-recording.mjs';

// Approach actual enemies on alternate sides of the market. Leave gear on the floor.
function aimPastDrops(state, goal, lookahead) {
  const p=state.player;
  const desired=Math.atan2(goal.y-p.y,goal.x-p.x);
  const drops=[...state.pickups,...state.weaponDrops];
  let best=-Infinity, direction;
  for(const turn of [0,.3,-.3,.6,-.6,.95,-.95,1.3,-1.3,1.7,-1.7,Math.PI]){
    const x=Math.cos(desired+turn), y=Math.sin(desired+turn);
    let score=Math.cos(turn);
    for(const drop of drops){
      const dx=drop.x-p.x,dy=drop.y-p.y;
      const along=Math.max(0,Math.min(lookahead,dx*x+dy*y));
      const clearance=Math.hypot(dx-x*along,dy-y*along);
      score-=Math.max(0,(60-clearance)/12);
    }
    if(score>best){best=score;direction={x,y};}
  }
  return direction;
}

const {bytes, evidence, result} = await recordNormalRun(async ({page, snapshot, touch, origin, tap})=>{
  const route=[], attacks=new Map(), seenSkills=new Set();
  let fan, dashAt, final, releasedAt, minimumFanDistance=Infinity, targetId;
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    const s=await snapshot(), p=s.player;
    assert.equal(await page.locator('#game-shell').getAttribute('data-view'),'play');
    assert.equal(s.weapon.kind,'tongs');
    assert.equal(s.fields.length+s.zones.length,0);
    // Every skill that appeared stays visible in this short run. Kills are from the default weapon.
    const current=new Set(s.pickups.map(item=>item.id));
    for(const id of seenSkills)assert.ok(current.has(id),'A skill was collected on the ordinary attack route.');
    for(const id of current)seenSkills.add(id);
    const attack=s.weapon.attack;
    if(attack && attack.phase!=='windup' && !attacks.has(attack.id))
      attacks.set(attack.id,{id:attack.id,releasedAt:round(attack.releaseAt),angle:round(attack.angle),hits:[]});
    for(const wave of s.meleeWaves){
      const sample=attacks.get(wave.id);
      if(sample && wave.hitIds.length>sample.hits.length)sample.hits=[...wave.hitIds];
    }
    fan??=s.pickups.find(item=>item.kind==='fan');
    if(fan){
      minimumFanDistance=Math.min(minimumFanDistance,Math.hypot(fan.x-p.x,fan.y-p.y));
      if(s.time>=9.35){final=s;break;}
      if(s.time>=8.7){
        if(!releasedAt){await touch('touchMove',[origin]);releasedAt=s.time;}
        await page.waitForTimeout(39);
        continue;
      }
      const stage=s.time<2.1?0:s.time<4.9?1:s.time<7.2?2:3;
      const side=stage%2===0?1:-1;
      const targets=s.enemies.filter(e=>(e.x-p.x)*side>32 && Math.abs(e.y-p.y)<Math.abs(e.x-p.x)*1.5);
      let goal=targets.find(e=>e.id===targetId);
      if(!goal){
        goal=targets.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        targetId=goal?.id;
      }
      goal??={x:side>0?1140:140,y:370};
      if(route.at(-1)?.stage!==stage)route.push({stage,t:round(s.time),from:position(p),aim:position(goal),kills:s.kills});
      const wantsDash=stage===1&&!dashAt&&s.time>=2.3;
      const direction=aimPastDrops(s,goal,wantsDash?170:94);
      const stick={x:origin.x+direction.x*25,y:origin.y+direction.y*25,id:1};
      await touch('touchMove',[stick]);
      if(wantsDash){
        await touch('touchStart',[stick,tap]);await touch('touchEnd',[tap]);
        const d=await snapshot();
        assert.ok(d.player.dashReadyAt>d.time);
        assert.ok(await page.locator('#joystick').evaluate(el=>el.classList.contains('is-active')));
        dashAt=d.time;
      }
    }
    await page.waitForTimeout(39);
  }
  assert.ok(final&&dashAt&&releasedAt&&minimumFanDistance>24&&route.length===4);
  const swings=[...attacks.values()].filter(a=>a.hits.length);
  const hits=new Set(swings.flatMap(a=>a.hits));
  assert.ok(final.kills>0 && hits.size>=2,'Ordinary swings must defeat enemies at distinct map positions.');
  assert.ok(swings.some(a=>Math.cos(a.angle)>.35)&&swings.some(a=>Math.cos(a.angle)<-.35),'Need confirmed hits in both horizontal directions.');
  return {
    method:'从首页一次进入普通第一波，全程用横屏双指控制正常摇杆和冲刺。按可见场上物件绕过技能与武器包，跟踪默认取餐夹的攻击 ID、命中 ID 和局内真实击败数。读取开发快照引导路线，没有修改游戏状态。',
    limits:'桌面 Chrome 模拟双指输入。命中列表按采样时刻读取，可能少计短暂出招。未测实体手机输入延迟。',
    seed:final.seed, practice:final.practice, weapon:final.weapon.kind, fan:position(fan),
    closestFanDistance:round(minimumFanDistance), visibleSkillsAtEnd:seenSkills.size,
    dashAt:round(dashAt), stickCenteredAt:releasedAt?round(releasedAt):null, sampledSwings:swings, distinctSampledHits:hits.size, route,
    final:{t:round(final.time),kills:final.kills,coins:final.collectedCoins,hp:final.player.hp},
  };
});
const output=process.env.V4_COMBAT_OUTPUT || fileURLToPath(new URL('../test-results/recordings/combat/',import.meta.url));
const report={...evidence,...result};
await mkdir(output,{recursive:true});
await Promise.all([writeFile(join(output,'ordinary-attack.webm'),bytes),writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n')]);
console.log(JSON.stringify(report));
