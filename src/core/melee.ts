import type {Enemy, GameState, MeleeKind, MeleeWave, MeleeWaveSlice, Vec, WeaponAttack, WeaponKind} from '../shared/types';
import type {CombatContext} from './contracts';
import {clamp, segmentDistanceSquared, sweepContact} from './geometry';

export const MELEE_WEAPONS = {
  tongs:    {bodyReach:72,range:260,waveSpeed:1000,waveWidth:22,windup:.05, cooldown:.32, active:.14,damage:54,limit:7, width:14,sweep:226},
  knife:    {bodyReach:64,range:215,waveSpeed:1120,waveWidth:14,windup:.065,cooldown:.465,active:.16,damage:62,limit:10,width:16,sweep:252},
  umbrella: {bodyReach:70,range:205,waveSpeed:760, waveWidth:26,windup:.08, cooldown:.76, active:.30,damage:66,limit:9, width:36,sweep:208},
  sword:    {bodyReach:98,range:310,waveSpeed:900, waveWidth:32,windup:.14, cooldown:.96, active:.24,damage:110,limit:10,width:24,sweep:218},
} as const;
export type {MeleeKind} from '../shared/types';
export const isMelee = (kind:WeaponKind): kind is MeleeKind => Object.hasOwn(MELEE_WEAPONS, kind);

/** World-space pose shared by contact detection and the courier's held weapon.
 * A rod has a round cap of the given radius. An open umbrella fills a sector. */
export interface MeleePose {angle:number; reach:number; radius:number; halfAngle:number}
const radians = Math.PI / 180;
const origin = {x:0, y:0};
const mix = (a:number,b:number,t:number) => a + (b-a)*t;
const unit = (t:number) => clamp(t,0,1);

export function meleePose(attack:WeaponAttack, time:number): MeleePose | null {
  const {kind} = attack;
  if (!isMelee(kind)) return null;
  const cfg = MELEE_WEAPONS[kind];
  const phase = unit((time-attack.releaseAt)/cfg.active);
  const windup = unit((time-attack.startedAt)/cfg.windup);
  const activeEnd = attack.releaseAt+cfg.active;
  const recovery = attack.phase==='recovery' ? unit((time-activeEnd)/Math.max(.001,attack.endsAt-activeEnd)) : 0;
  // The knife flicks quickly into its cut. The heavy ruler gathers speed
  // after release; tongs and the open umbrella stay even through the pass.
  const progress = kind==='sword' ? phase*(.52+.48*phase)
    : kind==='knife' ? phase*(1.3-.3*phase) : phase;
  const side = attack.swingSide ?? 1;
  const angle = attack.angle+side*cfg.sweep*radians/2*(2*progress-windup)*(1-recovery);
  const radius = kind==='umbrella' ? 0 : cfg.width/2;
  const halfAngle = kind==='umbrella' ? cfg.width*radians/2 : 0;
  let reach:number = cfg.bodyReach;
  if (kind==='tongs') reach *= .78 + .22*Math.min(1,phase/.23,(1-phase)/.23);
  if (kind==='sword') reach *= .78 + .22*unit(phase/.32);
  if (time<attack.releaseAt) reach = mix(32,reach,windup);
  return {angle, reach:mix(reach,32,recovery), radius, halfAngle};
}

// Clip the time interval to values where a linearly changing constraint is nonnegative.
function clip(interval:[number,number], a:number, b:number):boolean {
  if (a<0 && b<0) return false;
  if (a<0) interval[0]=Math.max(interval[0],a/(a-b));
  if (b<0) interval[1]=Math.min(interval[1],a/(a-b));
  return interval[0]<=interval[1];
}
function earliest(...hits:(number|null)[]):number|null {
  let first:number|null = null;
  for (const hit of hits) if (hit!==null && (first===null || hit<first)) first=hit;
  return first;
}
function rotateInto(point:Vec,cos:number,sin:number):Vec {
  return {x:point.x*cos+point.y*sin,y:point.y*cos-point.x*sin};
}
function between(a:Vec,b:Vec,t:number):Vec {
  return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)};
}

