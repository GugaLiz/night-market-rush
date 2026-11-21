import {CONFIG} from '../domain/core/config';
import type {GameEvent} from '../domain/shared/types';

export type PulseUse=Extract<GameEvent,{type:'skill'}>;
export interface SkillPulse {kind:'soda'|'bell'|'dispatch';x:number;y:number;radius:number;alpha:number;count:number;travel:number}
const unit=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=unit(n);return t*t*(3-2*t);};

/** Original Web timings and hit radii; this is only a presentation cue. */
export function skillPulse(use:PulseUse,time:number,quiet:boolean,simple:boolean):SkillPulse|null {
  const age=time-use.time,kind=use.kind;
  if(kind==='dispatch'){
    if(age<0||age>=1.12)return null;
    const travel=unit(age/.40),range=CONFIG.skills.dispatch.radius;
    return {kind,x:use.x,y:use.y,radius:quiet?range:22+(range-22)*(1-(1-travel)**2),
      alpha:ease((1.12-age)/.48)*.91,count:simple?4:6,travel};
  }
  if(kind!=='soda'&&kind!=='bell')return null;
  const elapsed=age-(kind==='soda'?0:.08),duration=kind==='soda'?1.08:1.16;
  if(elapsed<0||elapsed>=duration)return null;
  const travel=unit(elapsed/.42),range=CONFIG.skills[kind].radius;
  return {kind,x:use.x,y:use.y,radius:quiet?range:14+(range-14)*(1-(1-travel)**2),
    alpha:ease((duration-elapsed)/.56)*.9,count:simple?4:6,travel};
}
