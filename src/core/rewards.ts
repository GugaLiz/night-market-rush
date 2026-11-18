import type {GameState, Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD} from './config';
import {clamp, distanceSquared, relativeSweep} from './geometry';

export function dropCoins(s: GameState, at: Vec, value: number, ctx: CombatContext): void {
  const angle = ctx.random() * Math.PI * 2;
  const offset = 4 + ctx.random() * 12;
  const p = s.player;
  const position = {
    x: clamp(at.x + Math.cos(angle) * offset, WORLD.bounds.left + p.radius, WORLD.bounds.right - p.radius),
    y: clamp(at.y + Math.sin(angle) * offset, CONFIG.player.minY, WORLD.bounds.bottom - p.radius),
  };
  if (s.coins.length < CONFIG.rewards.cap) {
    s.coins.push({...position, value, bornAt:s.time, dropOrigin:{x:at.x,y:at.y}, id:ctx.id()});
    return;
  }
  const nearest = s.coins.reduce((a, b) => distanceSquared(a, position) <= distanceSquared(b, position) ? a : b);
  nearest.value += value;
}

export function collectCoins(s: GameState, dt: number, ctx: CombatContext): void {
  const p = s.player, start = {x:p.px, y:p.py};
  let collected = 0;
  s.coins = s.coins.filter(coin => {
    if (s.time - coin.bornAt < CONFIG.rewards.coinGrace) return true;
    const dx = p.x - coin.x, dy = p.y - coin.y, distance = Math.hypot(dx, dy);
    const before = {x:coin.x, y:coin.y};
    if (distance > 0 && distance <= CONFIG.rewards.attractionRadius) {
      const fraction = Math.min(1, CONFIG.rewards.attractionSpeed * dt / distance);
      coin.x += dx * fraction;
      coin.y += dy * fraction;
    }
    if (relativeSweep(start, p, before, coin, CONFIG.rewards.collectRadius) === null) return true;
    collected += coin.value;
    return false;
  });
  if (collected) {
    s.collectedCoins += collected;
    ctx.emit({type:'coin', amount:collected, x:p.x, y:p.y});
  }
}
