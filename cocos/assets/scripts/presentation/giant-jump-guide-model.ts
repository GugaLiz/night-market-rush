import {CONFIG,WORLD} from '../domain/core/config';
import type {GiantJump,Vec} from '../domain/shared/types';

export type GuideSegment={from:Vec;to:Vec};
export interface GiantJumpGuide {trajectory:GuideSegment[];edges:GuideSegment[];arrows:GuideSegment[]}

/** Clip decorative guidance to the same playable floor as the Web renderer. */
function clip(from:Vec,to:Vec):GuideSegment|null {
  const b=WORLD.bounds,dx=to.x-from.x,dy=to.y-from.y;
  let lo=0,hi=1;
  for(const [p,q] of [[-dx,from.x-b.left],[dx,b.right-from.x],[-dy,from.y-b.top],[dy,b.bottom-from.y]]){
    if(p===0){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return {from:{x:from.x+dx*lo,y:from.y+dy*lo},to:{x:from.x+dx*hi,y:from.y+dy*hi}};
}

/** Split a polyline into dashes with a continuous phase before clipping. */
function dashed(points:readonly Vec[],ink:number,gap:number):GuideSegment[] {
  const result:GuideSegment[]=[];let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length===0)continue;
    for(let pos=0;pos<length;){
      const phase=distance%(ink+gap),on=phase<ink;
      const step=Math.min(length-pos,(on?ink:ink+gap)-phase);
      if(step<1e-8){distance+=1e-8;continue;}
      if(on){
        const segment=clip({x:a.x+dx*pos/length,y:a.y+dy*pos/length},{x:a.x+dx*(pos+step)/length,y:a.y+dy*(pos+step)/length});
        if(segment)result.push(segment);
      }
      pos+=step;distance+=step;
    }
  }
  return result;
}

/** Based only on the already locked simulation target and safe-wedge angle. */
export function giantJumpGuide(x:number,y:number,jump:GiantJump|null|undefined):GiantJumpGuide|null {
  if(!jump||jump.phase==='rest')return null;
  const target=jump.target,control={x:(x+target.x)/2,y:Math.min(y,target.y)-60},curve:Vec[]=[];
  for(let i=0;i<=48;i++){
    const t=i/48,u=1-t;curve.push({x:u*u*x+2*u*t*control.x+t*t*target.x,y:u*u*y+2*u*t*control.y+t*t*target.y});
  }
  const trajectory=dashed(curve,6,11),edges:GuideSegment[]=[],arrows:GuideSegment[]=[];
  if(jump.hop===3){
    const radius=CONFIG.giant.stompRadius,street=Math.hypot(WORLD.bounds.right-WORLD.bounds.left,WORLD.bounds.bottom-WORLD.bounds.top);
    const polar=(angle:number,r:number):Vec=>({x:target.x+Math.cos(angle)*r,y:target.y+Math.sin(angle)*r});
    for(const angle of [jump.gapAngle+CONFIG.giant.gapHalfAngle,jump.gapAngle-CONFIG.giant.gapHalfAngle])
      edges.push(...dashed([polar(angle,radius),polar(angle,street)],8,12));
    const c=Math.cos(jump.gapAngle),s=Math.sin(jump.gapAngle);
    const local=(u:number,v:number):Vec=>({x:target.x+c*u-s*v,y:target.y+s*u+c*v});
    for(const offset of [radius+12,radius+34])for(const [from,to] of [
      [local(offset-7,-7),local(offset,0)],[local(offset,0),local(offset-7,7)]
    ]){const segment=clip(from,to);if(segment)arrows.push(segment);}
  }
  return {trajectory,edges,arrows};
}
