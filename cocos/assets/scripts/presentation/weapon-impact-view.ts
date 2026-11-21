import {Color,Graphics,Node,UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GameEvent,GameState,Settings} from '../domain/shared/types';
import {lunchboxBlastRadius,WeaponImpactModel,type SnackImpact} from './weapon-impact-model';
import {CombatParticlesModel} from './combat-particles-model';

const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const color=(r:number,g:number,b:number,a:number)=>new Color(r,g,b,a);

/** Presentation-only event layer; place above the battle world and below UI. */
export class WeaponImpactView {
  readonly node:Node;
  private readonly graphics:Graphics;
  private readonly particleGraphics:Graphics;
  private readonly model=new WeaponImpactModel();
  private readonly particles=new CombatParticlesModel();
  constructor(parent:Node){
    this.node=new Node('Weapon event effects');this.node.layer=parent.layer;
    this.node.addComponent(UITransform);this.graphics=this.node.addComponent(Graphics);parent.addChild(this.node);
    const particles=new Node('Combat particles');particles.layer=this.node.layer;particles.addComponent(UITransform);
    this.particleGraphics=particles.addComponent(Graphics);this.node.addChild(particles);
  }
  events(events:readonly GameEvent[],time:number):void {this.model.add(events,time);this.particles.events(events,time);}
  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    const g=this.graphics;g.clear();
    for(const impact of this.model.active(state.time)){
      const progress=(state.time-impact.bornAt)/impact.duration,alpha=Math.max(0,1-progress);
      if(impact.type==='detonation'){
        // The complete collision radius is visible immediately; decorative
        // accent expands independently and never suggests a smaller hit area.
        const x=X(impact.x),y=Y(impact.y),r=lunchboxBlastRadius();
        g.strokeColor=color(146,69,46,Math.round(230*alpha));g.lineWidth=5;g.circle(x,y,r);g.stroke();
        g.strokeColor=color(255,232,158,Math.round(255*alpha));g.lineWidth=2.5;g.circle(x,y,r);g.stroke();
        const inner=settings.reduceMotion?r*.6:r*(.2+.8*(1-(1-progress)**3));
        g.strokeColor=color(255,194,108,Math.round(190*alpha));g.lineWidth=3;g.circle(x,y,inner);g.stroke();
      }else if(impact.type==='snackImpact'){
        drawSnackImpact(g,impact,progress,settings);
      }else {
        const x1=X(impact.fromX),y1=Y(impact.fromY),x2=X(impact.x),y2=Y(impact.y);
        const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),nx=len?-dy/len:0,ny=len?dx/len:0;
        const bend=settings.reduceMotion?0:Math.sin(progress*Math.PI)*Math.min(12,len*.08);
        g.moveTo(x1,y1);g.quadraticCurveTo((x1+x2)/2+nx*bend,(y1+y2)/2+ny*bend,x2,y2);
        g.strokeColor=color(139,63,70,Math.round(235*alpha));g.lineWidth=7;g.stroke();
        g.moveTo(x1,y1);g.quadraticCurveTo((x1+x2)/2+nx*bend,(y1+y2)/2+ny*bend,x2,y2);
        g.strokeColor=color(255,224,165,Math.round(255*alpha));g.lineWidth=3;g.stroke();
      }
    }
    const particles=this.particleGraphics;particles.clear();
    for(const item of this.particles.update(state.time,settings)){
      const fill=new Color().fromHEX(item.color);fill.a=Math.round(255*item.alpha);
      particles.fillColor=fill;particles.circle(X(item.x),Y(item.y),item.radius);particles.fill();
    }
  }
  reset():void {this.model.reset();this.particles.reset();this.graphics.clear();this.particleGraphics.clear();}
  destroy():void {this.model.reset();this.particles.reset();this.node.destroy();}
}

