import type {ElementalField, ElementalKind, Enemy, GameState, Vec} from '../shared/types';
import {WORLD} from './config';
import type {CombatContext} from './contracts';
import {stunEnemy} from './enemies';
import {clamp, distanceSquared, segmentDistanceSquared} from './geometry';

export const ELEMENTAL = {
  vortex: {duration:3.2, fade:.55, blastRadius:150, damage:108, offset:165},
  poison: {duration:5.5, fade:.45, radius:230, growth:.55, interval:.5, linger:3, damage:12},
  frost:  {duration:3, fade:.55, radius:370, growth:.8, damage:68},
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
  enemy.y = clamp(field.y+Math.sin(angle)*radius, bounds.top+enemy.radius, bounds.bottom-enemy.radius);
}

function coatEnemy(enemy:Enemy, now:number):void {
  if(enemy.poisonNextAt===undefined || (enemy.poisonUntil??0)+epsilon < now){
    enemy.poisonNextAt = now+ELEMENTAL.poison.interval;
  }
  enemy.poisonUntil = now+ELEMENTAL.poison.linger;
}

function freezeEnemy(enemy:Enemy, releaseAt:number):void {
  if((enemy.frostUntil??0) >= releaseAt) return;
  enemy.frostUntil = releaseAt;
  enemy.contactSuppressedUntil = Math.max(enemy.contactSuppressedUntil,releaseAt);
  stunEnemy(enemy,releaseAt);
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
      if(far >= Math.max(0,previousRadius-enemy.radius)**2) freezeEnemy(enemy,field.releaseAt);
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
