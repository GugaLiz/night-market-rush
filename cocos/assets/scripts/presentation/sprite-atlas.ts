import {Rect, Size, SpriteFrame, Texture2D} from 'cc';
import {clayFrames} from './clay-frames';

/** Extension-free Creator resource names; artwork retains the web source dimensions. */
export const ATLAS_IMAGES = {
  mascots: 'clay-market-mascots',
  elites: 'clay-market-elites',
  champions: 'clay-market-champions',
  bosses: 'clay-market-bosses',
  streetSnacks: 'clay-street-snacks',
  ultimates: 'clay-actors',
  weapons: 'clay-weapons',
  supplies: 'clay-supplies',
  elementals: 'clay-elemental-tools',
  rig: 'clay-bun-courier-rig',
  workwear: 'clay-courier-workwear',
  orderStall: 'clay-order-stall',
  health: 'clay-soup-dumpling',
  courierHome: 'clay-chibi-home',
} as const;

export type AtlasImage = keyof typeof ATLAS_IMAGES;
export type AtlasTextures = Readonly<Record<AtlasImage, Texture2D>>;
export type SourceRect = readonly [x: number, y: number, width: number, height: number];

/**
 * Cocos owns the textures supplied by the caller. This object owns only its
 * generated SpriteFrames; release them when no Sprite refers to them anymore.
 * Frames represent the exact web source rectangles with no additional trimming.
 */
export class SpriteAtlas {
  private readonly frames = new Map<string, SpriteFrame>();
  private disposed = false;

  constructor(textures: AtlasTextures) {
    try {
      this.addGroup(textures.mascots, clayFrames.mascots);
      this.addGroup(textures.elites, clayFrames.elites);
      this.addGroup(textures.champions, clayFrames.champions);
      this.addGroup(textures.bosses, clayFrames.bosses);
      this.addGroup(textures.streetSnacks, clayFrames.streetSnacks);
      this.addGroup(textures.ultimates, clayFrames.ultimates);
      this.addGroup(textures.weapons, clayFrames.weapons);
      this.addGroup(textures.supplies, clayFrames.supplies);
      this.addGroup(textures.elementals, clayFrames.elementals);
      this.addFull('orderStall', textures.orderStall);
      this.addFull('health', textures.health);
      this.addGroup(textures.rig, clayFrames.rig);
      this.addGroup(textures.workwear, clayFrames.workwear);
      this.addFull('courierA', textures.courierHome);
      // The web loader deliberately uses one frame for both names.
      this.frames.set('courierB', this.require('courierA'));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Missing sprites are reported explicitly rather than silently drawn blank. */
  require(name: string): SpriteFrame {
    if (this.disposed) throw new Error('SpriteAtlas has already been disposed');
    const frame = this.frames.get(name);
    if (!frame) throw new Error(`Unknown atlas sprite: ${name}`);
    return frame;
  }

  /** The returned dimensions are the same source rectangle used by web drawing. */
  size(name: string): Readonly<{width: number; height: number}> {
    const frame = this.require(name);
    return {width: frame.rect.width, height: frame.rect.height};
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // courierA and courierB alias the same owned frame.
    for (const frame of new Set(this.frames.values())) frame.destroy();
    this.frames.clear();
  }

  private addFull(name: string, texture: Texture2D): void {
    this.add(name, texture, [0, 0, texture.width, texture.height]);
  }

  private addGroup(texture: Texture2D, group: Readonly<Record<string, SourceRect>>): void {
    for (const [name, rect] of Object.entries(group)) this.add(name, texture, rect);
  }

  private add(name: string, texture: Texture2D, [x, y, width, height]: SourceRect): void {
    if (this.frames.has(name)) throw new Error(`Duplicate atlas sprite: ${name}`);
    if (!texture || width <= 0 || height <= 0 || x < 0 || y < 0 ||
        x + width > texture.width || y + height > texture.height) {
      throw new Error(`Invalid atlas rectangle for ${name}: ${x},${y},${width},${height}`);
    }
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(x, y, width, height);
    frame.originalSize = new Size(width, height);
    // A frame is a subrectangle of a source atlas, so do not repack it at runtime.
    frame.packable = false;
    this.frames.set(name, frame);
  }
}
