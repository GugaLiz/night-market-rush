import type {Enemy, GameState, Pickup, SkillKind, Vec, Zone} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, pickupReach} from './config';
import {clamp, distanceSquared, segmentDistanceSquared, sweepContact} from './geometry';
import {igniteFan, spillSoda, updateSkillFields} from './skill-fields';
import {castUltimate,updateUltimates} from './ultimates';
import {stunEnemy} from './enemies';
import {castElemental, updateElementalFields, updateElementalStatus} from './elemental-skills';

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
    case 'hook':startHook(s);break;
    case 'heat':p.heatUntil=now+5;break;
    case 'dispatch':{
      if(s.effects.dispatchUntil<=now)s.effects.dispatchStartedAt=now;
      s.effects.dispatchUntil=Math.min(now+4,s.effects.dispatchStartedAt+6);break;
    }
    case 'stamp':p.stampUntil=now+6;break;
    case 'supply':
      if(!deliverSupply(s,origin,ctx)&&s.effects.pendingSupplyUntil<=now){
        s.effects.pendingSupplyAt=now;s.effects.pendingSupplyUntil=now+4;
        s.effects.pendingSupplyX=origin.x;s.effects.pendingSupplyY=origin.y;
        ctx.emit({type:'notice',message:'补给等待空位'});
      }
      break;
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
  const target=nearest(s,s.player,500,ctx)[0];let d=facing(s);
  if(target){const length=Math.hypot(target.x-s.player.x,target.y-s.player.y);if(length>.1)d={x:(target.x-s.player.x)/length,y:(target.y-s.player.y)/length};}
  const {spacing,reach,radius}=CONFIG.skills.cones;
  for(const offset of [-spacing,0,spacing]){
    const base={x:s.player.x+d.x*reach-d.y*offset,y:s.player.y+d.y*reach+d.x*offset};
    for(const shift of [0,spacing/2,-spacing/2,spacing,-spacing]){
      const candidate={x:base.x+d.x*shift,y:base.y+d.y*shift};
      if(!inside(candidate,radius)||s.enemies.some(e=>e.hp>0&&distanceSquared(candidate,e)<(radius+e.radius+8)**2)||
        s.zones.some(z=>z.kind==='cone'&&distanceSquared(candidate,z)<(2*radius+2)**2))continue;
      zone(s,ctx,'cone',candidate,4.5,{radius});break;
    }
  }
}