/** Capsule along +x with a moving tip. All coordinates are relative to the moving player. */
function rodContact(a:Vec,b:Vec,lengthA:number,lengthB:number,radius:number):number|null {
  const interval:[number,number]=[0,1];
  const inside=clip(interval,a.x,b.x) && clip(interval,lengthA-a.x,lengthB-b.x) &&
    clip(interval,radius+a.y,radius+b.y) && clip(interval,radius-a.y,radius-b.y);
  return earliest(inside ? interval[0] : null, sweepContact(a,b,origin,radius),
    sweepContact({x:a.x-lengthA,y:a.y},{x:b.x-lengthB,y:b.y},origin,radius));
}

/** A disk can graze either radial edge of the open umbrella or enter through the outer arc. */
function sectorContact(a:Vec,b:Vec,reach:number,halfAngle:number,radius:number):number|null {
  const cos=Math.cos(halfAngle),sin=Math.sin(halfAngle);
  const interval:[number,number]=[0,1];
  let arc:number|null=null;
  if (clip(interval,a.x*sin+a.y*cos,b.x*sin+b.y*cos) && clip(interval,a.x*sin-a.y*cos,b.x*sin-b.y*cos)) {
    const t=sweepContact(between(a,b,interval[0]),between(a,b,interval[1]),origin,reach+radius);
    if (t!==null) arc=mix(interval[0],interval[1],t);
  }
  return earliest(arc,
    rodContact(rotateInto(a,cos,sin),rotateInto(b,cos,sin),reach,reach,radius),
    rodContact(rotateInto(a,cos,-sin),rotateInto(b,cos,-sin),reach,reach,radius));
}

interface Contact {enemy:Enemy; contact:number; impactAngle:number; distance:number}
function bodyContacts(s:GameState,attack:WeaponAttack,dt:number,ctx:CombatContext,hits:Contact[]):void {
  if (!isMelee(attack.kind)) return;
  const cfg=MELEE_WEAPONS[attack.kind];
  if (attack.hitIds.length>=cfg.limit) return;
  const tickStart=s.time-dt, start=Math.max(tickStart,attack.releaseAt), end=Math.min(s.time,attack.endsAt);
  if (end<start-1e-9) return;
  const first=meleePose(attack,start)!;
  // Transform both ends of each relative-motion segment into the rotating blade frame.
  // At <= 4 degrees per slice the longest blade's angular chord error is under 0.06 units.
  // The fastest point of the eased sword stroke runs at 1.48× its average speed.
  const slices=Math.max(1,Math.ceil((end-start)*cfg.sweep*1.5/(cfg.active*4)));
  const frames=Array.from({length:slices+1},(_,i)=>{
    const time=mix(start,end,i/slices),pose=meleePose(attack,time)!;
    return {pose,t:unit((time-tickStart)/dt),cos:Math.cos(pose.angle),sin:Math.sin(pose.angle)};
  });
  for (const enemy of s.enemies) {
    if (!ctx.active(enemy) || enemy.hp<=0 || attack.hitIds.includes(enemy.id)) continue;
    const a={x:enemy.px-s.player.px,y:enemy.py-s.player.py};
    const b={x:enemy.x-s.player.x,y:enemy.y-s.player.y};
    if (segmentDistanceSquared(a,b,origin)>(cfg.bodyReach+first.radius+enemy.radius)**2) continue;
    let previous=rotateInto(between(a,b,frames[0].t),frames[0].cos,frames[0].sin);
    for (let i=1;i<frames.length;i++) {
      const prior=frames[i-1],next=frames[i];
      const current=rotateInto(between(a,b,next.t),next.cos,next.sin);
      const t=next.pose.halfAngle ? sectorContact(previous,current,next.pose.reach,next.pose.halfAngle,enemy.radius)
        : rodContact(previous,current,prior.pose.reach,next.pose.reach,enemy.radius+next.pose.radius);
      if (t!==null) {
        const contact=mix(prior.t,next.t,t),point=between(a,b,contact);
        const angle=mix(prior.pose.angle,next.pose.angle,t);
        const impactAngle=attack.kind==='umbrella' ? Math.atan2(point.y,point.x)
          : angle+(attack.swingSide??1)*Math.PI/2;
        hits.push({enemy,contact,impactAngle,distance:point.x**2+point.y**2});
        break;
      }
      previous=current;
    }
  }
}

