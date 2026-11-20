import {describe, expect, it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import {EXPRESS, expressCast, WAVES} from '../src/core/ultimates';
import {skillCameraOffset} from '../src/render/skill-camera';
import type {Vec} from '../src/shared/types';

const still = {x: 0, y: 0};
const strength = (offset: Vec | null) => offset ? Math.hypot(offset.x, offset.y) : 0;

function emptyStreet() {
  const game = new Game(24);
  game.reset(24, true);
  game.state.weapon.readyAt = Infinity;
  return game;
}

describe('skill camera', () => {
  it.each(['icebox', 'steamer', 'berry'] as const)('%s kicks at release and settles on the simulation clock', kind => {
    const game = emptyStreet();
    game.state.player.moveDirection = {x: -1, y: 0};
    game.triggerSkill(kind);
    expect(skillCameraOffset(game.state)).toBeNull();
    while (game.state.time < WAVES[kind].windup) game.update(CONFIG.step, still);
    const kick = skillCameraOffset(game.state);
    expect(strength(kick)).toBeGreaterThan(7);
    if (kind === 'icebox') expect(kick!.x).toBeGreaterThan(7);
    if (kind === 'steamer') expect(kick!.y).toBeLessThan(-7);
    expect(skillCameraOffset(game.state)).toEqual(kick);
    for (let i = 0; i < 26; i++) game.update(CONFIG.step, still);
    expect(skillCameraOffset(game.state)).toBeNull();
  });

  it('follows each incoming delivery and accentuates the three real signatures', () => {
    const game = emptyStreet();
    game.triggerSkill('express');
    const route = expressCast(game.state)!;
    const peaks: number[] = [];
    for (let i = 0; i < 930; i++) {
      game.update(CONFIG.step, still);
      for (const event of game.drainEvents()) {
        if (event.type !== 'ultimateBeat') continue;
        // Sample the exact landing inside the latest physics step.
        const at = route.bornAt + EXPRESS.windup + event.beat * EXPRESS.leg;
        const kick = skillCameraOffset({...game.state, time: at})!;
        const from = route.landings[event.beat - 1];
        expect(kick.x * (event.x - from.x) + kick.y * (event.y - from.y)).toBeGreaterThan(0);
        peaks.push(strength(kick));
        expect(skillCameraOffset({...game.state, time: at + .4})).toBeNull();
      }
    }
    expect(peaks).toHaveLength(EXPRESS.legs);
    [4.5, 4.5, 4.5, 9, 4.5, 4.5, 4.5, 9, 4.5, 4.5, 4.5, 14].forEach((distance, i) => {
      expect(peaks[i]).toBeCloseTo(distance);
    });
  });

  it('overlapping releases keep the strongest impulse and make no change to the simulation', () => {
    const game = emptyStreet();
    game.triggerSkill('steamer');
    game.triggerSkill('berry');
    for (let i = 0; i < 11; i++) game.update(CONFIG.step, still);
    const state = game.state;
    const before = structuredClone(state);
    const berry = skillCameraOffset({...state, ultimates: state.ultimates!.filter(c => c.kind === 'berry')});
    expect(skillCameraOffset(state)).toEqual(berry);
    expect(strength(berry)).toBeLessThanOrEqual(16);
    expect(state).toEqual(before);
  });

  it('the vortex kicks on opening and recoils on closing with a quiet pull in between', () => {
    const game = emptyStreet();
    game.triggerSkill('vortex');
    const open = skillCameraOffset(game.state)!;
    expect(strength(open)).toBeCloseTo(4);
    for (let i = 0; i < 30; i++) game.update(CONFIG.step, still);
    expect(skillCameraOffset(game.state)).toBeNull();
    const pot = game.state.elementalFields![0];
    while (!pot.released) game.update(CONFIG.step, still);
    const close = skillCameraOffset({...game.state, time: pot.releaseAt})!;
    expect(open.x * close.x + open.y * close.y).toBeLessThan(0);
    expect(strength(close)).toBeCloseTo(10);
  });
});
