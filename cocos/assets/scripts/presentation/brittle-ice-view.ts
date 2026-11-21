import {Color,Graphics} from 'cc';
import {WORLD} from '../domain/core/config';
import type {BrittleIceVisual} from './brittle-ice-model';

type Point=readonly [number,number];
const color=(hex:string,alpha=255)=>{const value=new Color().fromHEX(hex);value.a=alpha;return value;};

/** Paint the original's central cracks and two chipped bevels over the frozen
 * shell. Coordinates are normalized to the original art's height; a lifted
 * actor can supply the same pose lift used by its existing status layer. */
export function drawBrittleIce(g:Graphics,v:BrittleIceVisual,lift=0):void {
  const x=v.x-WORLD.width/2,feet=WORLD.height/2-v.y+lift,h=v.height;
  const p=([dx,dy]:Point):Point=>[x+dx*h,feet-dy*h];
  const path=(points:readonly Point[],close=false)=>{
    points.forEach((point,i)=>{const [px,py]=p(point);if(i)g.lineTo(px,py);else g.moveTo(px,py);});
    if(close)g.close();
  };
  const lines=(segments:readonly (readonly Point[])[])=>{for(const segment of segments)path(segment);};
  const central:readonly (readonly Point[])[]=[
    [[.12,-1],[-.09,-.72],[.035,-.65],[-.18,-.43],[-.05,-.38],[-.23,-.12]],
    [[.035,-.65],[.18,-.58],[.27,-.63]],
  ];
  lines(central);g.lineWidth=.073*h;g.strokeColor=color('#52869b');g.stroke();
  lines(central);g.lineWidth=.044*h;g.strokeColor=color('#fffef0');g.stroke();
  const bevels:readonly (readonly Point[])[]=[
    [[-.48,-.44],[-.34,-.84],[.04,-1.05],[.16,-.96]],
    [[.47,-.43],[.50,-.32],[.27,.01],[-.05,0]],
  ];
  for(const [hex,width] of [['#215d7b',Math.min(.085*h,7)],['#66e5f4',Math.min(.055*h,4.7)],['#f3fffe',Math.min(.021*h,2)]] as const){
    lines(bevels);g.lineWidth=width;g.strokeColor=color(hex);g.stroke();
  }
  for(const side of [-1,1]){
    const cy=side===1?-.35:-.51;
    const chip=(dx:number,dy:number):Point=>[side*(.46+dx),cy+dy];
    const a=chip(-.045,.115),b=chip(.016,-.084),c=chip(.151,-.199),d=chip(.147,-.057),e=chip(.055,.077);
    path([a,b,c,d,e],true);g.fillColor=color('#4db7d2');g.fill();
    path([a,b,c,d,e],true);g.lineWidth=Math.min(.042*h,3);g.strokeColor=color('#255d79');g.stroke();
    path([a,chip(.074,-.064),c,b],true);g.fillColor=color('#d5ffff');g.fill();
    if(v.detail){
      path([b,chip(.095+.044*v.sheen,-.15-.035*v.sheen)]);
      g.lineWidth=Math.min(.030*h,2.5);g.strokeColor=color('#fffef0',Math.round(255*(.6+.4*v.sheen)));g.stroke();
    }
  }
}
