import type {EnemyShot,Vec} from '../domain/shared/types';

export interface EnemyShotVisual {
  x:number;y:number;angle:number;scale:number;radius:number;kind:'tea'|'soup';
}

/** The position and collision radius remain authoritative simulation values. */
export function enemyShotVisual(shot:EnemyShot):EnemyShotVisual {
  const kind=shot.kind==='tea'?'tea':'soup';
  return {x:shot.x,y:shot.y,angle:Math.atan2(shot.vy,shot.vx),
    scale:kind==='tea'?shot.radius/7:shot.radius/6,radius:shot.radius,kind};
}

/** Rotate original Web artwork coordinates into world-space coordinates. */
export function enemyShotPoint(shot:EnemyShotVisual,x:number,y:number):Vec {
  const c=Math.cos(shot.angle),s=Math.sin(shot.angle);
  return {x:shot.x+(x*c-y*s)*shot.scale,y:shot.y+(x*s+y*c)*shot.scale};
}
