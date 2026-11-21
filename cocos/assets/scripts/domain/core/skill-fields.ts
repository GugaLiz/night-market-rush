import type { GameState, SkillField, Vec } from '../shared/types';
import { CONFIG, WORLD } from './config';
import type { CombatContext } from './contracts';
import { clamp, distanceSquared, segmentDistanceSquared } from './geometry';

// Project tuning for the visible central burst and staggered outer flames.
const FIRE_LIFETIME = 2.8;
const CENTRAL_FIRE_GROWTH = .4;
const MAX_CASTS_PER_KIND = 3;
const OUTER_FLAMES = [
  { angle:0,   distance:415, radius:145, delay:.22 },
  { angle:-38, distance:410, radius:149, delay:.29 },
  { angle:38,  distance:410, radius:149, delay:.29 },
  { angle:-76, distance:395, radius:143, delay:.36 },
  { angle:76,  distance:395, radius:143, delay:.36 },
] as const;

/** The renderer and damage check use the same world-space circle at the same simulation time. */
export function skillFieldRadius(field: SkillField, time: number): number {
  if (time < field.bornAt || time >= field.expiresAt) return 0;
  if (field.kind !== 'fire') return field.radius;
  const main = field.id === field.castId;
  const initial = main ? CONFIG.skills.fan.radius : field.radius * .24;
  const growth = clamp((time - field.bornAt) / (main ? CENTRAL_FIRE_GROWTH : .22), 0, 1);
  const eased = growth * (2 - growth);
  return initial + (field.radius - initial) * eased;
}

function beginCast(s: GameState, kind: SkillField['kind'], ctx: CombatContext): number {
  const casts = [...new Set(s.fields.filter(field => field.kind === kind).map(field => field.castId))];
  if (casts.length >= MAX_CASTS_PER_KIND) {
    s.fields = s.fields.filter(field => field.castId !== casts[0]);
  }
  return ctx.id();
}

function addField(
  s: GameState, ctx: CombatContext, castId: number, kind: SkillField['kind'], center: Vec,
  radius: number, bornAt: number, expiresAt: number, primary = false,
): SkillField {
  const { left, right, top, bottom } = WORLD.bounds;
  const field: SkillField = {
    id: primary ? castId : ctx.id(), castId, kind,
    x: clamp(center.x, left, right), y: clamp(center.y, top, bottom),
    radius, bornAt, expiresAt, hitIds: [],
  };
  s.fields.push(field);
  return field;
}

function applyFire(s: GameState, field: SkillField, primary: SkillField, ctx: CombatContext): void {
  const radius = skillFieldRadius(field, s.time);
  for (const enemy of s.enemies) {
    if (!ctx.active(enemy) || primary.hitIds.includes(enemy.id)) continue;
    const reach = radius + enemy.radius;
    if (segmentDistanceSquared({ x: enemy.px, y: enemy.py }, enemy, field) > reach * reach) continue;
    const dx = enemy.x - field.x, dy = enemy.y - field.y;
    const angle = dx || dy ? Math.atan2(dy, dx) : (enemy.id % 2 ? 0 : Math.PI);
    if (ctx.damage(enemy, CONFIG.skills.fan.damage, 'fan', angle) > 0) {
      primary.hitIds.push(enemy.id);
      if (enemy.hp > 0) ctx.push(enemy, field, 30);
    }
  }
}

export function igniteFan(s: GameState, origin: Vec, facing: Vec, ctx: CombatContext): void {
  const castId = beginCast(s, 'fire', ctx);
  const expiresAt = s.time + FIRE_LIFETIME;
  const primary = addField(s, ctx, castId, 'fire', origin, CONFIG.skills.fan.fullRadius, s.time, expiresAt, true);
  const heading = Math.atan2(facing.y, facing.x);
  for (const flame of OUTER_FLAMES) {
    const angle = heading + flame.angle * Math.PI / 180;
    const center = { x: origin.x + flame.distance * Math.cos(angle), y: origin.y + flame.distance * Math.sin(angle) };
    addField(s, ctx, castId, 'fire', center, flame.radius, s.time + flame.delay, expiresAt);
  }
  // Pickups resolve before player contact. The central flame can rescue the player this step.
  applyFire(s, primary, primary, ctx);
}

export function spillSoda(s: GameState, origin: Vec, facing: Vec, ctx: CombatContext): void {
  const castId = beginCast(s, 'blue', ctx);
  const expiresAt = s.time + CONFIG.skills.soda.duration;
  addField(s, ctx, castId, 'blue', origin, CONFIG.skills.soda.poolRadius, s.time, expiresAt, true);
  for (const side of [-1, 1]) {
    const center = {
      x: origin.x + facing.x * 130 - facing.y * side * 114,
      y: origin.y + facing.y * 130 + facing.x * side * 114,
    };
    addField(s, ctx, castId, 'blue', center, CONFIG.skills.soda.sidePoolRadius, s.time, expiresAt);
  }
}

export function updateSkillFields(s: GameState, ctx: CombatContext): void {
  if (!s.fields.length) return;
  s.fields = s.fields.filter(field => field.expiresAt > s.time);
  // The first field of each cast owns its hit history; all members expire together.
  let primary: SkillField | undefined;
  for (const field of s.fields) {
    if (field.id === field.castId) primary = field;
    if (field.bornAt > s.time || !primary) continue;
    if (field.kind === 'fire') {
      applyFire(s, field, primary, ctx);
      continue;
    }
    for (const enemy of s.enemies) {
      if (!ctx.active(enemy) || distanceSquared(enemy, field) > (field.radius + enemy.radius) ** 2) continue;
      const nextStep = Math.min(field.expiresAt, s.time + CONFIG.step + 1e-9);
      enemy.slowUntil = Math.max(enemy.slowUntil, nextStep);
    }
  }
}
