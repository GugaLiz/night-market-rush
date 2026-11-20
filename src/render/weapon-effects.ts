import type {Settings, Vec, WeaponKind} from '../shared/types';
import {drawChopstickImpact,drawChopstickRelease} from './bamboo-volley';

const TAU = Math.PI * 2;
export const TONG_PRESS_TIME=.042;
const ink = '#493040';
interface Material {dark:string; mid:string; light:string}
const materials:Record<WeaponKind,Material> = {
  tongs:     {dark:'#a74138',mid:'#ff963e',light:'#fff2b7'},
  knife:     {dark:'#455283',mid:'#8fe7f3',light:'#f3ffff'},
  sword:     {dark:'#b34a39',mid:'#ffa048',light:'#fff4b7'},
  umbrella:  {dark:'#367f79',mid:'#91dac0',light:'#fff3b6'},
  bag:       {dark:'#a77849',mid:'#eccb8d',light:'#fff4c4'},
  chopsticks:{dark:'#b14c30',mid:'#ffb543',light:'#fff3af'},
  tray:      {dark:'#47699e',mid:'#83ddf7',light:'#fff6ce'},
  spirit:    {dark:'#117b76',mid:'#67e7b9',light:'#f2ffd5'},
  lunchbox:  {dark:'#b54937',mid:'#ff9555',light:'#fff2a8'},
  talisman:  {dark:'#9d3f67',mid:'#ffc767',light:'#fff5be'},
};
const strikeAnchorX=[.70,.53,.79,.55] as const;

// Tool-scale silhouettes with the cut, fold or gleam picked out in a second pass.
// Local +x is the actual strike direction, and the left edge touches the tool.
interface StrokeArt {body:Path2D; detail:Path2D}
const shape=(body:string,detail:string):StrokeArt=>({body:new Path2D(body),detail:new Path2D(detail)});
const makeStroke:Record<WeaponKind,()=>StrokeArt>={
  // The two tips pinch shut and pull a pair of hooked wisps inwards.
  tongs:()=>shape('M0 -6 Q13 -23 30 -12 Q18 -15 10 -4 L19 -2 Q8 1 0 -6 Z M0 6 Q10 18 24 11 Q16 12 9 4 L16 2 Q6 0 0 6 Z',
    'M5 -7 Q14 -17 23 -15 M4 6 Q10 13 16 13'),
  knife:()=>shape('M-2 4 L30 -13 L18 -3 L22 -4 L5 7 L9 3 Z M7 10 Q17 3 28 1 L21 6 L24 6 L13 11 Z',
    'M2 3 L24 -9 M13 8 L21 5'),
  sword:()=>shape('M-2 -11 L25 -11 L30 -5 L17 -3 L14 4 L6 5 L2 12 L-1 11 L4 1 L-2 0 Z M13 9 L21 3 L20 9 L13 12 Z',
    'M4 -10 V-4 M10 -10 V-7 M16 -10 V-5 M22 -10 V-7'),
  // Scallops and three converging ribs follow the rim of the open canopy.
  umbrella:()=>shape('M0 1 Q3 -13 16 -17 Q14 -10 22 -11 Q20 -4 27 -2 Q19 5 22 11 Q14 9 13 16 Q4 12 0 1 Z',
    'M2 1 Q9 -6 16 -16 M2 1 Q12 -2 25 -2 M2 1 Q10 6 13 14'),
  bag:()=>shape('M0 -3 Q5 -8 12 -13 L19 -12 L23 -16 Q34 -1 22 15 L17 11 L12 13 Q5 8 0 3 Z',
    'M4 -3 L13 -8 L18 -7 L22 -11 M5 3 L13 6 L17 5 L22 10 M15 -5 Q19 0 15 4'),
  chopsticks:()=>shape('M-2 -4 L27 -14 L17 -7 L-1 0 Z M-1 1 L33 -2 L24 1 L-1 4 Z M1 5 L25 10 L18 11 L1 7 Z',
    'M3 -4 L17 -9 M4 2 L22 0 M5 6 L15 8'),
  tray:()=>shape('M-3 -5 C13 -20 35 -11 30 3 C29 8 22 13 16 14 C26 8 28 3 25 -2 C20 -10 8 -10 -3 -2 Z M0 2 C8 12 20 12 24 8 C16 18 4 12 0 6 Z',
    'M5 -7 Q22 -14 28 -2 M5 7 Q10 12 16 12'),
  spirit:()=>shape('M-3 3 Q3 3 7 -7 C12 -20 29 -17 27 -6 C25 1 17 2 17 -4 C17 -7 21 -9 23 -6 C20 -12 13 -8 14 -2 C17 11 6 16 -3 8 Z M26 8 Q30 -1 33 6 Q33 11 28 12 Z',
    'M1 6 Q7 6 10 -5 M13 -10 Q19 -16 24 -11 M27 8 L29 5'),
  // A hot burst through the lid vent; the three plumes widen towards their ends.
  lunchbox:()=>shape('M0 -4 C5 -7 4 -15 13 -17 Q20 -19 17 -13 Q11 -12 12 -8 L6 -3 Z M3 -1 Q10 -1 15 -6 Q25 -14 29 -8 Q32 -3 25 -2 Q17 -3 12 2 L4 3 Z M3 6 Q13 4 18 5 Q29 4 25 12 Q21 16 16 10 Z',
    'M6 -6 Q8 -13 13 -14 M9 0 L18 -6 M13 7 L20 9'),
  // Red ink takes the outline of the order stamp and leaves two uneven flecks.
  talisman:()=>shape('M1 -11 L20 -9 L19 11 L-1 9 Z M23 -10 L28 -12 L26 -7 Z M23 8 L27 7 L29 11 L25 11 Z',
    'M4 -7 L16 -6 L15 7 L3 6 Z M6 -2 L13 -1 M8 -4 L7 3 L11 2'),
};
const strokes=new Map<WeaponKind,StrokeArt>();
function materialStroke(c:CanvasRenderingContext2D,kind:WeaponKind):void {
  let art=strokes.get(kind);
  if(!art){art=makeStroke[kind]();strokes.set(kind,art);}
  const m=materials[kind];
  c.lineCap='round';c.lineJoin='round';c.fillStyle=kind==='talisman'?'#da5958':m.mid;
  c.fill(art.body);c.strokeStyle=m.dark;c.lineWidth=1.6;c.stroke(art.body);
  c.strokeStyle=m.light;c.lineWidth=1.8;c.stroke(art.detail);
}

