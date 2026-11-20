import type {ElementalField, ElementalKind, Enemy, GameState, Vec} from '../shared/types';
import {WORLD,enemyMinY} from './config';
import type {CombatContext} from './contracts';
import {interruptAttack, stunEnemy} from './enemies';
import {clamp, distanceSquared, relativeSweep, segmentDistanceSquared, sweepContact} from './geometry';

export const ELEMENTAL = {
  vortex: {duration:3.2, fade:.55, blastRadius:150, damage:108, offset:165},
  poison: {duration:5.5, fade:.45, radius:230, growth:.55, interval:.5, linger:3, damage:12},
  frost:  {duration:3, fade:.55, radius:370, growth:.8, damage:68, shardReach:135, shardRadius:12, shardDamage:24},
} as const;

const bounds = WORLD.bounds;
const entireStreet = Math.hypot(bounds.right-bounds.left, bounds.bottom-bounds.top);
const epsilon = 1e-9;

/** The opening disc and its collisions follow the same easing curve. */
export function elementalRadius(field:ElementalField, time:number):number {
  if(time < field.bornAt || time >= field.expiresAt) return 0;
  if(field.kind === 'vortex') return field.radius;
  const growth = clamp((time-field.bornAt)/ELEMENTAL[field.kind].growth, 0, 1);
  return field.radius*growth*(2-growth);
}

function vortexCenter(origin:Vec, facing:Vec):Vec {
  const offset = ELEMENTAL.vortex.offset;
  // At a wall, cast back into the street so the crowd does not land on the rider.
  const dx = facing.x*offset, dy = facing.y*offset, margin = 44;
  const reflect = (value:number, step:number, low:number, high:number) =>
    value+step < low || value+step > high ? value-step : value+step;
  return {
    x:clamp(reflect(origin.x, dx, bounds.left+margin, bounds.right-margin), bounds.left+margin, bounds.right-margin),
    y:clamp(reflect(origin.y, dy, bounds.top+margin, bounds.bottom-margin), bounds.top+margin, bounds.bottom-margin),
  };
}

function pullEnemy(enemy:Enemy, field:ElementalField, now:number, dt:number):void {
  stunEnemy(enemy, field.releaseAt);
  enemy.contactSuppressedUntil = Math.max(enemy.contactSuppressedUntil, field.releaseAt+.18);
  const x = enemy.x-field.x, y = enemy.y-field.y;
  const distance = Math.hypot(x,y);
  // A loose spiral keeps individual monsters visible before the mouth collapses at the end.
  const closing = clamp((field.releaseAt-now)/.46,0,1);
  const orbit = (22+(enemy.id*13)%53)*closing;
  const speed = (115+distance*1.48)*(enemy.kind==='giantBun'?.75:1);
  const radius = distance+clamp(orbit-distance,-speed*dt,speed*dt);
  const heading = distance<.01?enemy.id*2.4:Math.atan2(y,x);
  const angle = heading+dt*(.48+(1.65+enemy.id%5*.18)*(1-clamp(distance/275,0,1)));
  enemy.x = clamp(field.x+Math.cos(angle)*radius, bounds.left+enemy.radius, bounds.right-enemy.radius);
  enemy.y = clamp(field.y+Math.sin(angle)*radius, enemyMinY(enemy.kind,enemy.radius), bounds.bottom-enemy.radius);
}

export function coatEnemy(enemy:Enemy, now:number):void {
  if(enemy.poisonNextAt===undefined || (enemy.poisonUntil??0)+epsilon < now){
    enemy.poisonNextAt = now+ELEMENTAL.poison.interval;
  }
  enemy.poisonUntil = Math.max(enemy.poisonUntil??0,now+ELEMENTAL.poison.linger);
}

function freezeEnemy(enemy:Enemy, field:ElementalField, now:number):void {
  if(enemy.frostFieldId===field.id) return;
  enemy.frostFieldId = field.id;
  enemy.frostUntil = field.releaseAt;
  interruptAttack(enemy,now);
}

function along(start:Vec,end:Vec,fraction:number):Vec {
  return {x:start.x+(end.x-start.x)*fraction,y:start.y+(end.y-start.y)*fraction};
}

