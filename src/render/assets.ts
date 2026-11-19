import {clayFrames} from './clay-frames';

export type SpriteName = string;
export interface Sprite { x: number; y: number; width: number; height: number; image: HTMLImageElement }
export interface Assets {
  background: HTMLImageElement;
  riverside: HTMLImageElement;
  atlas: HTMLImageElement;
  deliveryFields: HTMLImageElement;
  ultimateFx: HTMLImageElement;
  strikes: HTMLImageElement;
  sprites: Record<SpriteName, Sprite>;
}

export async function loadAssets(onProgress?: (n: number) => void): Promise<Assets> {
  const files = [
    'clay-night-market.webp', 'clay-riverside-market.webp', 'clay-courier-home.webp', 'clay-actors.webp',
    'clay-weapons.webp', 'clay-supplies.webp', 'clay-courier-rig.webp', 'delivery-skills.webp',
    'weapon-strikes.webp', 'clay-ultimate-fx.webp', 'clay-shoe-views.webp', 'clay-enemy-faces.webp',
  ];
  let completed = 0;
  onProgress?.(0);
  const [background, riverside, courierHome, atlas, weapons, supplies, rig, deliveryFields, strikes, ultimateFx, footwear, enemyFaces] =
    await Promise.all(files.map(name => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => { onProgress?.(++completed / files.length); resolve(image); };
      image.onerror = () => reject(new Error(`无法加载美术资源：${name}`));
      image.src = `${import.meta.env.BASE_URL}assets/${name}`;
    })));

  const sprites: Record<SpriteName, Sprite> = {};
  function register(image: HTMLImageElement, frames: Record<string, readonly [number, number, number, number]>): void {
    for (const [name, [x, y, width, height]] of Object.entries(frames)) {
      sprites[name] = {image, x, y, width, height};
    }
  }
  register(atlas, clayFrames.actors);
  register(enemyFaces, clayFrames.enemyFaces);
  register(atlas, clayFrames.ultimates);
  register(weapons, clayFrames.weapons);
  register(supplies, clayFrames.supplies);
  register(rig, clayFrames.rig);
  register(footwear, clayFrames.footwear);
  sprites.courierA = {image: courierHome, x: 0, y: 0, width: courierHome.naturalWidth, height: courierHome.naturalHeight};
  sprites.courierB = sprites.courierA;
  sprites.giantBun = sprites.bun;
  return {background, riverside, atlas, deliveryFields, strikes, ultimateFx, sprites};
}
