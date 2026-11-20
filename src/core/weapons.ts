import type {Enemy,EnemyShot,GameState,Projectile,Vec,WeaponKind,WeaponAttack} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD} from './config';
import {coatEnemy,trayBrineContact} from './elemental-skills';
import {relativeSweep} from './geometry';
import {isPlayerInvulnerable} from './skills';
import {isMelee,MELEE_WEAPONS,updateMelee} from './melee';
export {meleePose} from './melee';
export const UMBRELLA_GUARD={inner:29.7,outer:40.5,halfAngle:55*Math.PI/180} as const;
// Release the centre lane first so overlapping shots at the muzzle resolve consistently.
const VOLLEY_ANGLES={
  bag:[0,-18,18,-36,36,-54,54,-72,72],
  chopsticks:[0,-21,21,-42,42],
  spirit:[0,-48,48],
  tray:[0,-44,44],
  lunchbox:[0,-40,40],
  talisman:[0,-54,54],
} as const;
type RangedKind=keyof typeof VOLLEY_ANGLES;
const isRanged=(kind:WeaponKind):kind is RangedKind=>Object.hasOwn(VOLLEY_ANGLES,kind);
export const RANGED_HITS={
  chopsticks:[74,64,56,50,44,38,32], spirit:[70,50], talisman:[70,60,52,46,40,36],
  spiritBounce:175, trayReturn:44, trayTargetsPerLeg:9,
} as const;
// Nine paper puffs fire together. Let the earliest fan finish its range before
// a third heated volley needs its slots, even on an empty street.
const FLIGHT_SPEED:Record<RangedKind,number>={bag:700,chopsticks:700,spirit:470,tray:560,lunchbox:440,talisman:440};