/** Food fragments follow the same contact direction and material as the Web effect. */
function drawSnackImpact(g:Graphics,impact:SnackImpact,t:number,settings:Pick<Settings,'quality'|'reduceMotion'>):void {
  const count=settings.quality==='simple'?3:5,spread=settings.reduceMotion?.55:1-(1-t)**2;
  const heading=impact.angle+Math.PI,ch=Math.cos(heading),sh=Math.sin(heading),alpha=Math.round(255*(1-t*t));
  const ink=(hex:string)=>{const c=new Color().fromHEX(hex);c.a=alpha;return c;};
  for(let i=0;i<count;i++){
    const a=(i/(count-1)-.5)*2.6,r=8+(16+i%2*7)*spread,phi=a+.14,cp=Math.cos(phi),sp=Math.sin(phi);
    const point=(x:number,y:number)=>{
      const lx=21+Math.cos(a)*r+cp*x-sp*y,ly=Math.sin(a)*r+sp*x+cp*y;
      return {x:X(impact.x+ch*lx-sh*ly),y:Y(impact.y-22+sh*lx+ch*ly)};
    };
    const move=(x:number,y:number)=>{const p=point(x,y);g.moveTo(p.x,p.y);};
    const line=(x:number,y:number)=>{const p=point(x,y);g.lineTo(p.x,p.y);};
    const quad=(x1:number,y1:number,x:number,y:number)=>{const p=point(x1,y1),q=point(x,y);g.quadraticCurveTo(p.x,p.y,q.x,q.y);};
    const ellipse=(x:number,y:number,rx:number,ry:number,angle=0)=>{
      const ca=Math.cos(angle),sa=Math.sin(angle),k=.5522847498;
      const ep=(u:number,v:number)=>point(x+ca*u-sa*v,y+sa*u+ca*v);
      const start=ep(rx,0);g.moveTo(start.x,start.y);
      const curve=(u1:number,v1:number,u2:number,v2:number,u:number,v:number)=>{
        const p=ep(u1,v1),q=ep(u2,v2),end=ep(u,v);g.bezierCurveTo(p.x,p.y,q.x,q.y,end.x,end.y);
      };
      curve(rx,k*ry,k*rx,ry,0,ry);curve(-k*rx,ry,-rx,k*ry,-rx,0);
      curve(-rx,-k*ry,-k*rx,-ry,0,-ry);curve(k*rx,-ry,rx,-k*ry,rx,0);g.close();
    };
    if(impact.kind==='bun'){
      g.fillColor=ink('#f0d6a9');g.strokeColor=ink('#b18760');g.lineWidth=1.2;ellipse(1,0,5.6,3.3);g.fill();g.stroke();
      g.fillColor=ink('#fff0d5');ellipse(2,-1.2,3.1,1.8);g.fill();
    }else if(impact.kind==='onigiri'){
      g.fillColor=ink(i===1?'#4b5145':'#fcf2da');g.strokeColor=ink('#a78d6e');g.lineWidth=1;ellipse(1,0,4.7,2.3,-.23);g.fill();g.stroke();
    }else if(impact.kind==='siumai'){
      g.fillColor=ink('#e8a745');g.strokeColor=ink('#ffe1a0');g.lineWidth=1.2;
      move(-3,2);quad(0,-5,6,-2);line(2,3);g.close();g.fill();g.stroke();
    }else if(impact.kind==='zongzi'){
      g.fillColor=ink('#799451');g.strokeColor=ink('#e7dca0');g.lineWidth=1.5;
      move(-4,1);quad(0,-5,9,-1);quad(3,4,-4,1);g.close();g.fill();
      move(-3,1);line(6,-1);g.stroke();
    }else if(impact.kind==='box'){
      g.fillColor=ink('#ffe1a4');move(-3,-3);line(7,-3);line(7,2);line(-3,2);g.close();g.fill();
      g.strokeColor=ink('#ad5941');g.lineWidth=1.4;move(-1,-1);line(3,-1);g.stroke();
    }else{
      g.fillColor=ink('#e99a43');g.strokeColor=ink('#fff0b8');g.lineWidth=1.3;ellipse(1,0,5.6,2.5,-.14);g.fill();g.stroke();
    }
  }
}
