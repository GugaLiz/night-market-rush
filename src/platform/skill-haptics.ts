import {EXPRESS} from '../core/ultimates';
import type {GameEvent} from '../shared/types';

// Alternating motor-on and rest intervals, in milliseconds.
const pulses = {
  icebox: [18, 22, 35],
  steamer: [34, 32, 56],
  berry: [75, 30, 35],
  vortex: [24, 36, 65],
  turn: [18],
  delivery: [28, 26, 40],
  finalDelivery: [55, 28, 75],
};

function pulseFor(event: GameEvent): number[] | undefined {
  if (event.type === 'elementalBurst' && event.kind === 'vortex') return pulses.vortex;
  if (event.type !== 'ultimateBeat') return;
  if (event.kind !== 'express') return pulses[event.kind];
  if (event.beat === EXPRESS.legs) return pulses.finalDelivery;
  return event.beat % EXPRESS.legsPerOrder === 0 ? pulses.delivery : pulses.turn;
}

export class SkillHaptics {
  private until = 0;
  private strength = 0;

  play(events: GameEvent[]): void {
    if (!events.length || typeof navigator.vibrate !== 'function' || document.hidden ||
        navigator.userActivation?.hasBeenActive === false) return;
    let selected: number[] | undefined;
    let strength = 0;
    for (const event of events) {
      const pulse = pulseFor(event);
      if (!pulse) continue;
      const onTime = pulse.reduce((sum, ms, index) => sum + (index % 2 === 0 ? ms : 0), 0);
      if (onTime > strength) { selected = pulse; strength = onTime; }
    }
    // A lighter bounce must not interrupt a heavy impact from the previous simulation step.
    const now = performance.now();
    if (!selected || (now < this.until && strength <= this.strength)) return;
    try {
      if (navigator.vibrate(selected)) {
        this.until = now + selected.reduce((sum, ms) => sum + ms, 0);
        this.strength = strength;
      }
    } catch { /* Device feedback may be unavailable in this browsing context. */ }
  }

  stop(): void {
    if (!this.until) return;
    this.until = 0;
    this.strength = 0;
    try { navigator.vibrate(0); } catch { /* A closing page can lose access to its motor. */ }
  }
}
