import {WORLD} from '../core/config';
import {guardShapeAt} from '../core/guard-attacks';
import {clamp} from '../core/geometry';
import {isGuard, type Enemy, type GuardKind, type GuardShape, type Settings} from '../shared/types';
import {guardColors} from './elite-aura';

const turn=Math.PI*2;

function perimeter(shape:GuardShape):Path2D {
  const path=new Path2D();
  if(shape.kind==='lane'){
    const {from,to,radius}=shape, angle=Math.atan2(to.y-from.y,to.x-from.x);
    path.arc(from.x,from.y,radius,angle+Math.PI/2,angle+Math.PI*1.5);
    path.arc(to.x,to.y,radius,angle-Math.PI/2,angle+Math.PI/2);
    path.closePath();
  }else if(shape.kind==='fan'){
    const {center,angle,halfAngle,radius}=shape;
    path.moveTo(center.x,center.y);
    path.arc(center.x,center.y,radius,angle-halfAngle,angle+halfAngle);
    path.closePath();
  }else{
    path.arc(shape.center.x,shape.center.y,shape.radius,0,turn);
    if(shape.kind==='ring' && shape.inner>0){
      path.moveTo(shape.center.x+shape.inner,shape.center.y);
      path.arc(shape.center.x,shape.center.y,shape.inner,0,turn,true);
    }
  }
  return path;
}

/** Put the accent inside the damaging band, never in a ring's safe middle. */
function ingredient(c:CanvasRenderingContext2D,kind:GuardKind,x:number,y:number,angle:number,ink:string) {
  c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=2.1;c.beginPath();
  if(kind==='epicPearl'||kind==='eliteTanghulu'){
    c.arc(0,0,5,0,turn);c.fill();
    c.beginPath();c.arc(-1.5,-1.5,1.7,0,turn);c.fillStyle='#fff4d9';c.fill();
  }else if(kind==='epicSteamer'||kind==='epicHotpot'){
    c.moveTo(-5,5);c.bezierCurveTo(3,0,-6,-2,0,-7);
    c.moveTo(2,5);c.bezierCurveTo(9,0,1,-2,7,-7);c.stroke();
  }else if(kind==='eliteLotus'){
    c.moveTo(-7,0);c.quadraticCurveTo(0,-10,7,0);c.quadraticCurveTo(0,9,-7,0);c.stroke();
  }else{
    c.moveTo(-5,-4);c.lineTo(4,0);c.lineTo(-5,4);c.stroke();
  }
  c.restore();
}

function direction(c:CanvasRenderingContext2D,shape:GuardShape,kind:GuardKind,ink:string,progress:number) {
  if(shape.kind==='lane'){
    const {from,to}=shape,angle=Math.atan2(to.y-from.y,to.x-from.x);
    const count=Math.max(1,Math.min(6,Math.floor(Math.hypot(to.x-from.x,to.y-from.y)/85)));
    for(let i=0;i<count;i++){
      const t=(i+.32+.32*progress)/count;
      ingredient(c,kind,from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,angle,ink);
    }
  }else{
    const count=shape.kind==='fan'?3:shape.radius<45?3:6;
    const lo=shape.kind==='fan'?shape.angle-shape.halfAngle:0;
    const span=shape.kind==='fan'?2*shape.halfAngle:turn;
    const inner=shape.kind==='ring'?shape.inner:0, radius=inner+(shape.radius-inner)*(.52+.25*progress);
    for(let i=0;i<count;i++){
      const angle=lo+span*(i+.5)/count;
      ingredient(c,kind,shape.center.x+Math.cos(angle)*radius,shape.center.y+Math.sin(angle)*radius,angle,ink);
    }
  }
}