/** The moving band leaves the tool tip and thins as it reaches maximum range. */
function bandAt(kind:MeleeKind,slice:MeleeWaveSlice,time:number) {
  const cfg=MELEE_WEAPONS[kind];
  const front=slice.startRadius+(time-slice.bornAt)*cfg.waveSpeed;
  return {
    inner:Math.min(cfg.range,front-cfg.waveWidth),
    outer:Math.min(cfg.range,front),
    progress:unit((front-slice.startRadius)/(cfg.range-slice.startRadius)),
  };
}
export function meleeWaveBand(wave:MeleeWave,slice:MeleeWaveSlice,time:number) {
  if(time<slice.bornAt) return null;
  const band=bandAt(wave.kind,slice,time);
  return band.inner<band.outer ? band : null;
}

// Inverse of the blade easing, so each emitted strip covers a similar angular width.
function timeAtAngle(kind:MeleeKind,progress:number):number {
  if(kind==='sword') return 2*progress/(.52+Math.sqrt(.52**2+1.92*progress));
  if(kind==='knife') return 2*progress/(1.3+Math.sqrt(1.3**2-1.2*progress));
  return progress;
}
function emitSlices(s:GameState,attack:WeaponAttack,wave:MeleeWave,dt:number):void {
  const cfg=MELEE_WEAPONS[wave.kind], count=Math.ceil(cfg.sweep/12);
  const side=attack.swingSide??1, step=cfg.sweep*radians/count;
  const startAngle=attack.angle-side*cfg.sweep*radians/2;
  const panel=wave.kind==='umbrella' ? cfg.width*radians/2 : 0;
  while(wave.nextSlice<=count) {
    const i=wave.nextSlice;
    const bornAt=wave.releaseAt+cfg.active*timeAtAngle(wave.kind,i/count);
    if(bornAt>s.time+1e-9) break;
    const low=i===0 ? -panel : (i-.5)*step+panel;
    const high=Math.min(count,i+.5)*step+panel;
    const pos=unit((bornAt-(s.time-dt))/dt);
    wave.slices.push({
      x:mix(s.player.px,s.player.x,pos),y:mix(s.player.py,s.player.y,pos),
      angle:startAngle+side*(low+high)/2,halfAngle:(high-low)/2,bornAt,
      startRadius:meleePose(attack,bornAt)!.reach,
    });
    wave.nextSlice++;
  }
}

// Candidate times when the enemy centre crosses a linearly expanding circle.
function circleCrossings(a:Vec,b:Vec,ra:number,rb:number,times:number[]):void {
  const dx=b.x-a.x,dy=b.y-a.y,dr=rb-ra;
  const quadratic=dx*dx+dy*dy-dr*dr,linear=2*(a.x*dx+a.y*dy-ra*dr);
  const constant=a.x*a.x+a.y*a.y-ra*ra;
  if(Math.abs(quadratic)<1e-9) {
    if(Math.abs(linear)>1e-9) times.push(-constant/linear);
    return;
  }
  const discriminant=linear**2-4*quadratic*constant;
  if(discriminant<0) return;
  const root=Math.sqrt(discriminant);
  times.push((-linear-root)/(2*quadratic),(-linear+root)/(2*quadratic));
}
type Band=ReturnType<typeof bandAt>;
function bandContact(a:Vec,b:Vec,start:Band,end:Band,cos:number,sin:number,radius:number):number|null {
  // Inside the angle wedge, a disk first meets a radial boundary. Outside it,
  // the nearest point is on one of the two moving radial edge segments.
  const interval:[number,number]=[0,1];
  let first:number|null=null;
  if(clip(interval,a.x*sin+a.y*cos,b.x*sin+b.y*cos) && clip(interval,a.x*sin-a.y*cos,b.x*sin-b.y*cos)) {
    const times=[interval[0],interval[1]];
    circleCrossings(a,b,start.inner-radius,end.inner-radius,times);
    circleCrossings(a,b,start.outer+radius,end.outer+radius,times);
    for(const t of times) {
      if(t<interval[0] || t>interval[1] || (first!==null && t>=first)) continue;
      const d=Math.hypot(mix(a.x,b.x,t),mix(a.y,b.y,t));
      if(d+radius>=mix(start.inner,end.inner,t)-1e-7 && d-radius<=mix(start.outer,end.outer,t)+1e-7) first=t;
    }
  }
  for(const edge of [sin,-sin]) {
    const from=rotateInto(a,cos,edge),to=rotateInto(b,cos,edge);
    from.x-=start.inner;to.x-=end.inner;
    first=earliest(first,rodContact(from,to,start.outer-start.inner,end.outer-end.inner,radius));
  }
  return first;
}