/** Return the first instant the tray overlaps live mist, as a fraction of this leg's movement. */
export function trayBrineContact(field:ElementalField,start:Vec,end:Vec,radius:number,from:number,duration:number):number|null {
  if(duration<=0 || from>=field.releaseAt || from+duration<field.bornAt) return null;
  const low=clamp((field.bornAt-from)/duration,0,1), high=clamp((field.releaseAt-from)/duration,0,1);
  const a=along(start,end,low), b=along(start,end,high);
  const touch=sweepContact(a,b,field,radius+elementalRadius(field,from+duration*high));
  if(touch===null) return null;
  let left=low+(high-low)*touch, right=high;
  const gap=(t:number)=>Math.hypot(start.x+(end.x-start.x)*t-field.x,start.y+(end.y-start.y)*t-field.y)
    -radius-elementalRadius(field,from+duration*t);
  if(gap(left)>epsilon){
    if(gap(right)>epsilon){
      // Both endpoints can miss a grazing crossing. Distance minus the expanding radius is convex.
      let lo=left, hi=right;
      for(let i=0;i<34;i++){
        const third=(hi-lo)/3;
        if(gap(lo+third)<=gap(hi-third)) hi-=third;
        else lo+=third;
      }
      right=(lo+hi)/2;
      if(gap(right)>epsilon) return null;
    }
    for(let i=0;i<30;i++){
      const middle=(left+right)/2;
      if(gap(middle)<=epsilon) right=middle;
      else left=middle;
    }
    left=right;
  }
  return from+left*duration<field.releaseAt ? left : null;
}

function sendIceShards(s:GameState,source:Enemy,direction:Vec,fraction:number,ctx:CombatContext):void {
  const {shardReach,shardRadius,shardDamage}=ELEMENTAL.frost;
  const origin=along({x:source.px,y:source.py},source,fraction);
  const end={x:origin.x+direction.x*shardReach,y:origin.y+direction.y*shardReach};
  const angle=Math.atan2(direction.y,direction.x);
  ctx.emit({type:'iceShards',...origin,angle,reach:shardReach});
  for(const enemy of s.enemies){
    if(enemy===source || !ctx.active(enemy)) continue;
    const at=along({x:enemy.px,y:enemy.py},enemy,fraction);
    if((at.x-origin.x)*direction.x+(at.y-origin.y)*direction.y<=0) continue;
    if(segmentDistanceSquared(origin,end,at)<=(shardRadius+enemy.radius)**2) ctx.damage(enemy,shardDamage,'frost',angle);
  }
}

export function shatterOnDash(s:GameState,dt:number,ctx:CombatContext):void {
  const p=s.player, dashUntil=p.dashUntil??0, previous=s.time-dt;
  if(s.market?.upgrade!=='frost' || dashUntil<=previous+epsilon || dt<=0) return;
  const start={x:p.px,y:p.py}, dx=p.x-start.x, dy=p.y-start.y, distance=Math.hypot(dx,dy);
  if(distance<=epsilon) return;
  const live=clamp((dashUntil-previous)/dt,0,1);
  const contacts:{enemy:Enemy;fraction:number}[]=[];
  for(const enemy of s.enemies){
    const thaw=enemy.frostUntil;
    if(thaw===undefined || !ctx.active(enemy)) continue;
    const t=relativeSweep(start,p,{x:enemy.px,y:enemy.py},enemy,p.radius+enemy.radius);
    if(t!==null && t<=live && previous+t*dt<thaw-epsilon) contacts.push({enemy,fraction:t});
  }
  contacts.sort((a,b)=>a.fraction-b.fraction || a.enemy.id-b.enemy.id);
  const angle=Math.atan2(dy,dx);
  for(const {enemy,fraction} of contacts){
    if(!ctx.active(enemy)) continue;
    delete enemy.frostUntil;
    ctx.emit({type:'frostShatter',kind:enemy.kind,angle,...along({x:enemy.px,y:enemy.py},enemy,fraction)});
    ctx.damage(enemy,ELEMENTAL.frost.damage,'frost',angle);
    if(s.effects.frostShardDashUntil===dashUntil) continue;
    s.effects.frostShardDashUntil=dashUntil;
    sendIceShards(s,enemy,{x:dx/distance,y:dy/distance},fraction,ctx);
  }
}

