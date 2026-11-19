import type {EnemyKind, Pickup} from '../shared/types';

/** Coordinates are game units, never display pixels. All adapters use this view. */
export const WORLD = {
  width: 1280,
  height: 720,
  shortSide: 540,
  bounds: {left: 80, right: 1200, top: 100, bottom: 640},
  start: {x: 640, y: 370},
} as const;

const S = WORLD.shortSide;
const soupRange=820;
export const CONFIG = {
  step: 1 / 60,
  player: {
    speed: .645 * S, precisionSpeed: .46 * S, accelerationTime: .030, decelerationTime: .023,
    turnRate: 16 * Math.PI, aimThreshold: .075,
    radius: .018 * S, minY:180, hp:100, protection:.75, sprintAfter:1.8, sprintMax:1.12,
    dashDuration:.18, dashCooldown:3, dashSpeed:1.42*S, dashExitTime:.055,
  },
  enemies: {
    bun: {speed: .075 * S, radius: .020 * S, coins:1, hp:30, damage:8},
    box: {speed: .065 * S, radius: .022 * S, coins:2, hp:60, damage:12},
    bowl: {speed: .045 * S, radius: .040 * S, coins:3, hp:120, damage:18},
    giantBun: {speed:0, radius:34, coins:12, hp:520, damage:20},
  } satisfies Record<EnemyKind, {speed: number; radius: number; coins:number; hp:number; damage:number}>,
  awareness: {
    bun: {notice:190, release:270},
    box: {notice:235, release:330},
    bowl: {notice:soupRange, release:920},
    giantBun: {notice:1400, release:1500},
  },
  dash: {warning: 1.1, duration: .5, recovery: 1.5, speed: .38 * S, approach: 4, concurrent: 1},
  giant: {
    warning:.65, finalWarning:1, flight:.45, between:.32, recovery:2.35,
    stompRadius:65, localDuration:.20, printLifetime:3.15, pulseSpeed:690, pulseHalfWidth:14,
    gapHalfAngle:Math.PI*.22, finalDamage:24,
  },
  ranged: {warning:.9,interval:5,speed:145,damage:8,radius:6,cap:12,lifetime:6.5,range:soupRange,concurrent:2},
  skills: {
    fan: {radius:130, fullRadius:250, damage:90},
    skate: {duration:4, inner:38, outer:140, damage:20, interval:.5},
    soda: {radius:260, duration:3, factor:.35, poolRadius:108, sidePoolRadius:78},
    lure: {radius:270, targets:10},
    bell: {radius:240, targets:18},
    hook: {radius:240, targets:3, duration:.65, speed:740},
    route: {length:420, width:110, duration:5, speedMultiplier:1.2},
    cones: {reach:114, spacing:52, radius:21},
  },
  spawn: {warning:.6, safeDistance:.22*S, gap:43, attempts:32, openingCount:40},
  pickup: {radius: .027 * S, reach:56, choiceReach:42, firstAt: .35, interval: 4, emptyGrace: 2, cap: 4},
  weapons: {projectileCap:24, dropFirst:4, dropInterval:12, dropRadius:12, pickupReach:42},
  // V4 tuning values for the night-market adaptation. The video only establishes visible outcomes.
  waves: {firstDuration:36, duration:34, transition:1.65},
  rewards: {coinGrace:.42, attractionRadius:110, attractionSpeed:535, collectRadius:15, cap:96, comboDuration:2.4},
  reviveProtection: 3,
} as const;

/** Distance between the rider's feet and the drop's ground position, in world units. */
export function pickupReach(item:Pick<Pickup,'groupId'>):number {
  return item.groupId ? CONFIG.pickup.choiceReach : CONFIG.pickup.reach;
}

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


