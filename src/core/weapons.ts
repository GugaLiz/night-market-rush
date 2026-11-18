import type {Enemy,EnemyShot,GameState,Projectile,WeaponKind,WeaponAttack} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG} from './config';
import {relativeSweep,segmentSeparationSquared,sweepContact} from './geometry';

export interface WeaponConfig {range:number;windup:number;cooldown:number;active:number;damage:number;limit:number;width:number}
export const WEAPONS:Record<WeaponKind,WeaponConfig>={
  tongs:{range:150,windup:.07,cooldown:.55,active:.14,damage:30,limit:4,width:76},
  bag:{range:280,windup:.1,cooldown:.7,active:.12,damage:24,limit:5,width:20},
  chopsticks:{range:360,windup:.1,cooldown:.9,active:.12,damage:42,limit:5,width:15},
  spirit:{range:320,windup:.16,cooldown:1.15,active:.18,damage:40,limit:2,width:24},
  knife:{range:145,windup:.08,cooldown:.55,active:.16,damage:32,limit:6,width:150},
  tray:{range:300,windup:.12,cooldown:1.05,active:.16,damage:32,limit:8,width:36},
  umbrella:{range:140,windup:.1,cooldown:.9,active:.3,damage:36,limit:5,width:140},
  sword:{range:180,windup:.2,cooldown:1.15,active:.2,damage:65,limit:6,width:62},
  lunchbox:{range:300,windup:.15,cooldown:1.5,active:.18,damage:60,limit:8,width:80},
  talisman:{range:320,windup:.12,cooldown:1.1,active:.18,damage:40,limit:4,width:110},
};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function movementAngle(s:GameState):number {
  const d=s.player.moveDirection;return Math.hypot(d.x,d.y)>.001?Math.atan2(d.y,d.x):(s.player.facing<0?Math.PI:0);
}
function forwardTarget(s:GameState,angle:number,range:number,ctx:CombatContext):Enemy|undefined {
  return s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&distance(s.player,e)<=range&&Math.abs(angleDelta(Math.atan2(e.y-s.player.y,e.x-s.player.x),angle))<=Math.PI/5)
    .sort((a,b)=>distance(a,s.player)-distance(b,s.player)||a.id-b.id)[0];
}
function projectile(s:GameState,a:WeaponAttack,ctx:CombatContext,angle:number,extra:Partial<Projectile>={}):void {
  if(s.projectiles.length>=CONFIG.weapons.projectileCap)return;
  const p=s.player,cfg=WEAPONS[a.kind];
  s.projectiles.push({id:ctx.id(),attackId:a.id,kind:a.kind,x:p.x,y:p.y,px:p.x,py:p.y,vx:Math.cos(angle)*440,vy:Math.sin(angle)*440,radius:10,originX:p.x,originY:p.y,targetX:p.x+Math.cos(angle)*cfg.range,targetY:p.y+Math.sin(angle)*cfg.range,bornAt:s.time,expiresAt:s.time+2,travelled:0,maxDistance:cfg.range,phase:'out',hitIds:[],phaseHitIds:[],targetId:-1,retargets:0,nextHitAt:s.time,hits:0,...extra});
}
function release(s:GameState,a:WeaponAttack,ctx:CombatContext):void {
  const cfg=WEAPONS[a.kind];
  a.phase='active';a.releaseAt=s.time;a.endsAt=s.time+cfg.active;
  s.weapon.readyAt=s.time+cfg.cooldown*(s.player.heatUntil>s.time?.8:1);
  ctx.emit({type:'attack',id:a.id,kind:a.kind,x:s.player.x,y:s.player.y,angle:a.angle});
  const direction={x:Math.cos(a.angle),y:Math.sin(a.angle)};
  if(a.kind==='bag'){
    const shared:number[]=[];
    for(const offset of [-Math.PI/6,-Math.PI/12,0,Math.PI/12,Math.PI/6])projectile(s,a,ctx,a.angle+offset,{hitIds:shared});
  }else if(a.kind==='chopsticks')projectile(s,a,ctx,a.angle,{radius:7.5,vx:direction.x*570,vy:direction.y*570});
  else if(a.kind==='tray')projectile(s,a,ctx,a.angle,{radius:18,vx:direction.x*480,vy:direction.y*480});
  else if(a.kind==='spirit')projectile(s,a,ctx,a.angle,{radius:12,vx:direction.x*360,vy:direction.y*360,targetId:forwardTarget(s,a.angle,cfg.range,ctx)?.id??-1});
  else if(a.kind==='lunchbox')projectile(s,a,ctx,a.angle,{phase:'flight',expiresAt:s.time+.65,radius:cfg.width});
  else if(a.kind==='talisman')projectile(s,a,ctx,a.angle,{radius:12});
}
function melee(s:GameState,a:WeaponAttack,ctx:CombatContext):void {
  if(!['tongs','knife','sword','umbrella'].includes(a.kind))return;
  const cfg=WEAPONS[a.kind],p=s.player,dx=Math.cos(a.angle),dy=Math.sin(a.angle);
  const list=s.enemies.filter(e=>ctx.active(e)&&!a.hitIds.includes(e.id)&&e.hp>0).map(e=>{
    const along=(e.x-p.x)*dx+(e.y-p.y)*dy;
    const old={x:p.x+e.px-p.px,y:p.y+e.py-p.py};
    const t=sweepContact(old,e,p,cfg.range+e.radius);
    const reverse=sweepContact(e,old,p,cfg.range+e.radius),mx=e.x-old.x,my=e.y-old.y;
    const closest=Math.max(0,Math.min(1,((p.x-old.x)*mx+(p.y-old.y)*my)/(mx*mx+my*my||1)));
    const candidates=[old,e,{x:old.x+mx*closest,y:old.y+my*closest},...(t===null?[]:[{x:old.x+mx*t,y:old.y+my*t}]),...(reverse===null?[]:[{x:e.x-mx*reverse,y:e.y-my*reverse}])];
    const touching=(a.kind==='knife'||a.kind==='umbrella')?candidates.some(v=>distance(v,p)<=cfg.range+e.radius+1e-8&&Math.abs(angleDelta(Math.atan2(v.y-p.y,v.x-p.x),a.angle))<=cfg.width*Math.PI/360):
      candidates.some(v=>(v.x-p.x)*dx+(v.y-p.y)*dy>=0)&&segmentSeparationSquared(p,{x:p.x+dx*cfg.range,y:p.y+dy*cfg.range},old,e)<=(cfg.width/2+e.radius)**2;
    return {e,along,touching};
  }).filter(v=>v.touching).sort((a,b)=>a.along-b.along||a.e.id-b.e.id);
  for(const {e} of list){if(a.hitIds.length>=cfg.limit)break;a.hitIds.push(e.id);ctx.damage(e,cfg.damage,a.kind);}
}
/** Check the actual lit umbrella rim, never enemies already inside it. */
function umbrella(s:GameState,a:WeaponAttack,dt:number,ctx:CombatContext):void {
  if(a.kind!=='umbrella'||a.blocked||s.player.invulnerableUntil>s.time||(s.player.dashUntil??0)>s.time-dt+1e-9)return;
  const p=s.player,outer=40.5,inner=29.7;
  const threats:({enemy:Enemy;shot?:never}|{shot:EnemyShot;enemy?:never})[]=[...s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&e.contactSuppressedUntil<=s.time).map(enemy=>({enemy})),...(s.enemyShots??[]).filter(q=>q.expiresAt>s.time).map(shot=>({shot}))];
  const hits=threats.map(threat=>{
    const e=threat.enemy??threat.shot,start={x:e.px-p.px,y:e.py-p.py},end={x:e.x-p.x,y:e.y-p.y};
    const t=relativeSweep({x:0,y:0},{x:0,y:0},start,end,outer+e.radius);
    const ang=Math.atan2(start.y+(end.y-start.y)*(t??0),start.x+(end.x-start.x)*(t??0));
    return {...threat,id:e.id,t,valid:Math.hypot(start.x,start.y)>=inner+e.radius&&Math.abs(angleDelta(ang,a.angle))<=55*Math.PI/180};
  }).filter(v=>v.valid&&v.t!==null).sort((a,b)=>a.t!-b.t!||a.id-b.id);
  const hit=hits[0];if(!hit)return;
  a.blocked=true;
  if(hit.shot)s.enemyShots=s.enemyShots?.filter(q=>q.id!==hit.shot!.id);
  else if(hit.enemy){const e=hit.enemy;e.contactSuppressedUntil=s.time+.15;
    if(!a.hitIds.includes(e.id)){a.hitIds.push(e.id);ctx.damage(e,WEAPONS.umbrella.damage,'umbrella');}if(e.hp>0)ctx.push(e,p,24);
  }
  ctx.emit({type:'defend',kind:'umbrella',x:p.x,y:p.y,victimId:hit.enemy?.id??hit.shot!.ownerId});
}
function updateProjectiles(s:GameState,dt:number,ctx:CombatContext):void {
  const remove=new Set<number>();
  for(const q of s.projectiles){
    q.px=q.x;q.py=q.y;
    if(q.kind==='lunchbox'){
      const t=Math.min(1,(s.time-q.bornAt)/.65);q.x=q.originX+(q.targetX-q.originX)*t;q.y=q.originY+(q.targetY-q.originY)*t;
      if(t>=1){const cfg=WEAPONS.lunchbox,list=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&distance(e,{x:q.targetX,y:q.targetY})<=cfg.width+e.radius).sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id).slice(0,cfg.limit);for(const e of list)ctx.damage(e,cfg.damage,'lunchbox');remove.add(q.id);}continue;
    }
    if(s.time>q.expiresAt){remove.add(q.id);continue;}
    if(q.kind==='talisman'&&q.phase==='chain'){
      if(s.time+1e-9<q.nextHitAt)continue;
      const target=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id)&&distance(e,q)<=WEAPONS.talisman.width).sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id)[0];
      if(!target){remove.add(q.id);continue;}q.x=target.x;q.y=target.y;q.hitIds.push(target.id);ctx.damage(target,[40,32,28,24][q.hits],'talisman');q.hits++;q.nextHitAt=s.time+.1;if(q.hits>=4)remove.add(q.id);continue;
    }
    if(q.kind==='spirit'){
      let target=s.enemies.find(e=>e.id===q.targetId&&ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id));
      const initialAngle=Math.atan2(q.targetY-q.originY,q.targetX-q.originX);
      if(target&&q.hits===0&&((target.x-q.originX)*Math.cos(initialAngle)+(target.y-q.originY)*Math.sin(initialAngle)<0)){target=undefined;q.targetId=-1;}
      if(!target&&q.hits>0&&q.retargets<1){
        target=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!q.hitIds.includes(e.id)&&distance(e,q)<=100).sort((a,b)=>distance(a,q)-distance(b,q)||a.id-b.id)[0];q.retargets++;q.targetId=target?.id??-1;
      }
      // No valid initial target still produces a forward flying orb. Never acquire a rear enemy.
      if(target){const desired=Math.atan2(target.y-q.y,target.x-q.x),current=Math.atan2(q.vy,q.vx),delta=Math.max(-Math.PI*dt,Math.min(Math.PI*dt,angleDelta(desired,current)));q.vx=Math.cos(current+delta)*360;q.vy=Math.sin(current+delta)*360;}
    }
    if(q.kind==='tray'&&q.phase==='return'){
      const d=distance(q,s.player);if(d<17){remove.add(q.id);continue;}q.vx=(s.player.x-q.x)/d*513;q.vy=(s.player.y-q.y)/d*513;
    }
    let travel=Math.hypot(q.vx,q.vy)*dt;
    if(q.phase==='out')travel=Math.min(travel,Math.max(0,q.maxDistance-q.travelled));
    const speed=Math.hypot(q.vx,q.vy);q.x+=q.vx/(speed||1)*travel;q.y+=q.vy/(speed||1)*travel;q.travelled+=travel;
    const hits=s.enemies.filter(e=>ctx.active(e)&&e.hp>0&&!(q.kind==='tray'?q.phaseHitIds:q.hitIds).includes(e.id)).map(e=>({e,t:relativeSweep({x:q.px,y:q.py},q,{x:e.px,y:e.py},e,q.radius+e.radius)})).filter(v=>v.t!==null).sort((a,b)=>a.t!-b.t!||a.e.id-b.e.id);
    for(const {e} of hits){
      if(q.kind==='tray'&&q.phaseHitIds.length>=4)break;
      const damage=q.kind==='bag'?24:q.kind==='chopsticks'?[42,36,32,28,24][q.hits]:q.kind==='spirit'?[40,30][q.hits]:q.kind==='talisman'?40:q.phase==='out'?32:26;
      if(!damage)break;
      q.hitIds.push(e.id);q.phaseHitIds.push(e.id);q.hits++;ctx.damage(e,damage,q.kind);
      if(q.kind==='talisman'){q.phase='chain';q.x=e.x;q.y=e.y;q.nextHitAt=s.time+.1;break;}
      if(q.kind==='bag'||q.kind==='chopsticks'&&q.hits>=5||q.kind==='spirit'&&q.hits>=2||q.kind==='tray'&&q.hits>=8){remove.add(q.id);break;}
      if(q.kind==='spirit')q.targetId=-1;
    }
    if(q.phase==='out'&&q.travelled>=q.maxDistance-1e-8){
      if(q.kind==='tray'){q.phase='return';q.phaseHitIds=[];}else remove.add(q.id);
    }
  }
  s.projectiles=s.projectiles.filter(q=>!remove.has(q.id));
}
export function updateWeapons(s:GameState,dt:number,ctx:CombatContext):void {
  updateProjectiles(s,dt,ctx);
  let a=s.weapon.attack;
  if(a){
    if(a.phase==='windup'){
      a.angle=movementAngle(s);
      if(s.time+1e-9>=a.releaseAt)release(s,a,ctx);
    }
    a=s.weapon.attack;
    if(a?.phase==='active'){
      umbrella(s,a,dt,ctx);melee(s,a,ctx);
      if(s.time>=a.endsAt){a.phase='recovery';a.endsAt=s.time+.16;}
    }else if(a?.phase==='recovery'&&s.time>=a.endsAt)s.weapon.attack=null;
  }
  if(s.weapon.attack||s.time+1e-9<s.weapon.readyAt)return;
  const kind=s.weapon.kind,cfg=WEAPONS[kind];
  if(['bag','chopsticks','spirit','tray','lunchbox','talisman'].includes(kind)&&s.projectiles.length+(kind==='bag'?5:1)>CONFIG.weapons.projectileCap)return;
  if(kind==='lunchbox'&&s.projectiles.filter(p=>p.kind==='lunchbox').length>=2)return;
  s.weapon.targetId=null;
  s.weapon.attack={id:ctx.id(),kind,phase:'windup',startedAt:s.time,releaseAt:s.time+cfg.windup,endsAt:s.time+cfg.windup+cfg.active,angle:movementAngle(s),targetId:-1,hitIds:[],blocked:false};
  s.weapon.readyAt=s.time+cfg.windup+cfg.cooldown*(s.player.heatUntil>s.time?.8:1);
}
