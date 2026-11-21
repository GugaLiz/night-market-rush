import {Color,Graphics} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GiantJump} from '../domain/shared/types';
import {giantJumpGuide,type GuideSegment} from './giant-jump-guide-model';

/** Draw behind the locked warning without changing its danger geometry. */
export function drawGiantJumpGuide(g:Graphics,x:number,y:number,jump:GiantJump):void {
  const guide=giantJumpGuide(x,y,jump);if(!guide)return;
  const lines=(segments:readonly GuideSegment[],color:Color,width:number)=>{
    g.strokeColor=color;g.lineWidth=width;
    for(const {from,to} of segments){
      g.moveTo(from.x-WORLD.width/2,WORLD.height/2-from.y);
      g.lineTo(to.x-WORLD.width/2,WORLD.height/2-to.y);
    }
    if(segments.length)g.stroke();
  };
  lines(guide.trajectory,new Color(253,186,138,149),2.5);
  lines(guide.edges,new Color(255,227,174,206),2);
  lines(guide.arrows,new Color(255,240,204,255),3);
}
