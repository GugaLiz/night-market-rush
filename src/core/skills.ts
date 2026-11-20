import {isElite, type Enemy, type GameState, type Pickup, type SkillKind, type Vec, type Zone} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, pickupReach} from './config';
import {clamp, distanceSquared, segmentDistanceSquared, sweepContact} from './geometry';
import {igniteFan, spillSoda, updateSkillFields} from './skill-fields';
import {castUltimate,updateUltimates} from './ultimates';
import {interruptAttack,stunEnemy} from './enemies';
import {castElemental, shatterOnDash, updateElementalFields, updateElementalStatus} from './elemental-skills';

const bounds = WORLD.bounds;
const inside = (p:Vec,r=16):boolean => p.x>=bounds.left+r&&p.x<=bounds.right-r&&p.y>=bounds.top+r&&p.y<=bounds.bottom-r;
const legal = (p:Vec,r=16):Vec => ({x:clamp(p.x,bounds.left+r,bounds.right-r),y:clamp(p.y,bounds.top+r,bounds.bottom-r)});
const facing = (s:GameState):Vec => {
  const d=s.player.moveDirection, length=Math.hypot(d.x,d.y);
  return length>.01?{x:d.x/length,y:d.y/length}:{x:s.player.facing||1,y:0};
};
function zone(s:GameState,ctx:CombatContext,kind:Zone['kind'],p:Vec,duration:number,extra:Partial<Zone>={}):Zone {
  const z:Zone={id:ctx.id(),kind,...p,radius:0,bornAt:s.time,expiresAt:s.time+duration,angle:0,length:0,width:0,hp:1,...extra};
  s.zones.push(z);return z;
}
export function canCollectPickup(s:GameState,p:Pickup):boolean {
  if(p.retiringUntil||(p.readyAt??0)>s.time||(p.expiresAt??Infinity)<=s.time||(p.disabledUntil??0)>s.time)return false;
  if(p.kind==='health')return s.player.hp<s.player.maxHp;
  return p.kind!=='dispatch'||s.effects.dispatchCooldownUntil<=s.time;
}
function nearest(s:GameState,p:Vec,radius:number,ctx:CombatContext):Enemy[] {
  return s.enemies.filter(e=>ctx.active(e)&&distanceSquared(e,p)<=radius*radius)
    .sort((a,b)=>distanceSquared(a,p)-distanceSquared(b,p)||a.id-b.id);
}

export function restorePlayerHealth(s:GameState,amount:number,at:Vec,ctx:CombatContext):void {
  const restored=Math.min(amount,s.player.maxHp-s.player.hp);
  if(restored<=0)return;
  s.player.hp+=restored;
  ctx.emit({type:'heal',id:ctx.id(),amount:restored,x:at.x,y:at.y});
}

export function isPlayerInvulnerable(s:GameState,dt:number):boolean {
  const p=s.player;
  return p.stampUntil>s.time || p.invulnerableUntil>s.time || (p.dashUntil??0)>s.time-dt+1e-9;
}