function release(c:CanvasRenderingContext2D,shape:GuardShape,kind:GuardKind,progress:number) {
  const {tip}=guardColors[kind];
  c.lineCap='round';
  if(shape.kind==='lane'){
    const dx=shape.to.x-shape.from.x,dy=shape.to.y-shape.from.y;
    const length=Math.hypot(dx,dy),r=shape.radius;
    c.translate(shape.from.x,shape.from.y);c.rotate(Math.atan2(dy,dx));
    const slashes=kind==='epicOpera'||kind==='eliteSkewer';
    c.fillStyle=tip;c.strokeStyle=tip;c.lineWidth=3;
    if(slashes){
      // The two cut edges of a noodle ribbon peel apart inside the locked corridor.
      c.beginPath();c.moveTo(0,r*.24);c.quadraticCurveTo(length*.42,-r*(.1+.8*progress),length,-r*.32);
      c.quadraticCurveTo(length*.60,r*(.08+.66*progress),0,r*.24);c.fill();
    }else{
      const count=Math.min(13,Math.max(2,Math.ceil(length/44)));
      for(let i=0;i<count;i++){
        const x=(i+.5)*length/count,shift=r*.34*Math.sin(i+progress*4);
        c.beginPath();c.moveTo(x-6,shift+r*.36);c.quadraticCurveTo(x,shift-2,x+4,shift-r*.43);c.stroke();
      }
    }
  }else if(shape.kind==='fan'){
    c.strokeStyle=tip;c.lineWidth=4;
    const {center,angle,halfAngle,radius}=shape;
    for(let i=0;i<4;i++){
      const r=radius*(.32+.17*i+.10*progress);
      c.beginPath();c.arc(center.x,center.y,r,angle-halfAngle*.94,angle+halfAngle*.92);c.stroke();
    }
  }else if(shape.kind==='ring'){
    const radius=shape.inner+(shape.radius-shape.inner)*(.14+.72*progress);
    c.beginPath();c.arc(shape.center.x,shape.center.y,radius,0,turn);c.strokeStyle=tip;c.lineWidth=5;c.stroke();
  }else{
    c.translate(shape.center.x,shape.center.y);
    if(kind==='epicPearl'||kind==='eliteTanghulu'){
      const r=Math.min(shape.radius*.30,22);
      const bead=c.createRadialGradient(-r*.35,-r*.42,0,0,0,r);
      bead.addColorStop(0,'#fff3d4');bead.addColorStop(.18,tip);bead.addColorStop(.46,kind==='epicPearl'?'#76537f':'#c23828');
      bead.addColorStop(1,kind==='epicPearl'?'#3b2746':'#7c2428');
      c.fillStyle=bead;c.beginPath();c.arc(0,0,r,0,turn);c.fill();
    }else if(kind==='epicHotpot'){
      c.fillStyle='#ffdfa6';c.strokeStyle='#ffecc0';c.lineWidth=2;
      for(let i=0;i<6;i++){
        const a=i*2.40,dist=shape.radius*(.12+.12*i);
        c.beginPath();c.ellipse(Math.cos(a)*dist,Math.sin(a)*dist,4+progress*9,2+progress*5,0,0,turn);
        if(i%3)c.stroke();else c.fill();
      }
    }
  }
}

export function drawGuardTelegraph(c:CanvasRenderingContext2D,e:Enemy,time:number,settings:Settings) {
  const cast=e.guardCast;
  if(!cast||!isGuard(e.kind))return;
  const palette=guardColors[e.kind], b=WORLD.bounds;
  c.save();c.beginPath();c.rect(b.left,b.top,b.right-b.left,b.bottom-b.top);c.clip();c.lineJoin='round';c.lineCap='round';
  for(const mark of cast.marks){
    if(time<mark.warnAt||time>=mark.endAt)continue;
    const live=time>=mark.hitAt, summon=!!mark.summon;
    const shape=guardShapeAt(mark,time), path=perimeter(shape);
    const progress=clamp((time-mark.warnAt)/Math.max(.001,mark.hitAt-mark.warnAt),0,1);
    const stock=e.kind==='epicHotpot'&&shape.kind==='disc'&&mark!==cast.marks[0]?'#deb586':palette.body;
    c.fillStyle=(summon?'#4fa78b':stock)+(live?'9c':'36');
    c.fill(path,'evenodd');
    c.strokeStyle=live?palette.body:'#562b36';c.lineWidth=live?6:4.5;c.stroke(path);
    c.strokeStyle=summon?'#adead2':live?'#fff3c5':'#ffcd9b';c.lineWidth=live?2.5:2;
    if(!live)c.setLineDash([9,6]);
    c.stroke(path);c.setLineDash([]);
    if(summon && shape.kind==='disc'){
      // A little bamboo basket distinguishes an arriving ally from a damaging drop.
      const {x,y}=shape.center;c.strokeStyle='#ddffdf';c.lineWidth=2.8;c.beginPath();
      c.ellipse(x,y-4,10,4,0,0,turn);c.moveTo(x-10,y-4);c.lineTo(x-8,y+6);
      c.quadraticCurveTo(x,y+11,x+8,y+6);c.lineTo(x+10,y-4);c.stroke();
    }else if(live){
      const phase=clamp((time-mark.hitAt)/Math.max(.001,mark.endAt-mark.hitAt),0,1);
      c.save();c.clip(path,'evenodd');c.globalAlpha*=.8;release(c,shape,e.kind,settings.reduceMotion?.6:phase);c.restore();
    }else if(settings.quality!=='simple'){
      direction(c,shape,e.kind,live?palette.tip:'#ffe6c2',settings.reduceMotion?.7:progress);
    }
  }
  c.restore();
}