function updateField(s:GameState, field:ElementalField, dt:number, ctx:CombatContext):void {
  const previousTime = s.time-dt;
  if(s.time+epsilon >= field.releaseAt){
    if(field.released) return;
    field.released = true;
    if(field.kind !== 'poison'){
      ctx.emit({type:'elementalBurst',kind:field.kind,x:field.x,y:field.y});
    }
    if(field.kind === 'vortex'){
      for(const enemy of s.enemies){
        if(!ctx.active(enemy) || distanceSquared(enemy,field) > (ELEMENTAL.vortex.blastRadius+enemy.radius)**2) continue;
        ctx.damage(enemy,ELEMENTAL.vortex.damage,'vortex');
        if(enemy.hp>0) ctx.push(enemy,field,28);
      }
    }
    return;
  }
  if(field.kind==='frost' && previousTime >= field.bornAt+ELEMENTAL.frost.growth) return;
  const radius = elementalRadius(field,s.time);
  const previousRadius = elementalRadius(field,previousTime);
  for(const enemy of s.enemies){
    if(!ctx.active(enemy)) continue;
    if(field.kind==='vortex'){
      pullEnemy(enemy,field,s.time,dt);
      continue;
    }
    const previous = {x:enemy.px,y:enemy.py};
    if(segmentDistanceSquared(previous,enemy,field) > (radius+enemy.radius)**2) continue;
    if(field.kind==='poison'){
      coatEnemy(enemy,s.time);
    }else{
      // A target landing behind the advancing rim has already missed the wave.
      const far = Math.max(distanceSquared(previous,field),distanceSquared(enemy,field));
      if(far >= Math.max(0,previousRadius-enemy.radius)**2) freezeEnemy(enemy,field,s.time);
    }
  }
}

export function castElemental(s:GameState, kind:ElementalKind, origin:Vec, facing:Vec, ctx:CombatContext):void {
  const tuning = ELEMENTAL[kind], releaseAt = s.time+tuning.duration;
  const position = kind==='vortex' ? vortexCenter(origin,facing) : origin;
  const field:ElementalField = {
    id:ctx.id(),kind,x:position.x,y:position.y,bornAt:s.time,releaseAt,
    expiresAt:releaseAt+tuning.fade,released:false,
    radius:kind==='vortex'?entireStreet:ELEMENTAL[kind].radius,
  };
  s.elementalFields = (s.elementalFields??[]).filter(previous => previous.kind!==kind);
  s.elementalFields.push(field);
  updateField(s,field,0,ctx);
}

export function updateElementalFields(s:GameState, dt:number, ctx:CombatContext):void {
  const fields = s.elementalFields;
  if(!fields?.length) return;
  for(const field of fields) updateField(s,field,dt,ctx);
  if(fields.some(field=>s.time>=field.expiresAt)) s.elementalFields = fields.filter(field=>s.time<field.expiresAt);
}

/** Status deadlines belong to the victim, so walking out or replacing a field cannot erase them. */
export function updateElementalStatus(s:GameState, enemy:Enemy, ctx:CombatContext):void {
  const thaw = enemy.frostUntil;
  if(thaw!==undefined && s.time+epsilon>=thaw){
    delete enemy.frostUntil;
    ctx.damage(enemy,ELEMENTAL.frost.damage,'frost');
  }
  const until = enemy.poisonUntil, tick = enemy.poisonNextAt;
  if(until===undefined || tick===undefined) return;
  if(tick<=s.time+epsilon && tick<=until+epsilon){
    ctx.damage(enemy,ELEMENTAL.poison.damage,'poison');
    enemy.poisonNextAt = tick+ELEMENTAL.poison.interval;
  }
  if(s.time+epsilon>=until){
    delete enemy.poisonUntil;
    delete enemy.poisonNextAt;
  }
}