function waveContacts(s:GameState,wave:MeleeWave,slice:MeleeWaveSlice,dt:number,ctx:CombatContext,hits:Contact[]):void {
  const cfg=MELEE_WEAPONS[wave.kind],tickStart=s.time-dt;
  const frontAtLimit=slice.bornAt+(cfg.range-slice.startRadius)/cfg.waveSpeed;
  const from=Math.max(tickStart,slice.bornAt),until=Math.min(s.time,frontAtLimit+cfg.waveWidth/cfg.waveSpeed);
  if(until<from) return;
  // Once the front reaches its limit only the inner edge moves.
  const times=from<frontAtLimit && frontAtLimit<until ? [from,frontAtLimit,until] : [from,until];
  const cos=Math.cos(slice.angle),sin=Math.sin(slice.angle);
  const edgeCos=Math.cos(slice.halfAngle),edgeSin=Math.sin(slice.halfAngle);
  for(let i=1;i<times.length;i++) {
    const start=bandAt(wave.kind,slice,times[i-1]),end=bandAt(wave.kind,slice,times[i]);
    const t0=unit((times[i-1]-tickStart)/dt),t1=unit((times[i]-tickStart)/dt);
    const centre=(start.inner+end.outer)/2;
    const extent=(end.outer-start.inner)/2+end.outer*2*Math.sin(slice.halfAngle/2);
    const x=slice.x+centre*cos,y=slice.y+centre*sin;
    for(const enemy of s.enemies) {
      if(enemy.hp<=0 || wave.hitIds.includes(enemy.id) || !ctx.active(enemy)) continue;
      const bound=extent+enemy.radius;
      if(Math.min(enemy.px,enemy.x)>x+bound || Math.max(enemy.px,enemy.x)<x-bound ||
         Math.min(enemy.py,enemy.y)>y+bound || Math.max(enemy.py,enemy.y)<y-bound) continue;
      const a=rotateInto({x:mix(enemy.px,enemy.x,t0)-slice.x,y:mix(enemy.py,enemy.y,t0)-slice.y},cos,sin);
      const b=rotateInto({x:mix(enemy.px,enemy.x,t1)-slice.x,y:mix(enemy.py,enemy.y,t1)-slice.y},cos,sin);
      const t=bandContact(a,b,start,end,edgeCos,edgeSin,enemy.radius);
      if(t!==null) {
        const pt=between(a,b,t);
        hits.push({enemy,contact:mix(t0,t1,t),impactAngle:slice.angle+Math.atan2(pt.y,pt.x),distance:pt.x**2+pt.y**2});
      }
    }
  }
}

export function updateMelee(s:GameState,attack:WeaponAttack|null,dt:number,ctx:CombatContext):void {
  let current:MeleeWave|undefined;
  if(attack && isMelee(attack.kind)) {
    current=s.meleeWaves.find(w=>w.id===attack.id);
    if(!current) {
      current={id:attack.id,kind:attack.kind,swingSide:attack.swingSide??1,releaseAt:attack.releaseAt,hitIds:attack.hitIds,slices:[],nextSlice:0};
      s.meleeWaves.push(current);
    }
    emitSlices(s,attack,current,dt);
  }
  for(const wave of s.meleeWaves) {
    const cfg=MELEE_WEAPONS[wave.kind];
    if(wave.hitIds.length<cfg.limit && s.enemies.length) {
      const hits:Contact[]=[];
      if(wave===current && attack) bodyContacts(s,attack,dt,ctx,hits);
      for(const slice of wave.slices) waveContacts(s,wave,slice,dt,ctx,hits);
      hits.sort((a,b)=>a.contact-b.contact || a.distance-b.distance || a.enemy.id-b.enemy.id);
      for(const {enemy,impactAngle} of hits) {
        if(wave.hitIds.length===cfg.limit) break;
        if(wave.hitIds.includes(enemy.id)) continue;
        wave.hitIds.push(enemy.id);
        ctx.damage(enemy,cfg.damage,wave.kind,impactAngle,wave.id);
      }
    }
    wave.slices=wave.slices.filter(slice=>meleeWaveBand(wave,slice,s.time)!==null || s.time<slice.bornAt);
  }
  if(s.meleeWaves.length) s.meleeWaves=s.meleeWaves.filter(w=>w===current || w.slices.length>0);
}
