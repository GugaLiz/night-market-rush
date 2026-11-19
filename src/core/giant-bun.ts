import type {Enemy,GameState,GiantHop,GiantPulse,Player,Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD} from './config';
import {clamp,sweepContact} from './geometry';

const tuning=CONFIG.giant;
const middle=(WORLD.bounds.left+WORLD.bounds.right)/2;
const floorMiddle=(CONFIG.player.minY+WORLD.bounds.bottom)/2;
const landingOffset=(WORLD.bounds.right-WORLD.bounds.left)*.35;

function warn(s:GameState,e:Enemy,hop:GiantHop,ctx:CombatContext):void {
  const right=e.x<middle;
  const margin=tuning.stompRadius+10;
  const target={
    x:clamp(e.lureX??s.player.x,right?middle+landingOffset:WORLD.bounds.left+margin,
      right?WORLD.bounds.right-margin:middle-landingOffset),
    y:clamp(e.lureY??s.player.y,CONFIG.player.minY+24,WORLD.bounds.bottom-margin),
  };
  const inward=Math.atan2(floorMiddle-target.y,middle-target.x);
  const offset=(ctx.random()<.5?-1:1)*(.68+ctx.random()*.23);
  let gapAngle=inward+offset;
  // Turn the escape corridor into the arena even when a target is at the top or bottom.
  const exitY=target.y+Math.sin(gapAngle)*160;
  if(exitY<CONFIG.player.minY||exitY>WORLD.bounds.bottom-CONFIG.player.radius)gapAngle=inward-offset;
  const windup=(hop===3?tuning.finalWarning:tuning.warning)*(e.slowUntil>s.time?1.3:1);
  e.jump={phase:'warn',hop,startedAt:s.time,until:s.time+windup,
    from:{x:e.x,y:e.y},target,gapAngle};
  e.facing=right?1:-1;
  ctx.emit({type:'warn',x:target.x,y:target.y});
}

export function updateGiant(s:GameState,e:Enemy,ctx:CombatContext):void {
  if(s.time-e.spawnAt<CONFIG.spawn.warning-1e-9)return;
  const j=e.jump;
  if(e.stunUntil>s.time && j?.phase!=='flight'){
    if(j?.phase==='warn')delete e.jump;
    return;
  }
  if(!j){warn(s,e,1,ctx);return;}
  if(j.phase==='rest'){
    if(s.time+1e-9>=j.until)warn(s,e,j.hop===1?2:j.hop===2?3:1,ctx);
    return;
  }
  if(j.phase==='warn'){
    if(s.time+1e-9<j.until)return;
    j.from={x:e.x,y:e.y};
    j.phase='flight';j.startedAt=s.time;j.until=s.time+tuning.flight;
    return;
  }
  const u=clamp((s.time-j.startedAt)/tuning.flight,0,1);
  // Horizontal travel and the shadow share the same continuous grounded projection.
  const travel=u*u*(3-2*u);
  e.x=j.from.x+(j.target.x-j.from.x)*travel;
  e.y=j.from.y+(j.target.y-j.from.y)*travel;
  if(s.time+1e-9<j.until)return;
  e.x=j.target.x;e.y=j.target.y;
  // The last aerial segment is never a ground weapon/contact sweep.
  e.px=e.x;e.py=e.y;
  j.phase='rest';j.startedAt=s.time;j.until=s.time+(j.hop===3?tuning.recovery:tuning.between);
  const b=WORLD.bounds;
  const reach=j.hop===3?Math.hypot(Math.max(e.x-b.left,b.right-e.x),
    Math.max(e.y-b.top,b.bottom-e.y))+tuning.pulseHalfWidth+CONFIG.player.radius:tuning.stompRadius;
  (s.giantPulses??=[]).push({id:ctx.id(),hop:j.hop,x:e.x,y:e.y,bornAt:s.time,
    gapAngle:j.gapAngle,reach,spent:false});
  ctx.emit({type:'giantLand',x:e.x,y:e.y,hop:j.hop});
}

export const giantPulseRadius=(pulse:GiantPulse,time:number):number=>
  clamp((time-pulse.bornAt)*tuning.pulseSpeed,0,pulse.reach);

export function giantPulseLifetime(p:GiantPulse):number{
  return p.hop===3?p.reach/tuning.pulseSpeed:tuning.printLifetime;
}

export function giantJumpHeight(e:Enemy,time:number):number{
  const j=e.jump;
  if(j?.phase!=='flight')return 0;
  const u=clamp((time-j.startedAt)/(j.until-j.startedAt),0,1);
  return 4*u*(1-u)*(j.hop===3?113:86);
}

/** Intersect the swept player with the two moving edges and both lips of the safe wedge.
 * Keeping the intervals also detects a player crossing the entire wave in one fast step. */
export function giantPulseContact(w:GiantPulse,p:Player,time:number,dt:number):number|null{
  if(w.spent || (w.hop!==3 && time-w.bornAt>tuning.localDuration))return null;
  const justLanded=time-dt<w.bornAt-1e-9;
  const start=justLanded?p:{x:p.px,y:p.py};
  if(w.hop!==3)return sweepContact(start,p,w,tuning.stompRadius+p.radius);
  const ax=start.x-w.x,ay=start.y-w.y,dx=p.x-start.x,dy=p.y-start.y;
  const radius=giantPulseRadius(w,time-dt),growth=giantPulseRadius(w,time)-radius;
  const width=tuning.pulseHalfWidth+p.radius;
  const times=[0,1];
  function add(t:number){if(t>0&&t<1)times.push(t);}
  for(const edge of [radius-width,radius+width]){
    const a=dx*dx+dy*dy-growth*growth,b=2*(ax*dx+ay*dy-edge*growth);
    const c=ax*ax+ay*ay-edge*edge;
    if(Math.abs(a)<1e-9){if(Math.abs(b)>1e-9)add(-c/b);continue;}
    const d=b*b-4*a*c;
    if(d<0)continue;
    const root=Math.sqrt(d);add((-b-root)/(2*a));add((-b+root)/(2*a));
  }
  for(const lip of [w.gapAngle-tuning.gapHalfAngle,w.gapAngle+tuning.gapHalfAngle]){
    const x=Math.cos(lip),y=Math.sin(lip),speed=dx*y-dy*x;
    if(Math.abs(speed)>1e-9)add((ay*x-ax*y)/speed);
  }
  times.sort((a,b)=>a-b);
  const inWave=(t:number)=>{
    const x=ax+dx*t,y=ay+dy*t,d=Math.hypot(x,y);
    const outsideGap=d<1e-6 || x*Math.cos(w.gapAngle)+y*Math.sin(w.gapAngle)<=d*Math.cos(tuning.gapHalfAngle);
    return outsideGap&&Math.abs(d-(radius+growth*t))<=width+1e-8;
  };
  for(let i=0;i<times.length;i++){
    const t=times[i];
    if(inWave(t)||(i+1<times.length&&inWave((t+times[i+1])/2)))return t;
  }
  return null;
}
