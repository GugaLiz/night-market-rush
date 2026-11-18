export type SpriteName = string;
export interface Sprite { x: number; y: number; width: number; height: number; image: HTMLImageElement }
export interface Assets { background: HTMLImageElement; atlas: HTMLImageElement; sprites: Record<SpriteName, Sprite> }

/** Keeps source artwork intact; each atlas cell is trimmed once at load time. */
export async function loadAssets(onProgress?: (n: number) => void): Promise<Assets> {
  let completed = 0;
  const load = (name: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { onProgress?.(++completed / 5); resolve(img); };
    img.onerror = () => reject(new Error(`无法加载美术资源：${name}`));
    img.src = `${import.meta.env.BASE_URL}assets/${name}`;
  });
  onProgress?.(0);
  const [background, atlas, weapons, skills, rig] = await Promise.all([load('night-market.png'), load('atlas.png'),load('weapons-v2.png'),load('skills-v2.png'),load('courier-rig.png')]);
  const sprites: Record<string,Sprite> = {};
  function trim(atlas:HTMLImageElement,names:string[],rows:number) {
  const scratch = document.createElement('canvas');
  scratch.width = atlas.naturalWidth; scratch.height = atlas.naturalHeight;
  const context = scratch.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('当前浏览器无法创建游戏画布');
  context.drawImage(atlas, 0, 0);
  const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
  for (let index = 0; index < names.length; index++) {
    const x0 = Math.floor((index % 4) * scratch.width / 4), x1 = Math.floor((index % 4 + 1) * scratch.width / 4);
    const y0 = Math.floor(Math.floor(index / 4) * scratch.height / rows), y1 = Math.floor((Math.floor(index / 4) + 1) * scratch.height / rows);
    let left = x1, top = y1, right = x0, bottom = y0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (pixels[(y * scratch.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (left > right) throw new Error(`角色图集缺少素材：${names[index]}`);
    left = Math.max(x0, left - 2); top = Math.max(y0, top - 2);
    right = Math.min(x1 - 1, right + 2); bottom = Math.min(y1 - 1, bottom + 2);
    sprites[names[index]] = {x: left, y: top, width: right - left + 1, height: bottom - top + 1,image:atlas};
  }
  }
  trim(atlas,['courierA','courierB','bun','box','bowl','fan','skate','soda'],2);
  trim(weapons,['tongs','bag','chopsticks','spirit','knife','tray','umbrella','sword','lunchbox','talisman','spiritOrb','meal','chopstick','talismanPaper','umbrellaOpen','weaponCrate'],4);
  trim(skills,['fan','skate','soda','lure','bubble','cones','bell','route','hook','heat','dispatch','stamp','supply','cone','lureBox','supplyBox'],4);
  trim(rig,['rigHeadFront','rigHeadBack','rigTorsoFront','rigTorsoBack','rigUpperR','rigUpperL','rigForeR','rigForeL','rigHipFront','rigHipBack','rigThigh','rigShin','rigShoeR','rigShoeL','rigBag','rigTail'],4);
  return {background, atlas, sprites};
}
