import {CONFIG} from '../domain/core/config';
import type {Enemy,MarketUpgrade,Settings} from '../domain/shared/types';
import {enemyHeight} from './damage-model';

export interface BrittleIceVisual {x:number;y:number;height:number;remaining:number;sheen:number;detail:boolean}

/** Match the existing Web renderer's eligibility: an ordinary chill alone is
 * not enough, and a flight, spawn warning, dead enemy or expired frost cannot
 * be shattered. This is presentation only; collision remains in the core. */
export function brittleIceVisual(enemy:Enemy,time:number,upgrade:MarketUpgrade|null,settings:Pick<Settings,'quality'|'reduceMotion'>):BrittleIceVisual|null {
  const remaining=(enemy.frostUntil??0)-time;
  if(upgrade!=='frost'||remaining<=0||enemy.hp<=0||enemy.jump?.phase==='flight'||time-enemy.spawnAt<CONFIG.spawn.warning)return null;
  return {x:enemy.x,y:enemy.y,height:enemyHeight(enemy.kind),remaining,
    sheen:settings.reduceMotion?.65:.5+.5*Math.cos(remaining*Math.PI*2/1.55),detail:settings.quality==='standard'};
}
