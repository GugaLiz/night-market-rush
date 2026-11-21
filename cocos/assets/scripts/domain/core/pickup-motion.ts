import type {Pickup,Vec} from '../shared/types';
import {CONFIG,WORLD,pickupReach} from './config';
import {clamp,distanceSquared,relativeSweep} from './geometry';

/** A drop samples its own trajectory without consuming randomness from waves or weapons. */
export function launchPickup(p:Pickup,seed:number):void {
  // Siblings leave the box together, keeping each option readable as it starts moving.
  let hash=Math.imul(seed^(p.groupId??p.id),0x45d9f3b);
  hash=Math.imul(hash^(hash>>>16),0x45d9f3b);
  hash=(hash^(hash>>>16))>>>0;
  const angle=(24+((hash>>>2)&255)*32/255)*Math.PI/180;
  const speed=CONFIG.pickup.driftMin+((hash>>>10)&255)/255*(CONFIG.pickup.driftMax-CONFIG.pickup.driftMin);
  p.vx??=Math.cos(angle)*speed*(hash&1?1:-1);
  p.vy??=Math.sin(angle)*speed*(hash&2?1:-1);
  p.px=p.x;p.py=p.y;
}

export function driftPickup(p:Pickup,seed:number,time:number,dt:number):void {
  if(p.vx===undefined||p.vy===undefined)launchPickup(p,seed);
  p.px=p.x;p.py=p.y;delete p.turns;
  if(p.retiringUntil||(p.pulledUntil??0)>time||(p.expiresAt??Infinity)<=time)return;
  // The hook owns the whole path during a pull. Supply choices finish dispensing before lift-off.
  const start=Math.max(time-dt,p.bornAt,p.readyAt??0);
  if(start>=time)return;
  const b=WORLD.bounds,left=b.left+p.radius,right=b.right-p.radius;
  const top=Math.max(CONFIG.player.minY,b.top+p.radius),bottom=b.bottom-p.radius;
  p.x=clamp(p.x,left,right);p.y=clamp(p.y,top,bottom);
  let vx=p.vx!,vy=p.vy!,remaining=time-start;
  if(remaining<dt-1e-9)p.turns=[{x:p.x,y:p.y,fraction:1-remaining/dt}];
  while(remaining>1e-10){
    const tx=vx===0?Infinity:((vx>0?right:left)-p.x)/vx;
    const ty=vy===0?Infinity:((vy>0?bottom:top)-p.y)/vy;
    const travel=Math.min(tx,ty,remaining);
    p.x+=vx*travel;p.y+=vy*travel;
    remaining-=travel;
    if(tx<=travel){p.x=vx>0?right:left;vx=-vx;}
    if(ty<=travel){p.y=vy>0?bottom:top;vy=-vy;}
    if(remaining>1e-10)(p.turns??=[]).push({x:p.x,y:p.y,fraction:1-remaining/dt});
  }
  p.vx=vx;p.vy=vy;
}

const interpolate=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Shared by the in-between render frame and the swept catch, including a corner reflection. */
export function pickupPositionAt(p:Pickup,fraction:number):Vec {
  let previous={x:p.px??p.x,y:p.py??p.y},start=0;
  for(const turn of p.turns??[]){
    if(fraction<turn.fraction)return interpolate(previous,turn,(fraction-start)/(turn.fraction-start));
    previous=turn;start=turn.fraction;
  }
  return interpolate(previous,p,start<1?(fraction-start)/(1-start):1);
}

/** Sweep both bodies along the part of the step in which this skill can actually be taken. */
export function skillContact(item:Pickup,from:Vec,to:Vec,time:number,dt:number){
  const ready=Math.max(item.bornAt,item.readyAt??0,item.disabledUntil??0);
  let start=clamp((ready-(time-dt))/dt,0,1);
  let rider=interpolate(from,to,start),drop=pickupPositionAt(item,start);
  const turns=item.turns??[];
  for(let i=0;i<=turns.length;i++){
    const end=i===turns.length?1:turns[i].fraction;
    if(end<start)continue;
    const nextDrop=i===turns.length?item:turns[i],nextRider=interpolate(from,to,end);
    const hit=relativeSweep(rider,nextRider,drop,nextDrop,pickupReach(item));
    if(hit!==null)return {item,time:start+(end-start)*hit,at:interpolate(drop,nextDrop,hit),distance:distanceSquared(rider,drop)};
    rider=nextRider;drop=nextDrop;start=end;
  }
  return null;
}
