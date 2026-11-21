import {CONFIG} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import type {Enemy,EnemyShot} from '../domain/shared/types';
import {enemyHeight} from './damage-model';

export interface RangedOwnerPose {lift:number;scaleX:number;scaleY:number;tilt:number}
export type RangedAttackDetail =
  | {kind:'bowl';x:number;y:number;facing:number;rise:number;progress:number}
  | {kind:'kettle-warning';x:number;y:number;facing:number;rise:number;progress:number}
  | {kind:'kettle-jet';x:number;y:number;facing:number;targetX:number;targetY:number;alpha:number};

/** World-space attachment of a painted prop to the actor's current pose. */
export function rangedToolPosition(enemy:Enemy,pose:RangedOwnerPose,side:number,up:number):{x:number;y:number} {
  const height=enemyHeight(enemy.kind),dx=enemy.facing*side*height,dy=-up*height;
  const cos=Math.cos(pose.tilt),sin=Math.sin(pose.tilt);
  return {x:enemy.x+(dx*cos-dy*sin)*pose.scaleX,y:enemy.y-pose.lift+(dx*sin+dy*cos)*pose.scaleY};
}

/** Draws only current host state; never changes projectiles or attack rules. */
export function enemyRangedDetail(enemy:Enemy,time:number,shots:readonly EnemyShot[],pose:RangedOwnerPose,reduceMotion:boolean):RangedAttackDetail|null {
  if(enemy.hp<=0||enemy.stunUntil>time||(enemy.frostUntil??0)>time||time-enemy.spawnAt<CONFIG.spawn.warning)return null;
  const remaining=(enemy.shotWarnUntil??0)-time;
  if(enemy.kind==='bowl'&&(remaining>0||(enemy.volleyRemaining??0)>0)){
    const progress=remaining>0?clamp(1-remaining/CONFIG.ranged.warning,0,1):1;
    return {kind:'bowl',x:enemy.x+enemy.facing*11,y:enemy.y-41,facing:enemy.facing,rise:3+progress*10,progress};
  }
  if(enemy.kind!=='eliteKettle')return null;
  const spout=rangedToolPosition(enemy,pose,.51,.64);
  if(remaining>0){
    const progress=clamp(1-remaining/CONFIG.elites.kettle.warning,0,1);
    return {kind:'kettle-warning',...spout,facing:enemy.facing,rise:reduceMotion?6:5+progress*9,progress};
  }
  // The fan's centre projectile belongs to this pot; never join a nearby pot's
  // shot or a side lane to its spout. The visible projectile stays independent.
  const jet=shots.find(shot=>shot.ownerId===enemy.id&&shot.kind==='tea'&&time-shot.bornAt<.26&&
    Math.cos(Math.atan2(shot.vy,shot.vx)-(enemy.shotAngle??0))>.99);
  if(!jet)return null;
  return {kind:'kettle-jet',...spout,facing:enemy.facing,targetX:jet.x,targetY:jet.y,alpha:1-clamp((time-jet.bornAt)/.26,0,1)};
}
