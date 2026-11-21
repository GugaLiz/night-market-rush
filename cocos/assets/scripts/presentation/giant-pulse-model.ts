import {CONFIG} from '../domain/core/config';
import {giantPulseLifetime, giantPulseRadius} from '../domain/core/giant-bun';
import type {GiantPulse} from '../domain/shared/types';

/** Render geometry in simulation coordinates. Danger is never omitted in simple
 * or reduced-motion modes; the remaining ground print is decorative only. */
export interface GiantPulseVisual {
  x:number; y:number; inner:number; outer:number; radius:number;
  start:number; end:number; danger:boolean; printAlpha:number;
}

export function giantPulseVisual(pulse:GiantPulse,time:number):GiantPulseVisual|null {
  const age=time-pulse.bornAt,lifetime=giantPulseLifetime(pulse);
  if(age<0||age>lifetime)return null;
  const heavy=pulse.hop===3;
  const radius=heavy?giantPulseRadius(pulse,time):pulse.reach;
  return {
    x:pulse.x,y:pulse.y,radius,
    inner:heavy?Math.max(0,radius-CONFIG.giant.pulseHalfWidth):0,
    outer:heavy?radius+CONFIG.giant.pulseHalfWidth:CONFIG.giant.stompRadius,
    start:heavy?pulse.gapAngle+CONFIG.giant.gapHalfAngle:0,
    end:heavy?pulse.gapAngle+Math.PI*2-CONFIG.giant.gapHalfAngle:Math.PI*2,
    danger:heavy||age<=CONFIG.giant.localDuration,
    printAlpha:heavy?0:Math.max(0,1-age/lifetime),
  };
}
