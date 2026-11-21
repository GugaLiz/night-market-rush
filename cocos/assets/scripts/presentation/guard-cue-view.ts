import {Color,Graphics} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GuardCue} from './guard-cue-model';

const color=(hex:string)=>new Color().fromHEX(hex);
type Point={x:number;y:number};

/** Paint accents only. The caller clears and owns the existing ground layer. */
export function drawGuardCues(g:Graphics,cues:readonly GuardCue[]):void {
  if(cues.length===0)return;
  const cap=g.lineCap,join=g.lineJoin;g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
  for(const cue of cues){
    // The old renderer clips its accents to the street. Keep an entire glyph
    // inside the playable floor until the shared ground layer has a clip mask.
    const b=WORLD.bounds,pad=12;
    if(cue.x<b.left+pad||cue.x>b.right-pad||cue.y<b.top+pad||cue.y>b.bottom-pad)continue;
    const angle=cue.kind==='ingredient'?cue.angle:0,cos=Math.cos(angle),sin=Math.sin(angle);
    const point=(dx:number,dy:number):Point=>({x:cue.x+dx*cos-dy*sin-WORLD.width/2,y:WORLD.height/2-(cue.y+dx*sin+dy*cos)});
    const move=(x:number,y:number)=>{const p=point(x,y);g.moveTo(p.x,p.y);};
    const line=(x:number,y:number)=>{const p=point(x,y);g.lineTo(p.x,p.y);};
    const quad=(x1:number,y1:number,x2:number,y2:number)=>{const a=point(x1,y1),b=point(x2,y2);g.quadraticCurveTo(a.x,a.y,b.x,b.y);};
    const cubic=(x1:number,y1:number,x2:number,y2:number,x3:number,y3:number)=>{const a=point(x1,y1),b=point(x2,y2),c=point(x3,y3);g.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);};
    if(cue.kind==='basket'){
      const center=point(0,-4);g.strokeColor=color('#ddffdf');g.lineWidth=2.8;
      g.ellipse(center.x,center.y,10,4);g.stroke();
      move(-10,-4);line(-8,6);quad(0,11,8,6);line(10,-4);g.stroke();continue;
    }
    g.strokeColor=color('#ffe6c2');g.fillColor=color('#ffe6c2');g.lineWidth=2.1;
    if(cue.ingredient==='bead'){
      const c=point(0,0),highlight=point(-1.5,-1.5);g.circle(c.x,c.y,5);g.fill();
      g.fillColor=color('#fff4d9');g.circle(highlight.x,highlight.y,1.7);g.fill();
    }else if(cue.ingredient==='steam'){
      move(-5,5);cubic(3,0,-6,-2,0,-7);move(2,5);cubic(9,0,1,-2,7,-7);g.stroke();
    }else if(cue.ingredient==='lotus'){
      move(-7,0);quad(0,-10,7,0);quad(0,9,-7,0);g.stroke();
    }else{
      move(-5,-4);line(4,0);line(-5,4);g.stroke();
    }
  }
  g.lineCap=cap;g.lineJoin=join;
}
