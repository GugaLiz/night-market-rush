import {isMelee} from '../domain/core/melee';
import type {Vec,WeaponAttack,WeaponKind} from '../domain/shared/types';

export interface ReleaseAnchor {id:number;point:Vec}
export interface StrikeAnchor extends ReleaseAnchor {angle:number;progress:number}
export interface RangedRelease {id:number;kind:WeaponKind;angle:number;bornAt:number}
export interface ReleasePose {kind:WeaponKind;point:Vec;angle:number;progress:number}

/** A ranged muzzle stays fixed at the recorded point of the same attack. */
export function rangedReleasePose(event:RangedRelease,time:number,attack:WeaponAttack|null,anchor:ReleaseAnchor|null):ReleasePose|null {
  const progress=(time-event.bornAt)/.18;
  if(progress<0||progress>=1||isMelee(event.kind)||attack?.id!==event.id||anchor?.id!==event.id)return null;
  return {kind:event.kind,point:anchor.point,angle:event.angle,progress};
}

/** A melee flash follows the current weapon tip throughout the active swing. */
export function meleeReleasePose(attack:WeaponAttack|null,time:number,anchor:StrikeAnchor|null):ReleasePose|null {
  if(!attack||!isMelee(attack.kind)||attack.phase!=='active'||time<attack.releaseAt||anchor?.id!==attack.id)return null;
  return {kind:attack.kind,point:anchor.point,angle:anchor.angle,progress:Math.max(0,Math.min(1,anchor.progress))};
}
