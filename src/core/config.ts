import type {EnemyKind} from '../shared/types';

/** Coordinates are game units, never display pixels. All adapters use this view. */
export const WORLD = {
  width: 1280,
  height: 720,
  shortSide: 540,
  bounds: {left: 80, right: 1200, top: 100, bottom: 640},
  start: {x: 640, y: 370},
} as const;

const S = WORLD.shortSide;
export const CONFIG = {
  step: 1 / 60,
  player: {speed: .42 * S, accelerationTime: .08, decelerationTime: .06, radius: .018 * S, minY:180, hp:100, protection:.75,sprintAfter:1.8,sprintMax:1.12,dashDuration:.18,dashCooldown:3,dashSpeed:2.5},
  enemies: {
    bun: {speed: .075 * S, radius: .020 * S, points: 10, hp:30, damage:8},
    box: {speed: .065 * S, radius: .022 * S, points: 20, hp:60, damage:12},
    bowl: {speed: .045 * S, radius: .040 * S, points: 15, hp:120, damage:18},
  } satisfies Record<EnemyKind, {speed: number; radius: number; points: number; hp:number; damage:number}>,
  dash: {warning: 1.1, duration: .5, recovery: 1.5, speed: .38 * S, approach: 4, concurrent: 1},
  ranged: {warning:.9,interval:5,speed:90,damage:8,radius:6,cap:12,lifetime:7,range:620,concurrent:2},
  skills: {
    fan: {radius: .16 * S, damage:60},
    skate: {duration: 4, inner: .07 * S, outer: .13 * S, damage:12, interval:.5},
    soda: {radius: .30 * S, duration: 3, factor: .35},
  },
  spawn: {warning: .6, safeDistance: .22 * S, attempts: 24},
  pickup: {radius: .027 * S, firstAt: 1, interval: 4, emptyGrace: 2, cap: 4},
  weapons: {projectileCap:24, dropFirst:4, dropInterval:12, dropRadius:12},
} as const;

export interface Difficulty {
  stage: number;
  cap: number;
  interval: number;
  speedScale: number;
  weights: readonly [number, number, number];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Continuous rates at boundaries; no unbounded escalation after five minutes. */
export function difficultyAt(time: number): Difficulty {
  if (time < 30) return {stage: 1, cap: 45, interval: mix(.30, .24, time / 30), speedScale: 1, weights: [1, 0, 0]};
  if (time < 90) return {stage: 2, cap: 70, interval: mix(.24, .20, (time - 30) / 60), speedScale: mix(1, 1.05, (time - 30) / 12), weights: [.85, .05, .10]};
  if (time < 180) return {stage: 3, cap: 90, interval: mix(.20, .16, (time - 90) / 90), speedScale: mix(1.05, 1.1, (time - 90) / 15), weights: [.80, .08, .12]};
  return {stage: 4, cap: 100, interval: mix(.16, .14, (time - 180) / 120), speedScale: mix(1.1, 1.15, (time - 180) / 20), weights: [.78, .08, .14]};
}


