import {Color,Graphics} from 'cc';
import {WORLD} from '../domain/core/config';
import type {RangedAttackDetail} from './enemy-ranged-detail-model';

const color=(hex:string,alpha=255)=>{const value=new Color().fromHEX(hex);value.a=alpha;return value;};

/** Adds painted-actor detail to a caller-owned Graphics layer. Y is converted
 * from simulation coordinates to the Creator world; no canvas API is used. */
export function drawEnemyRangedDetail(g:Graphics,detail:RangedAttackDetail):void {
  const previousCap=g.lineCap;g.lineCap=Graphics.LineCap.ROUND;
  const point=(x:number,y:number)=>({x:x-WORLD.width/2,y:WORLD.height/2-y});
  const anchor=point(detail.x,detail.y);
  const local=(x:number,y:number)=>({x:anchor.x+x*detail.facing,y:anchor.y-y});
  const move=(x:number,y:number)=>{const p=local(x,y);g.moveTo(p.x,p.y);};
  const cubic=(x1:number,y1:number,x2:number,y2:number,x3:number,y3:number)=>{
    const a=local(x1,y1),b=local(x2,y2),c=local(x3,y3);g.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);
  };
  const quad=(x1:number,y1:number,x2:number,y2:number)=>{
    const a=local(x1,y1),b=local(x2,y2);g.quadraticCurveTo(a.x,a.y,b.x,b.y);
  };
  if(detail.kind==='bowl'){
    const curve=()=>{move(-10,3);cubic(-4,3,1,-detail.rise,9,-detail.rise+2);quad(16,-detail.rise+4,18,-detail.rise+1);};
    curve();g.strokeColor=color('#aa5c33');g.lineWidth=5.2;g.stroke();
    curve();g.strokeColor=color('#ffd387');g.lineWidth=2.2;g.stroke();
    const drop=local(21,-detail.rise-3);g.fillColor=color('#ed9a3c');g.ellipse(drop.x,drop.y,3.5,2.1);g.fill();g.lineCap=previousCap;return;
  }
  if(detail.kind==='kettle-warning'){
    move(0,-3);cubic(7,-8,-3,-9,5,-8-detail.rise);
    g.strokeColor=color('#ffdfac',202);g.lineWidth=2.4;g.stroke();
    const drop=local(2,1);g.fillColor=color('#f1b45e');g.ellipse(drop.x,drop.y,3+detail.progress*4,2+detail.progress*2);g.fill();g.lineCap=previousCap;return;
  }
  const target=point(detail.targetX,detail.targetY),control=local(25,-9),opacity=Math.round(255*detail.alpha);
  const stream=()=>{g.moveTo(anchor.x,anchor.y);g.quadraticCurveTo(control.x,control.y,target.x,target.y);};
  stream();g.strokeColor=color('#a76c34',opacity);g.lineWidth=7;g.stroke();
  stream();g.strokeColor=color('#ffe0a0',opacity);g.lineWidth=2.4;g.stroke();g.lineCap=previousCap;
}
