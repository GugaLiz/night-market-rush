import type {Settings, Vec, WeaponKind} from '../shared/types';

const TAU = Math.PI * 2;
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

export interface WeaponContact extends Vec {
  kind:WeaponKind; angle:number; seed:number; age:number; duration:number; featured:boolean;
}

/** Draw the strike in local coordinates, with +x along the impulse that actually hit. */
export function drawWeaponContact(c:CanvasRenderingContext2D,hit:WeaponContact,settings:Settings,strikes?:HTMLImageElement):void {
  const {kind,age,duration,seed}=hit,m=materials[kind];
  const t=Math.min(1,age/duration),travel=settings.reduceMotion?.18:1-(1-t)**2;
  const size=(hit.featured?1:.66)*(kind==='sword'||kind==='lunchbox'?1.13:1);
  c.save();c.translate(hit.x,hit.y);c.rotate(hit.angle);c.scale(size,size);
  c.globalAlpha=Math.min(1,(1-t)*1.65);
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
  if(strikes?.naturalWidth && hit.featured){
    const index=kind==='sword'||kind==='lunchbox'?2 :kind==='knife'||kind==='tray'?1
      :kind==='bag'||kind==='spirit'||kind==='umbrella'||kind==='talisman'?3:0;
    const w=strikes.naturalWidth/2,h=strikes.naturalHeight/2;
    const width=(kind==='sword'||kind==='lunchbox'?121:104)*(settings.reduceMotion?1:.87+.24*Math.sin(Math.min(1,t*1.8)*Math.PI/2));
    const anchorX=strikeAnchorX[index],anchorY=index===2?.53:.50;
    c.drawImage(strikes,index%2*w,Math.floor(index/2)*h,w,h,-width*anchorX,-width*anchorY,width,width);
  }
  if(kind==='knife'||kind==='chopsticks'||kind==='tongs'||kind==='sword'){
    shard(0,-2,.05,33,5.5,m.dark,true);
    shard(-3,2,kind==='tongs'?.46:-.63,22,4,m.mid,true);
  }else if(kind==='tray'||kind==='umbrella'||kind==='bag'){
    c.lineCap='round';
    for(let i=0;i<2;i++){
      c.beginPath();c.ellipse(5+i*6,0,10+i*3,20+i*4,0,-1.38,1.38);
      c.strokeStyle=i?m.light:m.dark;c.lineWidth=i?2.6:5;c.stroke();
    }
  }else shard(0,0,-.28,21,8,m.mid,true);
  c.restore();
}

/** Flight silhouettes keep their material and direction at phone scale. */
export function drawFlightWake(c:CanvasRenderingContext2D,kind:WeaponKind,x:number,y:number,angle:number,length:number,returning:boolean):void {
  if(length<=1)return;
  const m=materials[kind],width=kind==='spirit'?12:kind==='bag'?9:kind==='tray'?8:5;
  c.save();c.translate(x,y);c.rotate(angle);
  const grad=c.createLinearGradient(-length,0,0,0);grad.addColorStop(0,m.mid+'00');grad.addColorStop(.7,(returning?'#73e9d9':m.mid)+'bd');grad.addColorStop(1,m.light);
  c.fillStyle=grad;
  for(const side of [-1,1]){
    c.save();c.scale(1,side);c.beginPath();c.moveTo(-length,1);
    c.quadraticCurveTo(-length*.52,width*1.8,2,width*.54);
    c.quadraticCurveTo(-length*.26,width*.45,-length*.57,width*.65);
    c.lineTo(-length*.36,width*.25);c.closePath();c.fill();c.restore();
  }
  if(kind==='bag'){
    c.strokeStyle='#9c7551';c.lineWidth=2;c.fillStyle='#fff2c8';
    c.beginPath();c.moveTo(-9,-14);c.quadraticCurveTo(19,-5,7,14);c.quadraticCurveTo(8,2,-11,-6);
    c.quadraticCurveTo(1,-6,-9,-14);c.fill();c.stroke();
  }else if(kind==='tray'){
    c.strokeStyle=m.light;c.lineWidth=2.5;c.beginPath();c.ellipse(0,0,24,13,.2,-1.5,1.4);c.stroke();
  }
  c.restore();
}

export function drawChainLink(c:CanvasRenderingContext2D,from:Vec,to:Vec,progress:number):void {
  const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
  if(!len)return;
  c.save();c.translate(from.x,from.y-25);c.rotate(Math.atan2(dy,dx));
  c.beginPath();c.moveTo(0,0);c.lineTo(len*.36,-3);c.lineTo(len*.29,4);c.lineTo(len*.72,-2);c.lineTo(len*.67,3);c.lineTo(len,0);
  c.lineJoin='round';c.strokeStyle=ink;c.lineWidth=5*(1-progress)+1;c.stroke();c.strokeStyle='#ffe298';c.lineWidth=3*(1-progress)+.6;c.stroke();
  c.restore();
}
