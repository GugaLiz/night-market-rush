import {isGuard,type EnemyKind,type Pickup} from '../shared/types';

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
const eliteRadius=34;
const guardAwareness={notice:1400, release:1500};
export const CONFIG = {
  step: 1 / 60,
  player: {
    speed: .75 * S, precisionSpeed: .46 * S, accelerationTime: .030, decelerationTime: .022,
    turnRate: 18 * Math.PI, aimThreshold: .075,
    radius: .018 * S, minY:180, hp:100, protection:.75, sprintRampTime:1.6, sprintMax:1.4,
    dashDuration:.18, dashCooldown:3, dashSpeed:1.42*S, dashExitTime:.055,
  },
  enemies: {
    bun: {speed: .075 * S, radius: .020 * S, coins:1, hp:30, damage:8},
    onigiri: {speed: .096 * S, radius:11, coins:1, hp:26, damage:8},
    siumai: {speed: .086 * S, radius:10, coins:1, hp:32, damage:8},
    zongzi: {speed: .078 * S, radius:12, coins:1, hp:38, damage:8},
    box: {speed: .065 * S, radius: .022 * S, coins:2, hp:60, damage:12},
    bowl: {speed: .045 * S, radius: .040 * S, coins:3, hp:120, damage:18},
    giantBun: {speed:0, radius:eliteRadius, coins:12, hp:520, damage:20},
    eliteCrab: {speed:62, radius:eliteRadius, coins:12, hp:500, damage:14},
    eliteKettle: {speed:40, radius:eliteRadius, coins:12, hp:440, damage:12},
    eliteSesame: {speed:36, radius:eliteRadius, coins:12, hp:460, damage:12},
    eliteSkewer: {speed:72, radius:eliteRadius, coins:12, hp:430, damage:12},
    eliteLotus: {speed:42, radius:eliteRadius, coins:13, hp:540, damage:14},
    eliteChili: {speed:85, radius:eliteRadius, coins:12, hp:400, damage:11},
    eliteTofu: {speed:34, radius:eliteRadius, coins:15, hp:640, damage:16},
    eliteTanghulu: {speed:55, radius:eliteRadius, coins:13, hp:450, damage:12},
    eliteRoll: {speed:82, radius:eliteRadius, coins:12, hp:475, damage:12},
    epicHotpot: {speed:41, radius:48, coins:32, hp:1500, damage:18},
    epicDragon: {speed:95, radius:43, coins:34, hp:1420, damage:15},
    epicOpera: {speed:68, radius:44, coins:35, hp:1580, damage:16},
    epicPearl: {speed:46, radius:46, coins:36, hp:1690, damage:15},
    epicSteamer: {speed:30, radius:51, coins:40, hp:1920, damage:19},
  } satisfies Record<EnemyKind, {speed: number; radius: number; coins:number; hp:number; damage:number}>,
  awareness: {
    bun: {notice:190, release:270},
    onigiri: {notice:200, release:275},
    siumai: {notice:175, release:255},
    zongzi: {notice:200, release:285},
    box: {notice:235, release:330},
    bowl: {notice:soupRange, release:920},
    giantBun:guardAwareness, eliteCrab:guardAwareness, eliteKettle:guardAwareness, eliteSesame:guardAwareness,
    eliteSkewer:guardAwareness, eliteLotus:guardAwareness, eliteChili:guardAwareness, eliteTofu:guardAwareness,
    eliteTanghulu:guardAwareness, eliteRoll:guardAwareness, epicHotpot:guardAwareness, epicDragon:guardAwareness,
    epicOpera:guardAwareness, epicPearl:guardAwareness, epicSteamer:guardAwareness,
  },
  dash: {warning: 1.1, duration: .5, recovery: 1.5, speed: .38 * S, damage:20, approach: 4, concurrent: 1},
  giant: {
    warning:.85, finalWarning:1, flight:.45, between:.32, recovery:2.35,
    stompRadius:92, localDuration:.20, printLifetime:3.15, pulseSpeed:690, pulseHalfWidth:14,
    gapHalfAngle:Math.PI*.22, finalDamage:24,
  },
  ranged: {warning:.9,interval:5,speed:145,damage:8,radius:6,cap:12,lifetime:6.5,range:soupRange,concurrent:2},
  elites: {
    crab: {range:650, warning:1.1, duration:.96, recovery:1.35, approach:2.1, speed:650, halfWidth:56, damage:26},
    kettle: {range:900, warning:1.2, interval:3.6, shots:5, spread:Math.PI*.60, speed:255, radius:14, damage:15, lifetime:4.2},
    sesame: {range:840, warning:1.35, interval:3.4, radius:120, damage:22, fade:.32},
  },
  skills: {
    health: {amount:25, cooldown:15},
    stamp: {duration:12},
    supply: {duration:12},
    fan: {radius:155, fullRadius:365, damage:108},
    skate: {duration:4, inner:38, outer:140, damage:20, interval:.5},
    soda: {radius:260, duration:3, factor:.35, poolRadius:108, sidePoolRadius:78},
    lure: {radius:270, targets:10},
    bell: {radius:240, targets:18, duration:2, maxDuration:3, resistance:1},
    hook: {radius:520, targets:3, duration:4, launchTime:.10, reelTimeout:2, speed:1050},
    dispatch: {radius:270, push:76, recoilTime:.24, slowTime:1.4, duration:4, maxDuration:6, cooldown:2},
    route: {length:420, width:110, duration:5, speedMultiplier:1.2},
    cones: {minCount:5, maxCount:8, duration:10, radius:21},
  },
  spawn: {warning:.6, safeDistance:.22*S, gap:43, attempts:48, openingCount:40},
  pickup: {radius: .027 * S, reach:56, choiceReach:42, driftMin:90, driftMax:115, firstAt:.35, interval:3, emptyGrace:2, cap:4, firstUltimate:6, ultimateInterval:12},
  weapons: {projectileCap:24, dropFirst:4, dropInterval:12, dropRadius:12, pickupReach:42},
  // V4 tuning values for the night-market adaptation. The video only establishes visible outcomes.
  waves: {firstDuration:36, duration:34, eliteLead:6, maxElites:2, epicEvery:5, transition:1.65},
  rewards: {coinGrace:.42, attractionRadius:110, attractionSpeed:535, collectRadius:15, cap:96, comboDuration:2.4},
  reviveProtection: 3,
} as const;

