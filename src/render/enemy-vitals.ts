import {clamp} from '../core/geometry';
import type {EnemyVitals} from '../../cocos/assets/scripts/presentation/damage-model';
export {enemyHeight, layoutEnemyVitals} from '../../cocos/assets/scripts/presentation/damage-model';
export type {EnemyVitals, FallenEnemy, VitalsRect} from '../../cocos/assets/scripts/presentation/damage-model';

export function drawEnemyVitals(c:CanvasRenderingContext2D,panels:readonly EnemyVitals[]):void {
  if(!panels.length)return;
  c.save();c.textAlign='right';c.textBaseline='middle';c.lineJoin='round';
  for(const {x,y,w,h,hp,maxHp,alpha} of panels){
    const numbered=h>10,pad=numbered?2.8:1.6,innerW=w-pad*2,innerH=h-pad*2;
    function pill(left:number,top:number,width:number,height:number,radius:number,color:string){
      c.fillStyle=color;c.beginPath();c.roundRect(left,top,width,height,radius);c.fill();
    }
    c.globalAlpha=alpha;
    pill(x,y+1.8,w,h,h/2,'#553327');
    pill(x,y,w,h,h/2,'#edc594');
    pill(x+.65,y+.45,w-1.3,h-2.6,(h-2.6)/2,'#ffe7be');
    pill(x+pad,y+pad,innerW,innerH,innerH/2,'#4a2e25');
    if(hp>0){
      const fill=innerW*clamp(hp/maxHp,0,1);
      c.save();c.clip();
      pill(x+pad,y+pad,fill,innerH,Math.min(fill/2,3.6),'#d65035');
      pill(x+pad,y+pad,fill,innerH-1.8,Math.min(fill/2,3.6),'#ff8254');
      c.restore();
    }
    if(numbered){
      const value=Math.ceil(hp)+'/'+maxHp;
      const tx=x+w-8,ty=y+h*.51;
      c.font='900 '+(h>22?16:14)+'px system-ui,sans-serif';
      c.strokeStyle='#543327';c.lineWidth=2.4;c.strokeText(value,tx,ty);
      c.fillStyle='#fff0cf';c.fillText(value,tx,ty);
    }
  }
  c.restore();
}
