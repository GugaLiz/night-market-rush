import {Color, Graphics, Node, UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GameState} from '../domain/shared/types';
import {giantPulseVisual, type GiantPulseVisual} from './giant-pulse-model';

const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const color=(r:number,g:number,b:number,a:number)=>new Color(r,g,b,a);

/** Collision-aligned boss landing and expanding wave. Place this layer above
 * actors and signs so its warning boundary stays visible in a crowded scene. */
export class GiantPulseView {
  readonly node:Node;
  private readonly graphics:Graphics;

  constructor(parent:Node){
    this.node=new Node('Giant pulse warnings');this.node.layer=parent.layer;
    this.node.addComponent(UITransform);this.graphics=this.node.addComponent(Graphics);parent.addChild(this.node);
  }

  update(state:GameState):void {
    const g=this.graphics;g.clear();
    for(const pulse of state.giantPulses??[]){
      const visual=giantPulseVisual(pulse,state.time);if(!visual)continue;
      if(visual.danger)this.drawDanger(visual);
      else this.drawPrint(visual);
    }
  }

  reset():void {this.graphics.clear();}
  destroy():void {this.node.destroy();}

  private arc(v:GiantPulseVisual,r:number,reverse=false):void {
    const g=this.graphics,n=Math.max(24,Math.ceil((v.end-v.start)*Math.max(1,r)/12));
    for(let i=0;i<=n;i++){
      const t=reverse?1-i/n:i/n,a=v.start+(v.end-v.start)*t;
      g.lineTo(X(v.x+Math.cos(a)*r),Y(v.y+Math.sin(a)*r));
    }
  }

  private drawDanger(v:GiantPulseVisual):void {
    const g=this.graphics;
    g.moveTo(X(v.x+Math.cos(v.start)*v.outer),Y(v.y+Math.sin(v.start)*v.outer));
    this.arc(v,v.outer);this.arc(v,v.inner,true);g.close();
    g.fillColor=color(240,159,104,92);g.fill();
    g.strokeColor=color(122,65,49,235);g.lineWidth=4;g.stroke();
    g.strokeColor=color(255,232,185,255);g.lineWidth=2;g.stroke();
  }

  private drawPrint(v:GiantPulseVisual):void {
    const g=this.graphics;g.strokeColor=color(234,205,166,Math.round(115*v.printAlpha));g.lineWidth=3;
    g.ellipse(X(v.x),Y(v.y),31,20);g.stroke();
  }
}