/** Skills are completely state-backed: resets and seeded replays do not retain module state. */
export function activateSkill(s:GameState,kind:SkillKind,origin:Vec,ctx:CombatContext,pickupFrom?:Vec):void {
  const now=s.time,p=s.player;
  if(kind==='dispatch'&&s.effects.dispatchCooldownUntil>now)return;
  ctx.emit({type:'skill',kind,...origin,time:now,facing:facing(s),...(pickupFrom && {pickupFrom:{x:pickupFrom.x,y:pickupFrom.y}})});
  switch(kind){
    case 'vortex':case 'poison':case 'frost':
      castElemental(s,kind,origin,facing(s),ctx);
      break;
    case 'health':restorePlayerHealth(s,CONFIG.skills.health.amount,origin,ctx);break;
    case 'icebox':case 'steamer':case 'express':case 'berry':
      castUltimate(s,kind,origin);
      break;
    case 'fan':
      igniteFan(s,origin,facing(s),ctx);
      break;
    case 'skate':p.skateUntil=now+CONFIG.skills.skate.duration;ring(s,ctx);break;
    case 'soda':
      for(const e of s.enemies)if(ctx.active(e)&&distanceSquared(e,origin)<=(CONFIG.skills.soda.radius+e.radius)**2)e.slowUntil=now+CONFIG.skills.soda.duration;
      spillSoda(s,origin,facing(s),ctx);
      break;
    case 'lure':{
      s.zones=s.zones.filter(z=>z.kind!=='lure');
      const d=facing(s);zone(s,ctx,'lure',legal({x:p.x-d.x*38,y:p.y-d.y*38}),4,{radius:CONFIG.skills.lure.radius});
      assignLure(s,ctx);break;
    }
    case 'bubble':p.bubbleUntil=now+7;break;
    case 'cones':placeCones(s,ctx);break;
    case 'bell':{
      const id=ctx.id();s.effects[`bellAt_${id}`]=now+.08;s.effects[`bellX_${id}`]=origin.x;s.effects[`bellY_${id}`]=origin.y;break;
    }
    case 'route':{
      s.zones=s.zones.filter(z=>z.kind!=='route');const d=facing(s),start=legal(origin,0);
      let length:number=CONFIG.skills.route.length;
      if(d.x>0)length=Math.min(length,(bounds.right-start.x)/d.x);else if(d.x<0)length=Math.min(length,(bounds.left-start.x)/d.x);
      if(d.y>0)length=Math.min(length,(bounds.bottom-start.y)/d.y);else if(d.y<0)length=Math.min(length,(bounds.top-start.y)/d.y);
      zone(s,ctx,'route',start,CONFIG.skills.route.duration,{angle:Math.atan2(d.y,d.x),length:Math.max(0,length),width:CONFIG.skills.route.width});break;
    }
    case 'hook':
      s.effects.hookUntil=now+CONFIG.skills.hook.duration;
      acquireHookTargets(s);
      break;
    case 'heat':p.heatUntil=now+5;break;
    case 'dispatch':{
      const dispatch=CONFIG.skills.dispatch;
      if(s.effects.dispatchUntil<=now)s.effects.dispatchStartedAt=now;
      s.effects.dispatchUntil=Math.min(now+dispatch.duration,s.effects.dispatchStartedAt+dispatch.maxDuration);
      broadcastDispatch(s,origin,ctx);
      break;
    }
    case 'stamp':p.stampUntil=now+CONFIG.skills.stamp.duration;break;
    case 'supply':deliverSupply(s,origin,ctx);break;
  }
}

function assignLure(s:GameState,ctx:CombatContext):void {
  for(const e of s.enemies){delete e.lureX;delete e.lureY;}
  const lure=s.zones.find(z=>z.kind==='lure'&&z.expiresAt>s.time);
  if(!lure)return;
  for(const e of nearest(s,lure,lure.radius,ctx).filter(e=>e.phase==='chase').slice(0,CONFIG.skills.lure.targets)){e.lureX=lure.x;e.lureY=lure.y;}
}

