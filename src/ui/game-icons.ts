import {clayFrames} from '../render/clay-frames';

type Frame = readonly [number, number, number, number];
const artwork = new Map<string,string>();
const asset = (file:string) => `${import.meta.env.BASE_URL}assets/${file}`;

function registerAtlas(file:string, frames:Record<string,Frame>):void {
  for(const [name,[x,y,width,height]] of Object.entries(frames)){
    // The inner viewport clips the sheet. The outer viewport fits the cropped object
    // inside the available slot, including the tall, narrow status badges.
    const inset=8;
    artwork.set(name,`<svg class="atlas-icon" data-icon="${name}" aria-hidden="true" focusable="false" viewBox="-${inset} -${inset} ${width+2*inset} ${height+2*inset}">
      <svg width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" overflow="hidden"><image href="${asset(file)}"/></svg>
    </svg>`);
  }
}

registerAtlas('clay-weapons.webp',clayFrames.weapons);
registerAtlas('clay-supplies.webp',clayFrames.supplies);
registerAtlas('clay-elemental-tools.webp',clayFrames.elementals);
registerAtlas('clay-actors.webp',clayFrames.ultimates);
registerAtlas('clay-market-mascots.webp',clayFrames.mascots);
registerAtlas('clay-market-elites.webp',clayFrames.elites);
registerAtlas('clay-market-champions.webp',clayFrames.champions);
registerAtlas('clay-market-bosses.webp',clayFrames.bosses);
registerAtlas('clay-street-snacks.webp',clayFrames.streetSnacks);
registerAtlas('clay-bun-courier-rig.webp',{rigBag:clayFrames.rig.rigBag,rigBagSide:clayFrames.rig.rigBagSide});
artwork.set('health',`<img class="atlas-icon" data-icon="health" alt="" src="${asset('clay-soup-dumpling.webp')}">`);
artwork.set('brand',`<img class="brand-mark" alt="" src="${import.meta.env.BASE_URL}icons/delivery-box.svg">`);

const symbols:Record<string,string> = {
  pause:'<path d="M8 5v14M16 5v14"/>',
  fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  heart:'<path fill="currentColor" stroke="none" d="M12 21C9 18.8 2 13.6 2 8.1a5.5 5.5 0 0 1 10-3.2 5.5 5.5 0 0 1 10 3.2c0 5.5-7 10.7-10 12.9Z"/>',
  dash:'<path d="m11 6 6 6-6 6m5-12 6 6-6 6M3 9h6m-7 5h5"/>',
  check:'<path d="m4.5 12 5 5 10-11"/>',
};

export function icon(name:string):string {
  const sprite=artwork.get(name);
  if(sprite)return sprite;
  const symbol=symbols[name];
  if(!symbol)return '';
  return `<svg viewBox="0 0 24 24" data-icon="${name}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${symbol}</svg>`;
}
