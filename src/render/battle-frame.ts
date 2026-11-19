import {CONFIG} from '../core/config';
import type {GameState, Vec} from '../shared/types';

interface MovingBody extends Vec {px:number; py:number}

/** Sample the last completed physics step. Combat always reads the original positions. */
export function sampleBattleFrame(state: GameState, fraction: number): GameState {
  const alpha = Math.max(0, Math.min(1, fraction));
  if (alpha === 1) return state;
  function pose<T extends MovingBody>(body: T): T {
    if (body.px === body.x && body.py === body.y) return body;
    return {
      ...body,
      x: body.px + (body.x - body.px) * alpha,
      y: body.py + (body.y - body.py) * alpha,
    };
  }
  return {
    ...state,
    time: Math.max(0, state.time - (1 - alpha) * CONFIG.step),
    player: pose(state.player),
    enemies: state.enemies.map(pose),
    projectiles: state.projectiles.map(shot => shot.phase === 'chain' ? shot : pose(shot)),
    enemyShots: state.enemyShots?.map(pose),
    ultimates: state.ultimates?.map(cast=>cast.kind==='express'?pose(cast):cast),
  };
}
