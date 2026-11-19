import {CONFIG} from '../core/config';
import {pickupPositionAt} from '../core/pickup-motion';
import type {GameState, Pickup, Vec} from '../shared/types';

interface MovingBody extends Vec {px:number; py:number}

function samplePickup(pickup: Pickup, alpha: number): Pickup {
  if (pickup.px === undefined || pickup.py === undefined) return pickup;
  if (!pickup.turns?.length && pickup.px === pickup.x && pickup.py === pickup.y) return pickup;
  const point = pickupPositionAt(pickup, alpha);
  if (!pickup.turns?.length) return {...pickup, ...point};
  // Orient the wake along the visible part of the path, even before a mid-step bounce.
  const next = pickup.turns.find(turn => turn.fraction > alpha) ?? pickup;
  return {
    ...pickup, ...point,
    vx: Math.sign(next.x - point.x) * Math.abs(pickup.vx ?? 0),
    vy: Math.sign(next.y - point.y) * Math.abs(pickup.vy ?? 0),
  };
}

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
    pickups: state.pickups.map(pickup => samplePickup(pickup, alpha)),
    enemies: state.enemies.map(pose),
    projectiles: state.projectiles.map(shot => shot.phase === 'chain' ? shot : pose(shot)),
    enemyShots: state.enemyShots?.map(pose),
    ultimates: state.ultimates?.map(cast=>cast.kind==='express'?pose(cast):cast),
  };
}
