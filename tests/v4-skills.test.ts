import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { Game } from '../src/core/game';
import { skillFieldRadius } from '../src/core/skill-fields';

const idle = { x: 0, y: 0 };

function arena() {
  const game = new Game(23);
  game.reset(23, true);
  game.state.weapon.readyAt = 1000;
  return game;
}

describe('V4 ground skills', () => {
  it('opens at pickup, grows over time, and lights outer pockets without clearing the whole crowd', () => {
    const game = arena();
    const { x, y } = game.state.player;
    const offsets = [70, 210, 325, 480];
    const enemies = offsets.map(offset => {
      const enemy = game.spawnEnemy('bowl', { x: x + offset, y });
      enemy.stunUntil = 5;
      return enemy;
    });
    game.triggerSkill('fan');
    const [main, firstOuter] = game.state.fields;
    expect(skillFieldRadius(main, 0)).toBeCloseTo(CONFIG.skills.fan.radius);
    expect(skillFieldRadius(firstOuter, 0)).toBe(0);
    expect(enemies.map(enemy => enemy.hp)).toEqual([30, 120, 120, 120]);
    game.update(.1, idle);
    expect(enemies[2].hp).toBe(120);
    game.update(.31, idle);
    expect(skillFieldRadius(main, game.state.time)).toBe(main.radius);
    expect(enemies.map(enemy => enemy.hp)).toEqual([30, 30, 30, 120]);
    expect(game.state.fields).toHaveLength(6);
    const direction = { x: -1, y: 0 };
    // Cross two overlapping flames with an already hit survivor after snapshotting the fields.
    game.state.fields = JSON.parse(JSON.stringify(game.state.fields));
    Object.assign(enemies[0], { x: x + 175, px: x + 175 });
    const late = game.spawnEnemy('bun', { x: x + 200, y });
    game.update(.2, direction);
    expect(late.hp).toBe(0);
    expect(enemies[0].hp).toBe(30);
    expect(game.state.player.x).toBeLessThan(x);
    expect(main.x).toBe(x);
    for (let i = 0; i < 3; i++) game.update(1, idle);
    expect(game.state.fields).toHaveLength(0);
    expect(enemies[3].hp).toBe(120);
  });

  it('slows late entrants only while they are in a spill and keeps initial splash duration', () => {
    const game = arena();
    const { x, y } = game.state.player;
    const splashed = game.spawnEnemy('bowl', { x: x - 245, y });
    game.triggerSkill('soda');
    expect(splashed.slowUntil).toBe(CONFIG.skills.soda.duration);
    expect(game.state.fields).toHaveLength(3);
    const puddle = game.state.fields[1];
    const late = game.spawnEnemy('bowl', { x: puddle.x, y: puddle.y });
    game.update(.1, idle);
    expect(late.slowUntil).toBeGreaterThan(game.state.time);
    Object.assign(late, { x: 1040, y: 550, px: 1040, py: 550 });
    game.update(.1, idle);
    expect(late.slowUntil).toBeLessThan(game.state.time);
    expect(late.hp).toBe(late.maxHp);
    expect(splashed.slowUntil).toBe(CONFIG.skills.soda.duration);
    for (let i = 0; i < 3; i++) game.update(1, idle);
    expect(game.state.fields).toHaveLength(0);
  });

  it('bounds repeated casts per kind while keeping each retained fire group complete', () => {
    const game = arena();
    for (let i = 0; i < 12; i++) {
      game.triggerSkill('fan');
      game.triggerSkill('soda');
    }
    const fire = game.state.fields.filter(field => field.kind === 'fire');
    const blue = game.state.fields.filter(field => field.kind === 'blue');
    expect(fire).toHaveLength(18);
    expect(blue).toHaveLength(9);
    expect(new Set(fire.map(field => field.castId)).size).toBe(3);
    for (const field of fire) expect(fire.some(item => item.id === field.castId)).toBe(true);
    game.reset(23, true);
    expect(game.state.fields).toHaveLength(0);
  });
});