/** One material accent per swing or volley. Keep it at the tool, even on a miss. */
export function drawWeaponRelease(c:CanvasRenderingContext2D,kind:WeaponKind,x:number,y:number,angle:number,t:number,reduced:boolean):void {
  if(t<0||t>=1)return;
  c.save();c.translate(x,y);c.rotate(angle);
  c.globalAlpha*=Math.min(1,(1-t)*3);
  const stretch=reduced?1:.84+.38*Math.sin(t*Math.PI);
  c.scale(stretch,reduced?1:1.1-.27*t);
  if(kind==='tongs'){
    c.globalAlpha*=.62;
    c.scale(.72,.76);
  }
  if(kind==='chopsticks')drawChopstickRelease(c,t,reduced);
  materialStroke(c,kind);c.restore();
}

export interface WeaponContact extends Vec {
  kind:WeaponKind; angle:number; seed:number; age:number; duration:number; featured:boolean;
}

/** Draw the strike in local coordinates, with +x along the impulse that actually hit. */
export function drawWeaponContact(c:CanvasRenderingContext2D,hit:WeaponContact,settings:Settings,strikes?:HTMLImageElement):void {
  const {kind,age,duration,seed}=hit,m=materials[kind];
  if(kind==='tongs'&&age>=TONG_PRESS_TIME+.103)return;
  const t=Math.min(1,age/duration),travel=settings.reduceMotion?.18:1-(1-t)**2;
  const size=(hit.featured?1:.66)*(kind==='sword'||kind==='lunchbox'?1.13:1);
  c.save();c.translate(hit.x,hit.y);c.rotate(hit.angle);c.scale(size,size);
  c.globalAlpha=Math.min(1,(1-t)*1.65);
  if(kind==='chopsticks'){
    drawChopstickImpact(c,t,hit.featured&&settings.quality==='standard',settings.reduceMotion);
    c.restore();return;
  }
  if(kind==='tongs'){
    // Front lip and escaping steam sit on the entry side of the clay silhouette.
    // Its centre stays visible throughout the squash and rebound.
    const release=settings.reduceMotion?.24:Math.min(1,Math.max(0,(age-TONG_PRESS_TIME)/.125));
    c.globalAlpha*=Math.max(0,1-Math.max(0,age-TONG_PRESS_TIME)/.103);
    const radius=13+release*10;
    c.lineCap='round';
    c.beginPath();c.arc(-9,0,radius,Math.PI*.71,Math.PI*1.29);
    c.strokeStyle='#a95632';c.lineWidth=5.5*(1-.5*t);c.stroke();
    c.strokeStyle='#fff0ad';c.lineWidth=2.5*(1-.5*t);c.stroke();
    for(const side of [-1,1]){
      c.save();c.scale(1,side);c.beginPath();
      c.moveTo(-14-release*6,9+release*8);
      c.quadraticCurveTo(-20-release*11,13+release*12,-21-release*15,5+release*15);
      c.strokeStyle=side===1?'#ffcc80':'#ffefd4';c.lineWidth=3*(1-.6*t);c.stroke();c.restore();
    }
    c.restore();return;
  }
  // Lit bevel and a dark underside keep these silhouettes legible on market stalls.
  const shard=(x:number,y:number,angle:number,length:number,width:number,fill:string,highlight:boolean)=>{
    c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(-length*.30,0);
    c.lineTo(0,-width);c.lineTo(length,0);c.lineTo(length*.16,width*.72);c.closePath();
    c.fillStyle=fill;c.fill();c.strokeStyle=m.dark;c.lineWidth=1.25;c.stroke();
    if(highlight){c.beginPath();c.moveTo(-length*.19,0);c.lineTo(0,-width*.85);c.lineTo(length*.85,0);c.fillStyle=m.light;c.fill();}
    c.restore();
  };
  const n=settings.quality==='simple'||!hit.featured?3:5;
  for(let i=0;i<n;i++){
    const jitter=Math.sin(seed*.73+i*7.85);
    const angle=(i-(n-1)/2)*(.33+(5-n)*.12)+jitter*.13;
    const distance=8+travel*(20+(i%2)*13+5*jitter);
    const px=Math.cos(angle)*distance,py=Math.sin(angle)*distance;
    if(kind==='spirit'||kind==='bag'){
      c.save();c.translate(px,py);c.rotate(angle);c.fillStyle=kind==='spirit'?m.mid:'#f4dfb7';c.strokeStyle=m.dark;c.lineWidth=1.4;
      c.beginPath();c.ellipse(0,0,(9+i%3)*(1-t*.5),3.5+i%3,0,0,TAU);c.fill();c.stroke();
      c.fillStyle=m.light;c.beginPath();c.ellipse(1,-2,3.6,1.3,0,0,TAU);c.fill();c.restore();
    }else if(kind==='talisman'||kind==='lunchbox'){
      c.save();c.translate(px,py);c.rotate(angle+jitter*.75);const w=4+i%3;
      c.fillStyle=i%2?m.mid:m.light;c.strokeStyle=m.dark;c.lineWidth=1.6;c.fillRect(-w,-3,w*2,6);c.strokeRect(-w,-3,w*2,6);c.restore();
    }else shard(px,py,angle,(12+i%3*4)*(1-.55*t),2.7+i%2,m.mid,i%2===0);
  }
  c.globalAlpha*=Math.max(0,1-t*1.12);
  if(strikes?.naturalWidth && hit.featured && !settings.reduceMotion){
    const index=kind==='sword'||kind==='lunchbox'?2 :kind==='knife'||kind==='tray'?1
      :kind==='bag'||kind==='spirit'||kind==='umbrella'||kind==='talisman'?3:0;
    const w=strikes.naturalWidth/2,h=strikes.naturalHeight/2;
    const width=(kind==='sword'||kind==='lunchbox'?92:78)*(.87+.24*Math.sin(Math.min(1,t*1.8)*Math.PI/2));
    const anchorX=strikeAnchorX[index],anchorY=index===2?.53:.50;
    c.drawImage(strikes,index%2*w,Math.floor(index/2)*h,w,h,-width*anchorX,-width*anchorY,width,width);
  }
  if(hit.featured){c.translate(-7,0);c.scale(1.24,1.24);}
  materialStroke(c,kind);
  c.restore();
}

