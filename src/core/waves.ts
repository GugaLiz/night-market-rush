import type {Enemy, EnemyKind, GameState, Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, type Difficulty} from './config';
import {clamp, distanceSquared} from './geometry';

type Spawn = (kind:EnemyKind, position:Vec) => Enemy;

/** The opening crowd is already crossing the square. The fan sits on its near flank.
 * A smaller group enters from the opposite side, leaving the lower lane open for a wide turn. */
export function spawnMarketOpening(s: GameState, spawn: Spawn, ctx: CombatContext): Vec {
  const side = s.seed % 2 ? 1 : -1;
  const high = s.seed % 4 < 2 ? -1 : 1;
  const center = {
    x: s.player.x + side * (266 + ctx.random() * 58),
    y: clamp(s.player.y + high * (42 + ctx.random() * 50), 250, 455),
  };
  const fan = {x: center.x - side * 152, y: center.y + high * 18};
  const ranks = 4;
  for (let rank = 0; rank < ranks; rank++) {
    const members = 8 + Math.floor(ctx.random() * 2);
    for (let i = 0; i < members; i++) {
      const x = center.x + side * ((i - members / 2) * 28 + (rank % 2) * 13);
      const y = center.y + (rank - 1.5) * 30 + (rank % 2 ? ctx.random() * 8 : 0);
      const enemy = spawn('bun', {x, y});
      enemy.spawnAt = s.time - CONFIG.spawn.warning;
      if (rank === 0) enemy.march = {x: -side, y: 0, until: s.time + 2.3};
      ctx.emit({type:'spawn', x, y});
    }
  }
  const crossY = center.y + (high < 0 ? 130 : -145);
  const entryX = s.player.x - side * (265 + ctx.random() * 65);
  for (let i = 0; i < 8; i++) {
    const x = entryX - side * i * 27;
    const y = crossY + (i % 2) * 12;
    const enemy = spawn('bun', {x, y});
    enemy.spawnAt = s.time - CONFIG.spawn.warning;
    enemy.march = {x: side, y: 0, until: s.time + 3.2};
    ctx.emit({type:'spawn', x, y});
  }
  return fan;
}

export function advanceWave(s: GameState, ctx: CombatContext): void {
  const duration = s.wave === 1 ? CONFIG.waves.firstDuration : CONFIG.waves.duration;
  if (s.time + 1e-9 < s.waveStartedAt + duration) return;
  s.waveStartedAt += duration;
  s.wave++;
  ctx.emit({type:'wave', wave:s.wave});
}

/** Alternate a side queue, a crossing group and a double rank. One entrance stays active at a time. */
export function spawnFormation(s: GameState, difficulty: Difficulty, batch:number, spawn: Spawn, ctx: CombatContext): void {
  const shape = batch % 3;
  const rankSize = 5 + Math.min(s.wave, 3);
  const count = Math.min(difficulty.cap - s.enemies.length, shape === 2 ? rankSize * 2 : rankSize);
  if (count <= 0) return;
  const lanes = [295, 490, 225, 420];
  const laneY = lanes[(batch + s.wave - 1 + s.seed) % lanes.length] + (ctx.random() - .5) * 25;
  let direction = (batch + s.seed) % 2 === 0 ? 1 : -1;
  const crossing = shape === 1;
  const laneX = WORLD.bounds.left + 190 + ctx.random() * (WORLD.bounds.right - WORLD.bounds.left - 380);
  const nearEdge = crossing ? WORLD.bounds.top + 31 : WORLD.bounds.left + 34;
  const farEdge = crossing ? WORLD.bounds.bottom - 31 : WORLD.bounds.right - 34;
  const edge = (sign:number) => sign > 0 ? nearEdge : farEdge;
  const middle = crossing ? {x:laneX, y:edge(direction)} : {x:edge(direction) + direction * (rankSize - 1) * 14, y:laneY};
  if (distanceSquared(middle, s.player) < 220 ** 2) direction *= -1;
  for (let i = 0; i < count; i++) {
    const rank = Math.floor(i / rankSize);
    const x = crossing ? laneX + (i - count / 2) * 24 : edge(direction) + direction * ((i % rankSize) * 28 + rank * 14);
    const y = crossing ? edge(direction) + direction * (ctx.random() * 45) : laneY + rank * 32;
    if (distanceSquared({x,y}, s.player) < CONFIG.spawn.safeDistance ** 2) continue;
    const roll = ctx.random(), weights = difficulty.weights;
    const kind = roll < weights[0] ? 'bun' : roll < weights[0] + weights[1] ? 'box' : 'bowl';
    const enemy = spawn(kind, {x,y});
    if (kind === 'bun') {
      enemy.march = crossing ? {x:0, y:direction, until:s.time + 3.2}
        : {x:direction, y:0, until:s.time + (rank ? 1.8 : 4.2)};
    }
    ctx.emit({type:'spawn', x, y});
  }
}
