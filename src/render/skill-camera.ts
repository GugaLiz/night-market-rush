import {WORLD} from '../core/config';
import {EXPRESS, WAVES} from '../core/ultimates';
import type {GameState, Vec} from '../shared/types';

/** Camera displacement in world units. Read the same clock and landings as the skill artwork. */
export function skillCameraOffset(state: GameState): Vec | null {
  let strongest = 0;
  let offset: Vec | null = null;
  function recoil(at: number, distance: number, duration: number, cycles: number, angle: number): void {
    const age = state.time - at;
    if (age < -1e-9 || age >= duration) return;
    const phase = Math.max(0, age) / duration;
    const envelope = distance * (1 - phase) ** 2;
    // Select by remaining strength so overlapping casts never add or cancel at wave crossings.
    if (envelope <= strongest) return;
    strongest = envelope;
    const displacement = envelope * Math.cos(phase * cycles * Math.PI * 2);
    offset = {x: Math.cos(angle) * displacement, y: Math.sin(angle) * displacement};
  }

  for (const cast of state.ultimates ?? []) {
    if (cast.kind === 'express') {
      const leg = cast.landings.length - 1;
      if (leg < 0) continue;
      const from = cast.landings[Math.max(0, leg - 1)];
      const to = leg === 0 ? cast.target : cast.landings[leg];
      const heading = Math.atan2(to.y - from.y, to.x - from.x);
      const at = cast.bornAt + EXPRESS.windup + leg * EXPRESS.leg;
      if (leg === 0) recoil(at, 5, .15, 1, heading + Math.PI);
      else if (leg === EXPRESS.legs) recoil(at, 14, .33, 1.5, heading);
      else if (leg % EXPRESS.legsPerOrder === 0) recoil(at, 9, .23, 1.25, heading);
      else recoil(at, 4.5, .14, 1, heading);
      continue;
    }
    if (!cast.released) continue;
    const at = cast.bornAt + WAVES[cast.kind].windup;
    switch (cast.kind) {
      case 'icebox': recoil(at, 11, .24, 1.5, cast.angle + Math.PI); break;
      case 'steamer': recoil(at, 12, .38, 1.35, -Math.PI / 2); break;
      case 'berry': recoil(at, 16, .34, 1.8, -1.15); break;
    }
  }
  for (const field of state.elementalFields ?? []) {
    if (field.kind === 'vortex') {
      // The pan pulls the street toward its mouth, then kicks in the opposite direction on closing.
      const heading = Math.atan2(field.y - WORLD.height / 2, field.x - WORLD.width / 2);
      if (field.released) recoil(field.releaseAt, 10, .29, 1.3, heading + Math.PI);
      else recoil(field.bornAt, 4, .21, 1, heading);
    } else if (field.kind === 'frost' && field.released) {
      recoil(field.releaseAt, 4, .16, 1.4, -Math.PI / 2);
    }
  }
  return offset;
}