/** Flight silhouettes keep their material and direction at phone scale. */
export function drawFlightWake(c:CanvasRenderingContext2D,kind:WeaponKind,x:number,y:number,angle:number,length:number,returning:boolean):void {
  if(length<=1)return;
  const m=materials[kind];
  c.save();c.translate(x,y);c.rotate(angle);
  c.lineCap='round';c.lineJoin='round';c.strokeStyle=m.light;c.fillStyle=m.mid;
  // Horizontal coordinates follow the distance already flown, so a new shot
  // cannot leave a long trail through the hand or behind the rider.
  c.scale(length/65,1);
  switch(kind){
    case 'bag':
      // Two successive open pressure fronts read across the whole nine-shot fan.
      c.beginPath();c.moveTo(-17,-14);c.quadraticCurveTo(0,-10,3,0);
      c.quadraticCurveTo(-2,12,-18,15);c.quadraticCurveTo(-5,4,-1,0);
      c.quadraticCurveTo(-5,-7,-17,-10);c.closePath();c.fill();c.strokeStyle=m.dark;c.lineWidth=1.4;c.stroke();
      c.beginPath();c.moveTo(-46,-8);c.quadraticCurveTo(-24,-4,-29,4);c.quadraticCurveTo(-34,10,-45,9);c.strokeStyle=m.light;c.lineWidth=2;c.stroke();
      break;
    case 'tray':
      // Reflected rim light changes to mint on the homing leg.
      c.strokeStyle=returning?'#89efd0':m.mid;c.lineWidth=3.1;
      c.beginPath();c.moveTo(-64,9);c.bezierCurveTo(-41,17,-12,12,1,4);c.stroke();
      c.beginPath();c.moveTo(-39,6);c.quadraticCurveTo(-18,14,2,6);c.strokeStyle=m.light;c.lineWidth=1.8;c.stroke();
      break;
    case 'spirit':
      c.beginPath();c.moveTo(-59,5);c.bezierCurveTo(-43,-10,-35,14,-22,4);
      c.quadraticCurveTo(-12,-5,1,-2);c.quadraticCurveTo(-10,0,-16,7);
      c.bezierCurveTo(-31,20,-42,-1,-59,5);c.fill();
      c.beginPath();c.ellipse(-58,-3,4,3,0,0,TAU);c.moveTo(-42,-7);c.ellipse(-44,-7,2,2,0,0,TAU);c.fillStyle=m.light;c.fill();
      break;
    case 'lunchbox':
      // Steam puffs follow the tangent of the thrown box as its arc tips over.
      c.fillStyle='#fff0c4ba';c.beginPath();c.ellipse(-17,0,12,6,-.25,0,TAU);
      c.moveTo(-30,-5);c.ellipse(-37,-5,7,4,.26,0,TAU);c.moveTo(-51,2);c.ellipse(-55,2,4,3,0,0,TAU);c.fill();
      break;
    case 'talisman':
      // Perforations stay parallel to the long edge of the receipt.
      c.fillStyle='#ffe1b4';c.beginPath();c.moveTo(-56,-5);c.lineTo(-25,-8);c.lineTo(-4,-4);
      c.lineTo(-5,1);c.lineTo(-26,-4);c.closePath();c.fill();
      c.strokeStyle='#d7766a';c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.moveTo(-59,7);c.lineTo(-30,3);c.lineTo(-8,7);c.stroke();
      break;
  }
  c.restore();
}