function placeCones(s:GameState,ctx:CombatContext):void {
  s.zones=s.zones.filter(z=>z.kind!=='cone');
  const {minCount,maxCount,duration,radius}=CONFIG.skills.cones;
  const count=minCount+Math.floor(ctx.random()*(maxCount-minCount+1));
  const d=facing(s);
  // Move the whole patch in from a wall, so the landing sites keep their spacing at corners.
  const center=legal({x:s.player.x+d.x*60,y:s.player.y+d.y*60},0);
  const cx=clamp(center.x,bounds.left+205,bounds.right-205);
  const cy=clamp(center.y,CONFIG.player.minY+122,bounds.bottom-142);
  const candidates:Vec[]=[];
  for(let row=0;row<3;row++){
    for(let col=0;col<4;col++){
      candidates.push({x:cx+(col-1.5)*104+(ctx.random()-.5)*48,y:cy+(row-1)*88+(ctx.random()-.5)*34});
    }
  }
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(ctx.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  const occupied=(at:Vec)=>s.enemies.some(e=>ctx.active(e)&&distanceSquared(at,e)<(radius+e.radius+5)**2);
  candidates.sort((a,b)=>Number(occupied(a))-Number(occupied(b)));
  for(const at of candidates.slice(0,count)){
    zone(s,ctx,'cone',at,duration,{radius});
  }
}

function updateCones(s:GameState,dt:number,ctx:CombatContext):void {
  const cones=s.zones.filter(z=>z.kind==='cone'&&z.hp>0);
  if(!cones.length)return;
  for(const e of s.enemies){
    if(!ctx.active(e))continue;
    const start={x:e.px,y:e.py};
    let cone:Zone|undefined,first=Infinity;
    for(const candidate of cones){
      if(candidate.hp<=0)continue;
      const hit=sweepContact(start,e,candidate,candidate.radius+e.radius);
      if(hit!==null&&hit<first){cone=candidate;first=hit;}
    }
    if(!cone)continue;
    const dx=e.x-start.x,dy=e.y-start.y;
    e.x=start.x+dx*first;e.y=start.y+dy*first;
    if(e.phase==='dash'){
      cone.hp=0;cone.expiresAt=s.time;e.phase='recover';e.phaseUntil=s.time+1;
      continue;
    }
    let nx=e.x-cone.x,ny=e.y-cone.y,length=Math.hypot(nx,ny);
    if(length<.001){nx=e.id%2?1:-1;ny=0;length=1;}
    nx/=length;ny/=length;
    // Follow the contact tangent so a walker can pass the obstacle without teleporting through it.
    const along=-ny*dx+nx*dy;
    const side=Math.abs(along)>.001?Math.sign(along):(e.id%2?1:-1);
    const angle=Math.atan2(ny,nx)+side*Math.min(.12,dt*2.3);
    const reach=cone.radius+e.radius+.6;
    const point=legal({x:cone.x+Math.cos(angle)*reach,y:cone.y+Math.sin(angle)*reach},e.radius);
    e.x=point.x;e.y=point.y;
  }
}

function ring(s:GameState,ctx:CombatContext):void {
  const p=s.player;if(p.skateUntil<=s.time)return;
  for(const e of [...s.enemies]){
    if(!ctx.active(e)||s.time-e.skateHitAt<CONFIG.skills.skate.interval-1e-9)continue;
    const start={x:e.px-p.px,y:e.py-p.py},end={x:e.x-p.x,y:e.y-p.y};
    const near=segmentDistanceSquared(start,end,{x:0,y:0});
    const far=Math.max(start.x**2+start.y**2,end.x**2+end.y**2);
    if(near<=(CONFIG.skills.skate.outer+e.radius)**2&&far>=Math.max(0,CONFIG.skills.skate.inner-e.radius)**2){
      e.skateHitAt=s.time;ctx.damage(e,CONFIG.skills.skate.damage,'skate');
    }
  }
}

function ringBell(s:GameState,origin:Vec,ctx:CombatContext):void {
  const bell=CONFIG.skills.bell;
  const targets=nearest(s,origin,bell.radius,ctx).filter(e=>e.bellResistUntil<=s.time).slice(0,bell.targets);
  if(!targets.length)return;
  for(const e of targets){
    if((e.bellStunUntil??0)<=s.time)e.stunStartedAt=s.time;
    e.bellStunUntil=Math.min(s.time+bell.duration,e.stunStartedAt+bell.maxDuration);
    stunEnemy(e,e.bellStunUntil);
    e.contactSuppressedUntil=Math.max(e.contactSuppressedUntil,e.bellStunUntil);
  }
  const stunnedIds=new Set(targets.map(e=>e.id));
  if(s.enemyShots?.length)s.enemyShots=s.enemyShots.filter(shot=>!stunnedIds.has(shot.ownerId));
  if(s.giantPulses?.length)s.giantPulses=s.giantPulses.filter(pulse=>!stunnedIds.has(pulse.ownerId));
}

function broadcastDispatch(s:GameState,origin:Vec,ctx:CombatContext):void {
  const {radius,recoilTime,slowTime}=CONFIG.skills.dispatch;
  if(s.enemyShots?.length)s.enemyShots=s.enemyShots.filter(shot=>{
    if(segmentDistanceSquared({x:shot.px,y:shot.py},shot,origin)>(radius+shot.radius)**2)return true;
    ctx.emit({type:'dispatchClear',x:shot.x,y:shot.y});
    return false;
  });
  for(const e of s.enemies){
    if(isElite(e.kind)||!ctx.active(e)||distanceSquared(e,origin)>(radius+e.radius)**2)continue;
    e.slowUntil=Math.max(e.slowUntil,s.time+slowTime);
    if((e.frostUntil??0)>s.time)continue;
    const until=s.time+recoilTime;
    interruptAttack(e,until);
    e.contactSuppressedUntil=Math.max(e.contactSuppressedUntil,until);
    e.dispatchRecoil={x:origin.x,y:origin.y,until};
  }
}

function acquireHookTargets(s:GameState):void {
  const {radius,targets,reelTimeout}=CONFIG.skills.hook;
  const slots=targets-s.pickups.filter(p=>(p.pulledUntil??0)>s.time).length;
  if(slots<=0)return;
  const loose=s.pickups.filter(p=>!p.groupId&&p.kind!=='hook'&&canCollectPickup(s,p)
    &&(p.pulledUntil??0)<=s.time&&distanceSquared(p,s.player)<=radius**2);
  loose.sort((a,b)=>distanceSquared(a,s.player)-distanceSquared(b,s.player)||a.id-b.id);
  for(const item of loose.slice(0,slots))item.pulledUntil=s.time+reelTimeout;
}

function updateHook(s:GameState,dt:number):void {
  const {launchTime,reelTimeout,speed}=CONFIG.skills.hook;
  if(s.effects.hookUntil>s.time)acquireHookTargets(s);
  for(const item of s.pickups){
    if(!item.pulledUntil)continue;
    if(item.pulledUntil<=s.time||!canCollectPickup(s,item)){delete item.pulledUntil;continue;}
    // The order stays on its hook until the line reaches it, then reels toward the moving rider.
    const reelTime=Math.min(dt,s.time-(item.pulledUntil-reelTimeout+launchTime));
    if(reelTime<=0)continue;
    const dx=s.player.x-item.x,dy=s.player.y-item.y,length=Math.hypot(dx,dy);
    if(length<.01)continue;
    const step=Math.min(length,speed*reelTime);item.x+=dx/length*step;item.y+=dy/length*step;
    Object.assign(item,legal(item,item.radius));
  }
}

/** A voucher owns its three stands. Keep free choices reachable even at the edge of a crowded street. */
function deliverSupply(s:GameState,origin:Vec,ctx:CombatContext):void {
  s.pickups=s.pickups.filter(p=>!p.groupId);
  s.zones=s.zones.filter(z=>z.kind!=='supply');
  const groupId=ctx.id(),readyAt=s.time+.35,expiresAt=readyAt+CONFIG.skills.supply.duration;
  const d=facing(s),heading=Math.atan2(d.y,d.x);
  const sites:Array<{point:Vec;angle:number;cost:number}>=[];
  for(const distance of [132,192,238])for(let i=0;i<32;i++){
    const angle=heading+i*Math.PI/16;
    const point={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance};
    if(!inside(point,20)||point.y<CONFIG.player.minY)continue;
    const crowded=s.enemies.some(e=>ctx.active(e)&&distanceSquared(e,point)<(e.radius+32)**2);
    const occupied=s.pickups.some(p=>distanceSquared(p,point)<(pickupReach(p)+CONFIG.pickup.choiceReach)**2)||
      s.weaponDrops.some(w=>distanceSquared(w,point)<(CONFIG.weapons.pickupReach+CONFIG.pickup.choiceReach)**2);
    sites.push({point,angle,cost:(crowded?450:0)+(occupied?300:0)+distance-132});
  }
  const choices=['fan','bubble','frost'] as const;
  const selected:Vec[]=[];
  for(const [i,kind] of choices.entries()){
    const angle=heading+(i-1)*Math.PI*.42;
    const rank=(site:typeof sites[number])=>site.cost+75*(1-Math.cos(angle-site.angle));
    const site=sites.filter(v=>selected.every(prev=>distanceSquared(prev,v.point)>100**2))
      .sort((a,b)=>rank(a)-rank(b))[0];
    if(!site)continue;
    selected.push(site.point);
    ctx.spawnPickup(kind,site.point,{groupId,readyAt,expiresAt,vx:0,vy:0});
  }
  zone(s,ctx,'supply',origin,expiresAt-s.time,{groupId});
}

export function updateSkills(s:GameState,dt:number,ctx:CombatContext,input:Vec={x:0,y:0}):void {
  const now=s.time,previous=now-dt;
  shatterOnDash(s,dt,ctx);
  updateUltimates(s,dt,ctx,input);
  updateElementalFields(s,dt,ctx);
  updateSkillFields(s,ctx);
  for(const [kind,until] of [['skate',s.player.skateUntil],['bubble',s.player.bubbleUntil],['heat',s.player.heatUntil],['stamp',s.player.stampUntil],['hook',s.effects.hookUntil]] as const){
    if(until>previous&&until<=now)ctx.emit({type:'skillEnd',kind});
  }
  s.zones=s.zones.filter(z=>z.expiresAt>now&&z.hp>0);
  for(const e of s.enemies){
    if(e.dispatchRecoil){
      const recoil=e.dispatchRecoil,{recoilTime,push}=CONFIG.skills.dispatch;
      const before=clamp((recoil.until-previous)/recoilTime,0,1);
      const after=clamp((recoil.until-now)/recoilTime,0,1);
      if((e.frostUntil??0)<=now)ctx.push(e,recoil,push*(before**2-after**2));
      if(after===0)delete e.dispatchRecoil;
    }
    updateElementalStatus(s,e,ctx);
    if(e.bellStunUntil&&e.bellStunUntil<=now){
      e.bellResistUntil=Math.max(e.bellResistUntil,e.bellStunUntil+CONFIG.skills.bell.resistance);
      delete e.bellStunUntil;
    }
    if(e.stunUntil>0&&e.stunUntil<=now)e.stunUntil=0;
  }
  for(const key of Object.keys(s.effects))if(key.startsWith('bellAt_')&&s.effects[key]<=now+1e-9){
    const suffix=key.slice(7);ringBell(s,{x:s.effects[`bellX_${suffix}`],y:s.effects[`bellY_${suffix}`]},ctx);
    delete s.effects[key];delete s.effects[`bellX_${suffix}`];delete s.effects[`bellY_${suffix}`];
  }
  if(s.effects.dispatchUntil>0&&s.effects.dispatchUntil<=now){
    s.effects.dispatchCooldownUntil=Math.max(s.effects.dispatchCooldownUntil,s.effects.dispatchUntil+CONFIG.skills.dispatch.cooldown);
    s.effects.dispatchUntil=0;ctx.emit({type:'skillEnd',kind:'dispatch'});
  }
  if(s.effects.dispatchCooldownUntil>now)for(const item of s.pickups)if(item.kind==='dispatch'){
    item.disabledUntil=s.effects.dispatchCooldownUntil;delete item.pulledUntil;
  }
  updateCones(s,dt,ctx);assignLure(s,ctx);updateHook(s,dt);ring(s,ctx);
}
