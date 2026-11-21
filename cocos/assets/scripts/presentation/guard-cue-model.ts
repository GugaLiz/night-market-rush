import {CONFIG} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import {guardShapeAt} from '../domain/core/guard-attacks';
import {isGuard,type Enemy,type GuardKind,type GuardShape,type Settings} from '../domain/shared/types';

export type GuardIngredient='chevron'|'bead'|'steam'|'lotus';
export type GuardCue=
  | {kind:'basket';x:number;y:number}
  | {kind:'ingredient';ingredient:GuardIngredient;x:number;y:number;angle:number;progress:number};

/** The original art language is selected by the guard, not randomly per mark. */
export function guardIngredient(kind:GuardKind):GuardIngredient {
  if(kind==='epicPearl'||kind==='eliteTanghulu')return 'bead';
  if(kind==='epicSteamer'||kind==='epicHotpot')return 'steam';
  if(kind==='eliteLotus')return 'lotus';
  return 'chevron';
}

/** Interior-only accents: the authoritative collision shapes and their outer
 * outlines remain owned by the existing warning renderer. */
export function guardCues(enemy:Enemy,time:number,settings:Pick<Settings,'quality'|'reduceMotion'>):GuardCue[] {
  const cast=enemy.guardCast;
  if(!cast||!isGuard(enemy.kind)||time-enemy.spawnAt<CONFIG.spawn.warning)return [];
  const result:GuardCue[]=[],ingredient=guardIngredient(enemy.kind);
  for(const mark of cast.marks){
    if(time<mark.warnAt||time>=mark.endAt)continue;
    const shape=guardShapeAt(mark,time);
    if(mark.summon&&shape.kind==='disc'){
      result.push({kind:'basket',x:shape.center.x,y:shape.center.y});continue;
    }
    // The Web renderer displays moving ingredients only during warning in
    // standard quality; simple keeps the existing full boundary instead.
    if(time>=mark.hitAt||settings.quality==='simple')continue;
    const progress=settings.reduceMotion?.7:clamp((time-mark.warnAt)/Math.max(.001,mark.hitAt-mark.warnAt),0,1);
    result.push(...directionCues(shape,ingredient,progress));
  }
  return result;
}

function directionCues(shape:GuardShape,ingredient:GuardIngredient,progress:number):GuardCue[] {
  const cues:GuardCue[]=[];
  if(shape.kind==='lane'){
    const dx=shape.to.x-shape.from.x,dy=shape.to.y-shape.from.y,length=Math.hypot(dx,dy);
    const angle=Math.atan2(dy,dx),count=Math.max(1,Math.min(6,Math.floor(length/85)));
    for(let i=0;i<count;i++){
      const t=(i+.32+.32*progress)/count;
      cues.push({kind:'ingredient',ingredient,x:shape.from.x+dx*t,y:shape.from.y+dy*t,angle,progress});
    }
    return cues;
  }
  const count=shape.kind==='fan'?3:shape.radius<45?3:6;
  const lo=shape.kind==='fan'?shape.angle-shape.halfAngle:0;
  const span=shape.kind==='fan'?2*shape.halfAngle:Math.PI*2;
  const inner=shape.kind==='ring'?shape.inner:0,radius=inner+(shape.radius-inner)*(.52+.25*progress);
  for(let i=0;i<count;i++){
    const angle=lo+span*(i+.5)/count;
    cues.push({kind:'ingredient',ingredient,x:shape.center.x+Math.cos(angle)*radius,y:shape.center.y+Math.sin(angle)*radius,angle,progress});
  }
  return cues;
}