/** A pleated pressure front pushes open like the gusset of the paper bag. */
export function drawPaperPuff(c:CanvasRenderingContext2D,x:number,y:number,angle:number,distance:number):void {
  c.save();c.translate(x,y);c.rotate(angle);
  const size=.40+.60*Math.min(1,distance/85);
  c.scale(size,size);c.lineJoin='round';
  c.beginPath();c.moveTo(-18,-4);c.lineTo(-9,-13);c.lineTo(-1,-11);c.lineTo(6,-15);
  c.quadraticCurveTo(14,-8,16,0);c.lineTo(7,13);c.lineTo(0,10);c.lineTo(-8,14);
  c.lineTo(-16,6);c.closePath();
  c.fillStyle='#efd39bbd';c.fill();c.strokeStyle='#926449';c.lineWidth=1.6;c.stroke();
  c.beginPath();c.moveTo(-16,-4);c.lineTo(-7,-7);c.lineTo(-4,-11);c.lineTo(1,-5);
  c.lineTo(7,-12);c.lineTo(12,-4);c.strokeStyle='#fff5cf';c.lineWidth=2;c.stroke();
  c.beginPath();c.moveTo(-10,11);c.lineTo(-7,4);c.lineTo(0,7);c.lineTo(4,3);c.lineTo(8,5);
  c.strokeStyle='#c58955';c.lineWidth=1.6;c.stroke();c.restore();
}

export function drawChainLink(c:CanvasRenderingContext2D,from:Vec,to:Vec,progress:number):void {
  const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
  if(!len)return;
  c.save();c.translate(from.x,from.y-25);c.rotate(Math.atan2(dy,dx));
  c.beginPath();c.moveTo(0,0);c.lineTo(len*.36,-3);c.lineTo(len*.29,4);c.lineTo(len*.72,-2);c.lineTo(len*.67,3);c.lineTo(len,0);
  c.lineJoin='round';c.strokeStyle=ink;c.lineWidth=5*(1-progress)+1;c.stroke();c.strokeStyle='#ffe298';c.lineWidth=3*(1-progress)+.6;c.stroke();
  c.restore();
}
