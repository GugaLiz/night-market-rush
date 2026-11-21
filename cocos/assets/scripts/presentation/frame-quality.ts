import type {Settings} from '../domain/shared/types';

const maxCanvasPixels = 4_000_000;

/** Platform-independent hysteresis. Cocos hosts may use simplifyEffects
 * without applying the optional Canvas pixel-ratio policy to the engine. */
export class FrameQuality {
  private level = 0;
  private frames = 0;
  private duration = 0;
  private slowWindows = 0;
  private fastWindows = 0;

  get simplifyEffects(): boolean { return this.level > 0; }

  reset(): void {
    this.level = 0;
    this.clearSamples();
  }

  private clearSamples(): void {
    this.frames = 0;
    this.duration = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  sample(elapsed: number, playing: boolean): void {
    if (!playing || !(elapsed > 0 && elapsed <= .25)) {
      this.clearSamples();
      return;
    }
    this.frames++;
    this.duration += elapsed;
    if (this.duration < .9) return;

    const fps = this.frames / this.duration;
    this.frames = 0;
    this.duration = 0;
    this.slowWindows = fps < 45 ? this.slowWindows + 1 : 0;
    this.fastWindows = fps > 55 ? this.fastWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.level < 2) {
      this.level++;
      this.clearSamples();
    } else if (this.fastWindows >= 8 && this.level > 0) {
      this.level--;
      this.clearSamples();
    }
  }

  /** Old browser-Canvas backing-store policy; not applied to Cocos by this model. */
  pixelRatio(width: number, height: number, deviceRatio: number, quality: Settings['quality']): number {
    const densityLimit = quality === 'simple' ? 1 : this.level === 2 ? 1.5 : 3;
    const budgetLimit = Math.sqrt(maxCanvasPixels / Math.max(1, width * height));
    return Math.min(deviceRatio || 1, densityLimit, budgetLimit);
  }
}