function updateCones(s:GameState,dt:number,ctx:CombatContext):void {
  for(const cone of s.zones.filter(z=>z.kind==='cone'&&z.hp>0)){
    for(const e of s.enemies){
      if(!ctx.active(e)||cone.hp<=0)continue;
      const radius=cone.radius+e.radius;
      const hit=sweepContact({x:e.px,y:e.py},e,cone,radius);
      if(hit===null)continue;
      // Stop at the swept collision, including fast dash crossings.
      const dx=e.x-e.px,dy=e.y-e.py;
      e.x=e.px+dx*Math.max(0,hit-.001);e.y=e.py+dy*Math.max(0,hit-.001);
      if(e.phase==='dash'){
        cone.hp=0;cone.expiresAt=s.time;e.phase='recover';e.phaseUntil=s.time+1;break;
      }
      let nx=e.x-cone.x,ny=e.y-cone.y,length=Math.hypot(nx,ny);
      if(length<.001){nx=e.id%2?1:-1;ny=0;length=1;}
      nx/=length;ny/=length;
      // A deterministic tangent prevents enemies sticking forever in a straight row.
      const along=-ny*dx+nx*dy;
      const side=Math.abs(along)>.001?Math.sign(along):(e.id%2?1:-1);
      const angle=Math.atan2(ny,nx)+side*Math.min(.12,dt*2.3);
      const point=legal({x:cone.x+Math.cos(angle)*(radius+.6),y:cone.y+Math.sin(angle)*(radius+.6)},e.radius);
      e.x=point.x;e.y=point.y;
    }
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
  for(const e of nearest(s,origin,CONFIG.skills.bell.radius,ctx).filter(e=>e.bellResistUntil<=s.time).slice(0,CONFIG.skills.bell.targets)){
    if((e.bellStunUntil??0)<=s.time)e.stunStartedAt=s.time;
    e.bellStunUntil=Math.min(s.time+.65,e.stunStartedAt+1.2);
    stunEnemy(e,e.bellStunUntil);
  }
}

function startHook(s:GameState):void {
  const travelling=s.pickups.filter(p=>(p.pulledUntil??0)>s.time&&canCollectPickup(s,p));
  const groups=new Set(travelling.filter(p=>p.groupId).map(p=>p.groupId));
  let slots=CONFIG.skills.hook.targets-travelling.length;
  const candidates=s.pickups.filter(p=>p.kind!=='hook'&&canCollectPickup(s,p)&&(p.pulledUntil??0)<=s.time&&distanceSquared(p,s.player)<=CONFIG.skills.hook.radius**2)
    .sort((a,b)=>distanceSquared(a,s.player)-distanceSquared(b,s.player)||a.id-b.id);
  for(const item of candidates){
    if(slots<=0)break;if(item.groupId&&groups.has(item.groupId))continue;
    item.pulledUntil=s.time+CONFIG.skills.hook.duration;if(item.groupId)groups.add(item.groupId);slots--;
  }
}

function updateHook(s:GameState,dt:number):void {
  for(const item of s.pickups){
    if(!item.pulledUntil)continue;
    if(item.pulledUntil<=s.time||!canCollectPickup(s,item)){delete item.pulledUntil;continue;}
    const dx=s.player.x-item.x,dy=s.player.y-item.y,length=Math.hypot(dx,dy);
    if(length<.01)continue;
    const step=Math.min(length,CONFIG.skills.hook.speed*dt);item.x+=dx/length*step;item.y+=dy/length*step;
    Object.assign(item,legal(item,item.radius));
  }
}

/** Reserve landing spots now so natural spawns cannot steal the supply capacity. */
function deliverSupply(s:GameState,origin:Vec,ctx:CombatContext):boolean {
  if(s.pickups.some(p=>p.groupId&&!p.retiringUntil&&(p.expiresAt??Infinity)>s.time))return false;
  const occupied=s.pickups.filter(p=>p.kind!=='health'&&!p.retiringUntil&&(p.expiresAt??Infinity)>s.time).length;
  const capacity=Math.min(3,CONFIG.pickup.cap-occupied);if(capacity<=0)return false;
  const positions:Vec[]=[];const d=facing(s),angle=Math.atan2(d.y,d.x);
  for(let i=0;i<12&&positions.length<capacity;i++){
    const a=angle+i*Math.PI/6,candidate={x:origin.x+Math.cos(a)*105,y:origin.y+Math.sin(a)*105};
    if(!inside(candidate,20)||candidate.y<CONFIG.player.minY||s.enemies.some(e=>e.hp>0&&distanceSquared(candidate,e)<(e.radius+40)**2)||
      s.pickups.some(p=>!p.retiringUntil&&distanceSquared(candidate,p)<(pickupReach(p)+CONFIG.pickup.choiceReach)**2)||
      s.weaponDrops.some(w=>distanceSquared(candidate,w)<(CONFIG.weapons.pickupReach+CONFIG.pickup.choiceReach)**2)||
      positions.some(p=>distanceSquared(candidate,p)<(2*CONFIG.pickup.choiceReach)**2))continue;
    positions.push(candidate);
  }
  if(!positions.length)return false;
  const groupId=ctx.id(),readyAt=s.time+.35;
  const choices:SkillKind[]=['fan','skate','soda'];let count=0;
  for(let i=0;i<positions.length;i++)if(ctx.spawnPickup(choices[i],positions[i],{groupId,readyAt,expiresAt:readyAt+6}))count++;
  if(!count)return false;
  s.effects.supplyGroupId=groupId;s.effects.pendingSupplyAt=0;s.effects.pendingSupplyUntil=0;
  zone(s,ctx,'supply',origin,6.35,{radius:105,groupId});return true;
}

export function updateSkills(s:GameState,dt:number,ctx:CombatContext,input:Vec={x:0,y:0}):void {
  const now=s.time,previous=now-dt;
  updateUltimates(s,dt,ctx,input);
  updateElementalFields(s,dt,ctx);
  updateSkillFields(s,ctx);
  for(const [kind,until] of [['skate',s.player.skateUntil],['bubble',s.player.bubbleUntil],['heat',s.player.heatUntil],['stamp',s.player.stampUntil]] as const){
    if(until>previous&&until<=now)ctx.emit({type:'skillEnd',kind});
  }
  s.zones=s.zones.filter(z=>z.expiresAt>now&&z.hp>0);
  for(const e of s.enemies){
    updateElementalStatus(s,e,ctx);
    if(e.bellStunUntil&&e.bellStunUntil<=now){
      e.bellResistUntil=Math.max(e.bellResistUntil,e.bellStunUntil+1);
      delete e.bellStunUntil;
    }
    if(e.stunUntil>0&&e.stunUntil<=now)e.stunUntil=0;
  }
  for(const key of Object.keys(s.effects))if(key.startsWith('bellAt_')&&s.effects[key]<=now+1e-9){
    const suffix=key.slice(7);ringBell(s,{x:s.effects[`bellX_${suffix}`],y:s.effects[`bellY_${suffix}`]},ctx);
    delete s.effects[key];delete s.effects[`bellX_${suffix}`];delete s.effects[`bellY_${suffix}`];
  }
  if(s.effects.dispatchUntil>0&&s.effects.dispatchUntil<=now){
    s.effects.dispatchCooldownUntil=Math.max(s.effects.dispatchCooldownUntil,s.effects.dispatchUntil+2);
    s.effects.dispatchUntil=0;ctx.emit({type:'skillEnd',kind:'dispatch'});
  }
  if(s.effects.dispatchCooldownUntil>now)for(const item of s.pickups)if(item.kind==='dispatch'){
    item.disabledUntil=s.effects.dispatchCooldownUntil;delete item.pulledUntil;
  }
  if(s.effects.pendingSupplyUntil>0){
    if(s.effects.pendingSupplyUntil<=now){s.effects.pendingSupplyUntil=0;s.effects.pendingSupplyAt=0;ctx.emit({type:'notice',message:'补给暂无法投递'});}
    else deliverSupply(s,{x:s.effects.pendingSupplyX,y:s.effects.pendingSupplyY},ctx);
  }
  updateCones(s,dt,ctx);assignLure(s,ctx);updateHook(s,dt);ring(s,ctx);
}
