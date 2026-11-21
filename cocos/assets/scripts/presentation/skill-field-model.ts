import {skillFieldRadius} from '../domain/core/skill-fields';
import type {SkillField} from '../domain/shared/types';

/** A field's gameplay radius and lifetime, without presentation-side easing. */
export function skillFieldVisual(field:SkillField,time:number):{radius:number;remaining:number;main:boolean}|null {
  const radius=skillFieldRadius(field,time);
  if(!(radius>0))return null;
  return {radius,remaining:Math.max(0,field.expiresAt-time),main:field.id===field.castId};
}
