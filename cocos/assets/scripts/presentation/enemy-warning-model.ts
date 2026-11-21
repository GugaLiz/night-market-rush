import {CONFIG} from '../domain/core/config';
import {crabChargeReach} from '../domain/core/enemies';
import {clamp} from '../domain/core/geometry';
import {guardShapeAt} from '../domain/core/guard-attacks';
import type {Enemy,GuardShape} from '../domain/shared/types';
import {syrupLanding} from './enemy-syrup-model';

export interface EnemyWarning {shape:GuardShape;live:boolean;summon:boolean;giant:boolean}

/** Shapes use the simulation's world coordinates and remain independent of rendering. */
export function enemyWarnings(e:Enemy,time:number):EnemyWarning[] {
  if(time-e.spawnAt<CONFIG.spawn.warning)return [];
  const warning=(shape:GuardShape,live=false,summon=false,giant=false):EnemyWarning=>({shape,live,summon,giant});
  if(e.guardCast){
    return e.guardCast.marks.filter(m=>time>=m.warnAt&&time<m.endAt)
      .map(m=>warning(guardShapeAt(m,time),time>=m.hitAt,!!m.summon));
  }
  if(e.kind==='giantBun'&&e.jump&&e.jump.phase!=='rest'){
    const j=e.jump,radius=CONFIG.giant.stompRadius;
    const shape:GuardShape=j.hop===3
      ?{kind:'fan',center:j.target,radius,angle:j.gapAngle+Math.PI,halfAngle:Math.PI-CONFIG.giant.gapHalfAngle}
      :{kind:'disc',center:j.target,radius,inner:0};
    return [warning(shape,false,false,true)];
  }
  if((e.kind==='box'||e.kind==='eliteCrab')&&(e.phase==='warn'||e.phase==='dash')){
    const crab=e.kind==='eliteCrab',attack=crab?CONFIG.elites.crab:CONFIG.dash;
    const seconds=e.phase==='dash'?clamp(e.phaseUntil-time,0,attack.duration):attack.duration;
    const length=crab?crabChargeReach(e,time):attack.speed*seconds*(e.slowUntil>time?CONFIG.skills.soda.factor:1);
    return [warning({kind:'lane',from:{x:e.x,y:e.y},to:{x:e.x+e.dashX*length,y:e.y+e.dashY*length},
      radius:crab?CONFIG.elites.crab.halfWidth:e.radius},e.phase==='dash')];
  }
  const syrup=syrupLanding(e,time,false);
  if(syrup&&(syrup.stage==='warn'||syrup.age<CONFIG.step)){
    return [warning({kind:'disc',center:{x:syrup.x,y:syrup.y},radius:CONFIG.elites.sesame.radius,inner:0},syrup.stage==='impact')];
  }
  if((e.kind==='bowl'||e.kind==='eliteKettle')&&(e.shotWarnUntil??0)>time){
    const kettle=e.kind==='eliteKettle',count=kettle?CONFIG.elites.kettle.shots:1;
    const length=kettle?CONFIG.elites.kettle.speed*CONFIG.elites.kettle.lifetime:CONFIG.ranged.speed*CONFIG.ranged.lifetime;
    return Array.from({length:count},(_,i)=>{
      const angle=(e.shotAngle??0)+(kettle?CONFIG.elites.kettle.spread*(i/(count-1)-.5):0);
      return warning({kind:'lane',from:{x:e.x,y:e.y},to:{x:e.x+Math.cos(angle)*length,y:e.y+Math.sin(angle)*length},
        radius:kettle?CONFIG.elites.kettle.radius:CONFIG.ranged.radius});
    });
  }
  return [];
}