export interface WeaponConfig {range:number;windup:number;cooldown:number;active:number;damage:number;limit:number;width:number}
export const WEAPONS:Record<WeaponKind,WeaponConfig>={
  ...MELEE_WEAPONS,
  bag:{range:410,windup:.05,cooldown:.34,active:.12,damage:45,limit:VOLLEY_ANGLES.bag.length,width:30},
  chopsticks:{range:540,windup:.045,cooldown:.295,active:.12,damage:RANGED_HITS.chopsticks[0],limit:14,width:24},
  spirit:{range:470,windup:.075,cooldown:.47,active:.18,damage:RANGED_HITS.spirit[0],limit:6,width:34},
  tray:{range:420,windup:.06,cooldown:.49,active:.16,damage:58,limit:2*RANGED_HITS.trayTargetsPerLeg,width:48},
  lunchbox:{range:420,windup:.095,cooldown:.63,active:.18,damage:116,limit:14,width:150},
  talisman:{range:470,windup:.065,cooldown:.44,active:.18,damage:RANGED_HITS.talisman[0],limit:10,width:165},
};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function movementAngle(s:GameState):number {
  const d=s.player.moveDirection;return Math.hypot(d.x,d.y)>.001?Math.atan2(d.y,d.x):(s.player.facing<0?Math.PI:0);
}
function distanceToEdge(p:Vec,dx:number,dy:number):number {
  const b=WORLD.bounds;
  const alongX=dx>0?(b.right-p.x)/dx:dx<0?(b.left-p.x)/dx:Infinity;
  const alongY=dy>0?(b.bottom-p.y)/dy:dy<0?(b.top-p.y)/dy:Infinity;
  return Math.max(0,Math.min(alongX,alongY));
}
function forwardTarget(s:GameState,angle:number,range:number,ctx:CombatContext,halfAngle=Math.PI/5,claimed?:Set<number>):Enemy|undefined {
  return s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!claimed?.has(e.id)&&distance(s.player,e)<=range&&Math.abs(angleDelta(Math.atan2(e.y-s.player.y,e.x-s.player.x),angle))<=halfAngle)
    .sort((a,b)=>distance(a,s.player)-distance(b,s.player)||a.id-b.id)[0];
}
// The tongs can raise for the next facing during the last windup-length of cooldown.
// The committed swing always finishes and the next strike still pays the full release cooldown.
function canPrepareTurn(s:GameState,previous:WeaponAttack,ctx:CombatContext):boolean {
  const remaining=s.weapon.readyAt-s.time;
  if(previous.kind!=='tongs' || remaining<=0 || remaining>WEAPONS.tongs.windup+1e-9) return false;
  const angle=movementAngle(s);
  return Math.abs(angleDelta(angle,previous.angle))>=2*Math.PI/3 &&
    forwardTarget(s,angle,WEAPONS.tongs.range,ctx)!==undefined;
}
function release(s:GameState,a:WeaponAttack,ctx:CombatContext):void {
  const cfg=WEAPONS[a.kind];
  if(isRanged(a.kind)&&s.projectiles.length+VOLLEY_ANGLES[a.kind].length>CONFIG.weapons.projectileCap){
    // A whole volley fits or none leaves the hand. Retry after an older volley clears.
    s.weapon.attack=null;s.weapon.readyAt=s.time;return;
  }
  a.phase='active';a.releaseAt=s.time;a.endsAt=s.time+cfg.active;
  s.weapon.readyAt=s.time+cfg.cooldown*(s.player.heatUntil>s.time?.8:1);
  ctx.emit({type:'attack',id:a.id,kind:a.kind,x:s.player.x,y:s.player.y,angle:a.angle});
  const kind=a.kind;
  if(!isRanged(kind))return;
  const p=s.player,claimed=new Set<number>(),landings:Vec[]=[];
  const hitIds:number[]=[],returnIds:number[]=[];
  const speed=FLIGHT_SPEED[kind],flight=kind==='lunchbox';
  const lifetime=flight ? .65 : kind==='tray' ? 6 : 2;
  for(const degrees of VOLLEY_ANGLES[kind]){
    const angle=a.angle+degrees*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
    const reach=flight?Math.min(cfg.range*(degrees===0?1:.82),distanceToEdge(p,dx,dy)):cfg.range;
    const target={x:p.x+dx*reach,y:p.y+dy*reach};
    // Three parcels land at three real locations. At a wall coincident landings read as one.
    if(flight){
      if(landings.some(pos=>distance(pos,target)<34))continue;
      landings.push(target);
    }
    const guide=kind==='spirit'?forwardTarget(s,angle,cfg.range,ctx,Math.PI/7,claimed):undefined;
    if(guide)claimed.add(guide.id);
    s.projectiles.push({
      id:ctx.id(),attackId:a.id,kind,x:p.x,y:p.y,px:p.x,py:p.y,vx:dx*speed,vy:dy*speed,
      radius:flight?cfg.width:kind==='talisman'?17:cfg.width/2,
      originX:p.x,originY:p.y,targetX:target.x,targetY:target.y,bornAt:s.time,
      expiresAt:s.time+lifetime,travelled:0,maxDistance:reach,
      phase:flight?'flight':'out',hitIds,phaseHitIds:returnIds,targetId:guide?.id??-1,
      retargets:0,nextHitAt:s.time,hits:0,
    });
  }
}
/** Check the actual lit umbrella rim, never enemies already inside it. */
function umbrella(s:GameState,a:WeaponAttack,dt:number,ctx:CombatContext):void {
  if(a.kind!=='umbrella'||a.blocked||isPlayerInvulnerable(s,dt))return;
  const p=s.player,{outer,inner,halfAngle}=UMBRELLA_GUARD;
  const threats:({enemy:Enemy;shot?:never}|{shot:EnemyShot;enemy?:never})[]=[...s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&Math.max(e.contactSuppressedUntil,e.frostUntil??0)<=s.time).map(enemy=>({enemy})),...(s.enemyShots??[]).filter(q=>q.expiresAt>s.time).map(shot=>({shot}))];
  const hits=threats.map(threat=>{
    const e=threat.enemy??threat.shot,start={x:e.px-p.px,y:e.py-p.py},end={x:e.x-p.x,y:e.y-p.y};
    const t=relativeSweep({x:0,y:0},{x:0,y:0},start,end,outer+e.radius);
    const ang=Math.atan2(start.y+(end.y-start.y)*(t??0),start.x+(end.x-start.x)*(t??0));
    return {...threat,id:e.id,t,valid:Math.hypot(start.x,start.y)>=inner+e.radius&&Math.abs(angleDelta(ang,a.angle))<=halfAngle};
  }).filter(v=>v.valid&&v.t!==null).sort((a,b)=>a.t!-b.t!||a.id-b.id);
  const hit=hits[0];if(!hit)return;
  a.blocked=true;
  if(hit.shot)s.enemyShots=s.enemyShots?.filter(q=>q.id!==hit.shot!.id);
  else if(hit.enemy){const e=hit.enemy;e.contactSuppressedUntil=s.time+.15;
    if(!a.hitIds.includes(e.id)&&a.hitIds.length<WEAPONS.umbrella.limit){a.hitIds.push(e.id);ctx.damage(e,WEAPONS.umbrella.damage,'umbrella',Math.atan2(e.y-p.y,e.x-p.x));}if(e.hp>0)ctx.push(e,p,24);
  }
  ctx.emit({type:'defend',kind:'umbrella',x:p.x,y:p.y,victimId:hit.enemy?.id??hit.shot!.ownerId});
}
function updateProjectiles(s:GameState,dt:number,ctx:CombatContext):void {
  const remove=new Set<number>();
  for(const q of s.projectiles){
    q.px=q.x;q.py=q.y;
    if(q.kind==='lunchbox'){
      const t=Math.min(1,(s.time-q.bornAt)/.65);q.x=q.originX+(q.targetX-q.originX)*t;q.y=q.originY+(q.targetY-q.originY)*t;
      if(t>=1){
        ctx.emit({type:'detonation',x:q.x,y:q.y});
        const cfg=WEAPONS.lunchbox,list=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id)&&distance(e,q)<=q.radius+e.radius)
          .sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id).slice(0,Math.max(0,cfg.limit-q.hitIds.length));
        for(const e of list){
          q.hitIds.push(e.id);ctx.damage(e,cfg.damage,'lunchbox',Math.atan2(e.y-q.y,e.x-q.x));
        }
        remove.add(q.id);
      }continue;
    }
    if(s.time>q.expiresAt||(q.kind!=='tray'&&q.hitIds.length>=WEAPONS[q.kind].limit)){remove.add(q.id);continue;}
    if(q.kind==='talisman'&&q.phase==='chain'){
      if(s.time+1e-9<q.nextHitAt)continue;
      const target=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id)&&distance(e,q)<=WEAPONS.talisman.width).sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id)[0];
      if(!target){remove.add(q.id);continue;}
      const impactAngle=Math.atan2(target.y-q.y,target.x-q.x);
      ctx.emit({type:'chainLink',fromX:q.x,fromY:q.y,x:target.x,y:target.y});
      q.x=target.x;q.y=target.y;q.hitIds.push(target.id);
      ctx.damage(target,RANGED_HITS.talisman[q.hits],'talisman',impactAngle);
      q.hits++;q.nextHitAt=s.time+.1;if(q.hits>=RANGED_HITS.talisman.length)remove.add(q.id);continue;
    }
    if(q.kind==='spirit'){
      let target=s.enemies.find(e=>e.id===q.targetId&&ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id));
      const initialAngle=Math.atan2(q.targetY-q.originY,q.targetX-q.originX);
      if(target&&q.hits===0&&((target.x-q.originX)*Math.cos(initialAngle)+(target.y-q.originY)*Math.sin(initialAngle)<0)){target=undefined;q.targetId=-1;}
      if(!target&&q.hits>0&&q.retargets<1){
        target=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id)&&distance(e,q)<=RANGED_HITS.spiritBounce).sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id)[0];
        q.retargets++;q.targetId=target?.id??-1;
        if(!target){remove.add(q.id);continue;}
        const rebound=Math.atan2(target.y-q.y,target.x-q.x);
        q.vx=Math.cos(rebound)*FLIGHT_SPEED.spirit;q.vy=Math.sin(rebound)*FLIGHT_SPEED.spirit;
      }
      // No valid initial target still produces a forward flying orb. Never acquire a rear enemy.
      if(target){const desired=Math.atan2(target.y-q.y,target.x-q.x),current=Math.atan2(q.vy,q.vx),delta=Math.max(-Math.PI*dt,Math.min(Math.PI*dt,angleDelta(desired,current)));q.vx=Math.cos(current+delta)*FLIGHT_SPEED.spirit;q.vy=Math.sin(current+delta)*FLIGHT_SPEED.spirit;}
    }
    if(q.kind==='tray'&&q.phase==='return'){
      const d=distance(q,s.player);if(d<1e-6){remove.add(q.id);continue;}q.vx=(s.player.x-q.x)/d*650;q.vy=(s.player.y-q.y)/d*650;
    }
    const speed=Math.hypot(q.vx,q.vy),dx=q.vx/(speed||1),dy=q.vy/(speed||1);
    const remaining=q.phase==='return'?distance(q,s.player):Math.min(Math.max(0,q.maxDistance-q.travelled),distanceToEdge(q,dx,dy));
    const travel=Math.min(speed*dt,remaining);
    let atEnd=travel>=remaining-1e-8;
    q.x+=dx*travel;q.y+=dy*travel;q.travelled+=travel;
    const hitList=q.kind==='tray'&&q.phase==='return'?q.phaseHitIds:q.hitIds;
    const limit=q.kind==='tray'?RANGED_HITS.trayTargetsPerLeg:WEAPONS[q.kind].limit;
    const start={x:q.px,y:q.py};
    const duration=q.kind==='tray'&&speed>0?travel/speed:dt;
    const cloud=q.kind==='tray'&&!q.brined&&s.market?.upgrade==='brine'?s.elementalFields?.find(f=>f.kind==='poison'):undefined;
    const brineAt=cloud?trayBrineContact(cloud,start,q,q.radius,s.time-dt,duration):null;
    const hits=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!hitList.includes(e.id)).map(e=>{
      const previous={x:e.px,y:e.py};
      const end=duration<dt?{x:e.px+(e.x-e.px)*duration/dt,y:e.py+(e.y-e.py)*duration/dt}:e;
      return {e,t:relativeSweep(start,q,previous,end,q.radius+e.radius)};
    }).filter((hit):hit is {e:Enemy;t:number}=>hit.t!==null).sort((a,b)=>a.t-b.t||a.e.id-b.e.id);
    for(const {e,t} of hits){
      if(hitList.length>=limit)break;
      const damage=q.kind==='chopsticks'||q.kind==='spirit'?RANGED_HITS[q.kind][q.hits]
        :q.kind==='tray'&&q.phase==='return'?RANGED_HITS.trayReturn:WEAPONS[q.kind].damage;
      if(!damage)break;
      hitList.push(e.id);q.hits++;ctx.damage(e,damage,q.kind,Math.atan2(q.vy,q.vx));
      if(e.hp>0&&(q.brined||(brineAt!==null&&t+1e-9>=brineAt)))coatEnemy(e,s.time-dt+duration*t);
      if(q.kind==='talisman'){q.phase='chain';q.x=e.x;q.y=e.y;q.nextHitAt=s.time+.1;break;}
      if(q.kind==='bag'||(q.kind==='chopsticks'||q.kind==='spirit')&&q.hits>=RANGED_HITS[q.kind].length){remove.add(q.id);break;}
      if(q.kind==='spirit'){
        q.targetId=-1;q.x=e.x;q.y=e.y;q.travelled=0;q.maxDistance=RANGED_HITS.spiritBounce;
        atEnd=false;break;
      }
    }
    if(brineAt!==null)q.brined=true;
    if(atEnd&&q.phase!=='chain'){
      if(q.kind==='tray'&&q.phase==='out')q.phase='return';
      else remove.add(q.id);
    }
  }
  s.projectiles=s.projectiles.filter(q=>!remove.has(q.id));
}
export function updateWeapons(s:GameState,dt:number,ctx:CombatContext):void {
  updateProjectiles(s,dt,ctx);
  let a=s.weapon.attack;
  let preparingTurn=false;
  if(a){
    if(a.phase==='windup'){
      a.angle=movementAngle(s);
      if(s.time+1e-9>=a.releaseAt)release(s,a,ctx);
    }
    a=s.weapon.attack;
  }
  if(a?.phase==='active')umbrella(s,a,dt,ctx);
  updateMelee(s,a?.phase==='active'?a:null,dt,ctx);
  if(a){
    if(a.phase==='active'){
      if(s.time>=a.endsAt){
        a.phase='recovery';
        a.endsAt=Math.min(s.time+.16,s.weapon.readyAt);
      }
    }else if(a?.phase==='recovery'){
      preparingTurn=canPrepareTurn(s,a,ctx);
      const waitingForTurn=a.kind==='tongs' && s.time<s.weapon.readyAt && s.weapon.readyAt<=a.releaseAt+WEAPONS.tongs.cooldown+1e-9;
      if(preparingTurn || (s.time>=a.endsAt && !waitingForTurn))s.weapon.attack=null;
    }
  }
  if(s.weapon.attack||(!preparingTurn&&s.time+1e-9<s.weapon.readyAt))return;
  const kind=s.weapon.kind,cfg=WEAPONS[kind];
  if(isRanged(kind)&&s.projectiles.length+VOLLEY_ANGLES[kind].length>CONFIG.weapons.projectileCap)return;
  s.weapon.targetId=null;
  if(isMelee(kind))s.weapon.swingSide=s.weapon.swingSide===1?-1:1;
  s.weapon.attack={id:ctx.id(),kind,phase:'windup',startedAt:s.time,releaseAt:s.time+cfg.windup,endsAt:s.time+cfg.windup+cfg.active,angle:movementAngle(s),swingSide:s.weapon.swingSide,targetId:-1,hitIds:[],blocked:false};
  s.weapon.readyAt=s.time+cfg.windup+cfg.cooldown*(s.player.heatUntil>s.time?.8:1);
}
