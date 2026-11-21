import type {Projectile,Vec} from '../domain/shared/types';

/** World-space coordinates of a visual launch, captured once per attack. */
export interface ProjectileLaunch {id:number;point:Vec}

/**
 * Ease projectiles from their visual hand anchor to their simulated path, then
 * guide a returning tray toward the live glove. Never mutate simulation state.
 */
export function projectilePosition(q:Projectile,time:number,player:Vec,launch:ProjectileLaunch|null,catchPoint:Vec|null):Vec {
  const base=q.kind==='lunchbox'?28:q.kind==='tray'||q.kind==='bag'?18:24;
  const offsetX=launch?launch.point.x-q.originX:0,offsetY=launch?launch.point.y-q.originY+base:0;
  let fromHand=0;
  if(launch?.id===q.attackId){
    if(q.phase==='out')fromHand=Math.max(0,1-q.travelled/Math.max(1,Math.hypot(offsetX,offsetY)*1.7));
    if(q.phase==='flight')fromHand=Math.max(0,1-(time-q.bornAt)/.65);
  }
  let x=q.x+offsetX*fromHand,y=q.y-base+offsetY*fromHand;
  if(q.kind==='tray'&&q.phase==='return'&&catchPoint){
    const near=1-Math.min(1,Math.hypot(q.x-player.x,q.y-player.y)/95);
    const mix=near*near*(3-2*near);
    x+=(catchPoint.x-player.x)*mix;y+=(catchPoint.y-player.y+base)*mix;
  }
  return {x,y};
}
