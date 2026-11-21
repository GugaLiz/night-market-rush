import {describe, expect, it} from 'vitest';
import {FrameQuality} from '../src/render/frame-quality';
import {FrameQuality as CocosFrameQuality} from '../cocos/assets/scripts/presentation/frame-quality';

function play(quality: FrameQuality, fps: number, seconds: number): void {
  for (let frame = 0; frame < fps * seconds; frame++) quality.sample(1 / fps, true);
}

const phoneDpr = (quality: FrameQuality) => quality.pixelRatio(956, 440, 3, 'standard');

describe('battle canvas quality', () => {
  it('shares the exact same model across the old web and Cocos hosts', () => {
    expect(FrameQuality).toBe(CocosFrameQuality);
    const quality = new CocosFrameQuality();
    play(quality, 30, 2);
    expect(quality.simplifyEffects).toBe(true);
    quality.sample(3, true); // Background gaps discard samples, not the current level.
    expect(quality.simplifyEffects).toBe(true);
    quality.reset();
    expect(quality.simplifyEffects).toBe(false);
  });

  it('keeps a healthy Retina viewport sharp and bounds the backing store on bigger screens', () => {
    const quality = new FrameQuality();
    play(quality, 60, 10);
    expect(quality.simplifyEffects).toBe(false);
    expect(phoneDpr(quality)).toBe(3);
    expect(quality.pixelRatio(956, 440, 3, 'simple')).toBe(1);
    expect(quality.pixelRatio(956, 440, 1, 'standard')).toBe(1);
    expect(quality.pixelRatio(2000, 1000, 3, 'standard') ** 2 * 2_000_000).toBeCloseTo(4_000_000);
  });

  it('simplifies effects first, lowers density under continued pressure, then restores clarity first', () => {
    const quality = new FrameQuality();
    play(quality, 30, 2);
    expect(quality.simplifyEffects).toBe(true);
    expect(phoneDpr(quality)).toBe(3);
    play(quality, 30, 2);
    expect(phoneDpr(quality)).toBe(1.5);
    play(quality, 60, 8);
    expect(phoneDpr(quality)).toBe(3);
    expect(quality.simplifyEffects).toBe(true);
    play(quality, 60, 8);
    expect(quality.simplifyEffects).toBe(false);
  });

  it('discards partial samples across pauses and background gaps, ignoring isolated slow frames', () => {
    const quality = new FrameQuality();
    play(quality, 30, 1);
    quality.sample(1 / 60, false);
    play(quality, 30, 1);
    quality.sample(4, true);
    play(quality, 30, 1);
    quality.sample(.09, true);
    play(quality, 60, 4);
    expect(quality.simplifyEffects).toBe(false);
    expect(phoneDpr(quality)).toBe(3);
  });
});