/** Keep the tall elite silhouettes on the same open paving as the courier. */
export function enemyMinY(kind:EnemyKind,radius:number):number {
  return Math.max(WORLD.bounds.top+radius,isGuard(kind)?CONFIG.player.minY:WORLD.bounds.top);
}

/** Distance between the rider's feet and the drop's ground position, in world units. */
export function pickupReach(item:Pick<Pickup,'groupId'>):number {
  return item.groupId ? CONFIG.pickup.choiceReach : CONFIG.pickup.reach;
}

export interface Difficulty {
  stage: number;
  cap: number;
  interval: number;
  speedScale: number;
  weights: readonly [snacks:number, box:number, bowl:number];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Continuous rates at boundaries; no unbounded escalation after five minutes. */
export function difficultyAt(time: number): Difficulty {
  if (time < 30) return {stage: 1, cap: 45, interval: mix(.14, .12, time / 30), speedScale: 1, weights: [1, 0, 0]};
  if (time < 90) return {stage: 2, cap: 70, interval: mix(.12, .10, (time - 30) / 60), speedScale: mix(1, 1.05, (time - 30) / 12), weights: [.85, .05, .10]};
  if (time < 180) return {stage: 3, cap: 90, interval: mix(.10, .088, (time - 90) / 90), speedScale: mix(1.05, 1.1, (time - 90) / 15), weights: [.80, .08, .12]};
  return {stage: 4, cap: 100, interval: mix(.088, .08, (time - 180) / 120), speedScale: mix(1.1, 1.15, (time - 180) / 20), weights: [.78, .08, .14]};
}


