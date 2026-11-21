import {CONFIG} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import type {Enemy} from '../domain/shared/types';
import {enemyHeight} from './damage-model';

export interface SyrupOwnerPose {lift:number;scaleX:number;scaleY:number;tilt:number}
export interface SyrupDrop {x:number;y:number;angle:number;scale:number;progress:number}
export type SyrupLanding =
  | {stage:'warn';x:number;y:number;deadline:number}
  | {stage:'impact';x:number;y:number;age:number;progress:number;alpha:number;radius:number};

/** Keep the warning visible while rendering a frame just before a simulated impact. */
export function syrupLanding(e:Enemy,time:number,quiet:boolean):SyrupLanding|null {
  if(e.kind!=='eliteSesame'||!e.syrupTarget)return null;
  const target=e.syrupTarget,impact=e.syrupImpactAt;
  if(impact!==undefined&&time>=impact){
    const age=time-impact,fade=CONFIG.elites.sesame.fade;
    if(age>=fade)return null;
    const progress=clamp(age/fade,0,1),radius=CONFIG.elites.sesame.radius*(quiet?.94:.28+.72*(1-(1-progress)**3));
    return {stage:'impact',x:target.x,y:target.y,age,progress,alpha:(1-progress)**.75,radius};
  }
  const deadline=(e.shotWarnUntil??0)>time?e.shotWarnUntil:impact;
  return deadline!==undefined&&deadline>time?{stage:'warn',x:target.x,y:target.y,deadline}:null;
}

/** The airborne cue is visual only; the target and warning belong to the simulation. */
export function syrupDrop(e:Enemy,time:number,pose:SyrupOwnerPose,quiet:boolean):SyrupDrop|null {
  const landing=syrupLanding(e,time,quiet);if(!landing||landing.stage!=='warn')return null;
  const progress=clamp(1-(landing.deadline-time)/CONFIG.elites.sesame.warning,0,1);
  const height=enemyHeight(e.kind),dx=e.facing*.416*height,dy=-.575*height,c=Math.cos(pose.tilt),s=Math.sin(pose.tilt);
  const startX=e.x+(dx*c-dy*s)*pose.scaleX,startY=e.y-pose.lift+(dx*s+dy*c)*pose.scaleY;
  const end=landing;
  return {x:quiet?end.x:startX+(end.x-startX)*progress,
    y:quiet?end.y-19:startY+(end.y-startY)*progress-420*progress*(1-progress),
    angle:quiet?0:Math.atan2(end.y-startY-420*(1-2*progress),end.x-startX),
    scale:.84+.53*progress,progress};
}
