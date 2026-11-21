import {Color,Graphics,Node,UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GameEvent,Settings,Vec} from '../domain/shared/types';
import {skillPulse,type PulseUse,type SkillPulse} from './skill-pulse-model';

const X=(x:number)=>x-WORLD.width/2,Y=(y:number)=>WORLD.height/2-y,tau=Math.PI*2;
const tint=(hex:string,alpha:number)=>{const c=new Color().fromHEX(hex);c.a=Math.round(255*Math.max(0,Math.min(1,alpha)));return c;};

/** Ground-layer event cues; simulation remains authoritative. */
export class SkillPulseView {
  readonly node:Node;
  private readonly graphics:Graphics;
  private readonly uses:PulseUse[]=[];
  constructor(parent:Node){
    this.node=new Node('Skill activation pulses');this.node.layer=parent.layer;this.node.addComponent(UITransform);
    this.graphics=this.node.addComponent(Graphics);parent.addChild(this.node);
  }
  events(events:readonly GameEvent[]):void {
    for(const e of events)if(e.type==='skill'&&(e.kind==='soda'||e.kind==='bell'||e.kind==='dispatch'))this.uses.push(e);
    if(this.uses.length>16)this.uses.splice(0,this.uses.length-16);
  }
  update(time:number,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    this.graphics.clear();
    for(let i=this.uses.length-1;i>=0;i--){
      // Render interpolation can precede an event's simulation timestamp by
      // one fixed step; keep it queued until the rendered clock catches up.
      const use=this.uses[i];if(time-use.time>=1.35){this.uses.splice(i,1);continue;}
      const pulse=skillPulse(use,time,settings.reduceMotion,settings.quality==='simple');
      if(pulse){if(pulse.kind==='dispatch')this.broadcast(pulse);else this.ripple(pulse,settings.reduceMotion);}
    }
  }
  reset():void {this.uses.length=0;this.graphics.clear();}
  destroy():void {this.uses.length=0;this.node.destroy();}
  private arc(cx:number,cy:number,r:number,start:number,end:number):void {
    const g=this.graphics,steps=Math.max(3,Math.ceil(Math.abs(end-start)*12));
    for(let i=0;i<=steps;i++){
      const a=start+(end-start)*i/steps,x=X(cx+Math.cos(a)*r),y=Y(cy+Math.sin(a)*r);
      if(i)g.lineTo(x,y);else g.moveTo(x,y);
    }
  }
  private ripple(p:SkillPulse,quiet:boolean):void {
    const g=this.graphics,soda=p.kind==='soda',sector=tau/p.count;
    for(let i=0;i<p.count;i++){
      const a=i*sector+.18,end=a+sector*(soda?.53:.77);
      this.arc(p.x,p.y,p.radius,a,end);g.strokeColor=tint(soda?'#215f72':'#8a512b',p.alpha);g.lineWidth=soda?6:5.5;g.stroke();
      this.arc(p.x,p.y,p.radius,a,end);g.strokeColor=tint(soda?'#b1f7f1':'#ffdf89',p.alpha);g.lineWidth=3;g.stroke();
      if(soda)this.drop(p,end+.05);
      else {
        const inner=Math.max(3,p.radius-(quiet?14:6+8*p.travel));
        this.arc(p.x,p.y,inner,a+.13,end-.13);g.strokeColor=tint('#fff0ca',p.alpha);g.lineWidth=2.7;g.stroke();
      }
    }
  }
  private drop(p:SkillPulse,angle:number):void {
    const g=this.graphics,c=Math.cos(angle),s=Math.sin(angle);
    const ellipse=(cx:number,cy:number,rx:number,ry:number,rotation:number,fill:string,outline?:string)=>{
      const cr=Math.cos(rotation),sr=Math.sin(rotation);
      for(let i=0;i<=20;i++){
        const a=i*tau/20,u=cx+Math.cos(a)*rx*cr-Math.sin(a)*ry*sr,v=cy+Math.cos(a)*rx*sr+Math.sin(a)*ry*cr;
        const x=p.x+(p.radius+u)*c-v*s,y=p.y+(p.radius+u)*s+v*c;
        if(i)g.lineTo(X(x),Y(y));else g.moveTo(X(x),Y(y));
      }
      g.close();g.fillColor=tint(fill,p.alpha);g.fill();
      if(outline){g.strokeColor=tint(outline,p.alpha);g.lineWidth=1.6;g.stroke();}
    };
    ellipse(-2,7,4,7,-.45,'#78d6db','#2f7684');ellipse(-3,5,1.5,2.8,-.45,'#eeffef');
  }
  private broadcast(p:SkillPulse):void {
    const g=this.graphics;
    this.arc(p.x,p.y,p.radius,0,tau);g.strokeColor=tint('#304f5c',p.alpha*.62);g.lineWidth=7;g.stroke();
    this.arc(p.x,p.y,p.radius,0,tau);g.strokeColor=tint('#a9ecdc',p.alpha);g.lineWidth=2.5;g.stroke();
    const inner=Math.max(5,p.radius-8),dash=6,gap=10,segments=Math.max(1,Math.ceil(tau*inner/(dash+gap)));
    for(let i=0;i<segments;i++)this.arc(p.x,p.y,inner,i*tau/segments,Math.min((i+dash/(dash+gap))*tau/segments,tau));
    g.strokeColor=tint('#f6d693',p.alpha);g.lineWidth=2;g.stroke();
    const points:Vec[]=[{x:-10,y:-6},{x:0,y:-6},{x:7,y:0},{x:0,y:6},{x:-10,y:6},{x:-4,y:0}];
    for(let i=0;i<p.count;i++){
      const a=i*tau/p.count,c=Math.cos(a),s=Math.sin(a);
      points.forEach((v,j)=>{const u=p.radius+v.x,x=X(p.x+u*c-v.y*s),y=Y(p.y+u*s+v.y*c);if(j)g.lineTo(x,y);else g.moveTo(x,y);});
      g.close();g.fillColor=tint('#4c8380',p.alpha);g.strokeColor=tint('#f9edc0',p.alpha);g.lineWidth=1.5;g.fill();g.stroke();
    }
  }
}
