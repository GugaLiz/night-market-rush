import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {recordNormalRun, round, position} from './gameplay-recording.mjs';

// Follow the two formations that are already in the normal opening. Leave all gear on the floor.
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

const {bytes, evidence, result} = await recordNormalRun(async ({page, snapshot, touch, origin, tap, startState})=>{
  const start=startState.player, route=[], attacks=new Map(), seenSkills=new Set();
  let fan, waypoints, dashAt, final, releasedAt, minimumFanDistance=Infinity, stage=0;
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
    if(attack?.hitIds.length)attacks.set(attack.id,{id:attack.id,releasedAt:round(attack.releaseAt),angle:round(attack.angle),hits:[...attack.hitIds]});
    fan??=s.pickups.find(item=>item.kind==='fan');
    if(fan){
      minimumFanDistance=Math.min(minimumFanDistance,Math.hypot(fan.x-p.x,fan.y-p.y));
      if(!waypoints){
        const side=Math.sign(fan.x-start.x), vertical=Math.sign(fan.y-start.y);
        waypoints=[
          {x:fan.x+side*105,y:fan.y-vertical*111},
          {x:start.x-side*352,y:start.y-vertical*75},
          {x:start.x-side*304,y:start.y+vertical*147},
          {x:start.x+side*224,y:start.y+vertical*13},
          {x:start.x-side*126,y:start.y-vertical*109},
        ];
      }
      if(s.time>=9.35){final=s;break;}
      if(stage<waypoints.length-1&&(Math.hypot(p.x-waypoints[stage].x,p.y-waypoints[stage].y)<40||s.time>[2.05,4.65,5.95,7.95][stage]))stage++;
      const goal=waypoints[stage];
      if(route.at(-1)?.stage!==stage)route.push({stage,t:round(s.time),from:position(p),aim:position(goal),kills:s.kills});
      if(stage===waypoints.length-1&&(releasedAt||Math.hypot(p.x-goal.x,p.y-goal.y)<32)){
        if(!releasedAt){await touch('touchMove',[origin]);releasedAt=s.time;}
        await page.waitForTimeout(39);
        continue;
      }
      const wantsDash=stage===1&&!dashAt&&s.time>=2.2;
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
  assert.ok(final&&dashAt&&minimumFanDistance>24&&route.length===5);
  const swings=[...attacks.values()];
  const hits=new Set(swings.flatMap(a=>a.hits));
  assert.ok(final.kills>=6&&hits.size>=6,'Ordinary attacks must hit and defeat a group.');
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
const output=process.env.V4_COMBAT_OUTPUT || fileURLToPath(new URL('../docs/verification/impact/',import.meta.url));
const report={...evidence,...result};
await mkdir(output,{recursive:true});
await Promise.all([writeFile(join(output,'ordinary-attack.webm'),bytes),writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n')]);
console.log(JSON.stringify(report));
