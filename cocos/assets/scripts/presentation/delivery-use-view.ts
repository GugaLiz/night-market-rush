import {Color,Graphics,Label,Mask,Node,Rect,Size,Sprite,SpriteFrame,UIOpacity,UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import {SKILL_NAMES,type GameEvent,type GameState,type Settings,type Vec} from '../domain/shared/types';
import {SKILL_GUIDE} from '../ui/catalog';
import {deliveryUsePose,fanRotorAngle,iceShavings,pickupShell,USE_LIFETIME,type SkillUse} from './delivery-use-model';
import {SpriteAtlas} from './sprite-atlas';
import {skillFieldVisual} from './skill-field-model';
import {SkillPulseView} from './skill-pulse-view';

interface FanRotor {node:Node;transform:UITransform;rotor:Node;opacity:UIOpacity}
interface Item {node:Node;transform:UITransform;sprite:Sprite;opacity:UIOpacity;fan:FanRotor;paper:Node;paperGraphics:Graphics;label:Label;paperOpacity:UIOpacity}
export interface DeliveryBagPose {x:number;y:number;tilt:number;width:number;height:number;flip:number;scale:number}
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** Short-lived visual handoff: pickup to bag, then bag to the free hand. */
export class DeliveryUseView {
  readonly node:Node;
  private uses:SkillUse[]=[];
  private readonly items:Item[]=[];
  private readonly lid:Graphics;
  private readonly shells:Graphics;
  private readonly ice:Graphics;
  private readonly groundFans:Node;
  private readonly groundRotors:FanRotor[]=[];
  private readonly rotorFrame:SpriteFrame;
  private readonly pulses:SkillPulseView;
  constructor(parent:Node,private readonly atlas:SpriteAtlas){
    this.node=new Node('Delivery use');this.node.layer=parent.layer;this.node.addComponent(UITransform);parent.addChild(this.node);
    const lid=new Node('Open bag lid');lid.layer=this.node.layer;lid.addComponent(UITransform);this.lid=lid.addComponent(Graphics);this.node.addChild(lid);
    const shells=new Node('Pickup shells');shells.layer=this.node.layer;shells.addComponent(UITransform);this.shells=shells.addComponent(Graphics);this.node.addChild(shells);
    const ice=new Node('Ice shavings');ice.layer=this.node.layer;ice.addComponent(UITransform);this.ice=ice.addComponent(Graphics);this.node.addChild(ice);
    const ground=parent.getChildByName('Skill fields ground');
    if(!ground)throw new Error('Fan rotor requires the skill field ground layer');
    const elementalGround=parent.getChildByName('ElementalGround');
    if(!elementalGround)throw new Error('Skill pulses require the elemental ground layer');
    this.pulses=new SkillPulseView(elementalGround);
    this.groundFans=new Node('Ground fan rotors');this.groundFans.layer=parent.layer;this.groundFans.addComponent(UITransform);ground.addChild(this.groundFans);
    const fan=atlas.require('fan');this.rotorFrame=new SpriteFrame();this.rotorFrame.texture=fan.texture;
    this.rotorFrame.rect=new Rect(fan.rect.x+47,fan.rect.y+21,120,132);this.rotorFrame.originalSize=new Size(120,132);this.rotorFrame.packable=false;
  }
  events(events:readonly GameEvent[]):void {
    this.pulses.events(events);
    for(const event of events)if(event.type==='skill')this.uses.push(event);
    if(this.uses.length>16)this.uses.splice(0,this.uses.length-16);
  }
  latestAge(time:number):number {
    const last=this.uses[this.uses.length-1];return last?Math.max(0,time-last.time):Infinity;
  }
  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>,bag:Vec,hand:Vec,bagPose:DeliveryBagPose|null,lidOpen:number):void {
    this.pulses.update(state.time,settings);
    this.drawLid(bagPose,lidOpen);
    this.updateGroundFans(state,settings.reduceMotion);
    this.shells.clear();this.ice.clear();
    this.uses=this.uses.filter(use=>state.time-use.time<USE_LIFETIME);
    this.uses.forEach((use,i)=>{
      const field=state.elementalFields?.find(f=>f.kind===use.kind&&f.bornAt===use.time);
      const size=this.atlas.size(use.kind),pose=deliveryUsePose(use,state.time,bag,hand,settings.reduceMotion,size,field);
      const item=this.items[i]??this.create();
      if(!pose){item.node.active=item.paper.active=false;return;}
      this.drawPickupShell(use,state.time,bag,settings.reduceMotion);
      item.node.active=pose.alpha>0;item.sprite.spriteFrame=this.atlas.require(use.kind);
      item.transform.setContentSize(pose.height*size.width/size.height,pose.height);
      item.node.setPosition(X(pose.x),Y(pose.y));item.node.angle=-pose.angle*180/Math.PI;
      item.opacity.opacity=Math.round(255*pose.alpha);
      item.fan.node.active=use.kind==='fan'&&!settings.reduceMotion&&pose.alpha>0;
      if(item.fan.node.active)this.updateFan(item.fan,pose.height,Math.max(0,state.time-use.time),1);
      if(field?.kind==='frost'&&pose.alpha>0)this.drawIceShavings(pose.x,pose.y+pose.height*.24,
        state.time-use.time,settings.reduceMotion,settings.quality==='simple',pose.alpha);
      const text=`${SKILL_NAMES[use.kind]} · ${SKILL_GUIDE[use.kind].role}`,width=Math.min(380,Array.from(text).length*15+15);
      item.paper.active=pose.labelAlpha>0;item.paper.setPosition(X(clamp(use.x,12+width/2,1268-width/2)),Y(Math.min(652,use.y+32)));
      item.paper.getComponent(UITransform)!.setContentSize(width,20);item.paperOpacity.opacity=Math.round(255*pose.labelAlpha);
      item.paperGraphics.clear();item.paperGraphics.fillColor=new Color(247,227,185,255);item.paperGraphics.strokeColor=new Color(97,70,56,255);
      item.paperGraphics.lineWidth=1.4;item.paperGraphics.roundRect(-width/2,-10,width,20,3);item.paperGraphics.fill();item.paperGraphics.stroke();
      item.label.string=text;item.label.node.getComponent(UITransform)!.setContentSize(width-8,20);
    });
    this.ice.node.setSiblingIndex(this.node.children.length-1);
    for(let i=this.uses.length;i<this.items.length;i++)this.items[i].node.active=this.items[i].paper.active=false;
  }
  reset():void {this.uses=[];this.pulses.reset();this.lid.clear();this.shells.clear();this.ice.clear();for(const item of this.items)item.node.active=item.paper.active=false;for(const fan of this.groundRotors)fan.node.active=false;}
  destroy():void {this.uses=[];this.pulses.destroy();this.items.length=0;this.groundFans.destroy();this.node.destroy();this.rotorFrame.destroy();this.groundRotors.length=0;}
  private createFan(parent:Node):FanRotor {
    const node=new Node('Fan blade mask');node.layer=parent.layer;const transform=node.addComponent(UITransform);
    const mask=node.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_ELLIPSE;const opacity=node.addComponent(UIOpacity);parent.addChild(node);
    const normalized=new Node('Fan blade proportions');normalized.layer=node.layer;normalized.addComponent(UITransform);node.addChild(normalized);
    const rotor=new Node('Fan blade');rotor.layer=node.layer;const size=rotor.addComponent(UITransform);size.setContentSize(2,2);
    const sprite=rotor.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.rotorFrame;normalized.addChild(rotor);
    return {node,transform,rotor,opacity};
  }
  private updateFan(fan:FanRotor,height:number,age:number,alpha:number):void {
    const scale=height/232,rx=60*scale,ry=66*scale;
    fan.transform.setContentSize(rx*2,ry*2);fan.node.setPosition(16*scale,29*scale);
    fan.rotor.parent!.setScale(rx,ry,1);fan.rotor.angle=-fanRotorAngle(age)*180/Math.PI;fan.opacity.opacity=Math.round(alpha*255);
  }
  private updateGroundFans(state:GameState,quiet:boolean):void {
    let count=0;
    for(const field of state.fields){
      const visual=skillFieldVisual(field,state.time),age=state.time-field.bornAt;
      if(quiet||field.kind!=='fire'||!visual?.main||age<.18)continue;
      const fan=this.groundRotors[count]??this.createFan(this.groundFans);if(!this.groundRotors[count])this.groundRotors.push(fan);count++;
      fan.node.active=true;this.updateFan(fan,40,age,Math.max(0,Math.min(1,(field.expiresAt-state.time)/.42)));
      // updateFan uses local offsets for a centred sprite; ground art has no enclosing sprite node.
      fan.node.setPosition(X(field.x-36)+16*40/232,Y(field.y+7)+29*40/232);
    }
    for(let i=count;i<this.groundRotors.length;i++)this.groundRotors[i].node.active=false;
  }
  private drawIceShavings(x:number,y:number,age:number,quiet:boolean,simple:boolean,propAlpha:number):void {
    const g=this.ice;
    for(const shaving of iceShavings(age,quiet,simple)){
      const c=Math.cos(shaving.angle),s=Math.sin(shaving.angle),scale=shaving.scale,side=shaving.side;
      const p=(u:number,v:number)=>({x:X(x+shaving.dx+side*(u*c-v*s)*scale),y:Y(y+shaving.dy+(u*s+v*c)*scale)});
      const move=(u:number,v:number)=>{const a=p(u,v);g.moveTo(a.x,a.y);};
      const quad=(u:number,v:number,w:number,z:number)=>{const a=p(u,v),b=p(w,z);g.quadraticCurveTo(a.x,a.y,b.x,b.y);};
      const alpha=Math.round(255*shaving.alpha*propAlpha);
      move(-7,1);quad(-2,-6,6,-4);quad(4,-1,8,1);quad(2,0,-3,5);g.close();
      g.fillColor=shaving.blue?new Color(140,221,239,alpha):new Color(217,250,255,alpha);
      g.strokeColor=new Color(66,139,157,alpha);g.lineWidth=1.45*scale;g.fill();g.stroke();
      move(-4,.8);quad(-.5,-2.7,3.5,-2.8);g.strokeColor=new Color(252,255,250,alpha);g.lineWidth=1.6*scale;g.stroke();
    }
  }
  private drawPickupShell(use:SkillUse,time:number,bag:Vec,quiet:boolean):void {
    const effect=pickupShell(use,time,bag,quiet);if(!effect)return;
    const g=this.shells;
    const arc=(point:(a:number)=>Vec,start:number,end:number)=>{
      const steps=Math.max(3,Math.ceil(Math.abs(end-start)*12));
      for(let i=0;i<=steps;i++){
        const p=point(start+(end-start)*i/steps);if(i)g.lineTo(X(p.x),Y(p.y));else g.moveTo(X(p.x),Y(p.y));
      }
    };
    if(effect.kind==='burst'){
      const {center,radius,progress,alpha}=effect;
      g.strokeColor=new Color(182,255,220,Math.round(255*alpha));g.lineWidth=3-2*progress;
      for(const a of [.15,2.05,4.32]){
        arc(t=>({x:center.x+radius*Math.cos(t),y:center.y+radius*Math.sin(t)}),a+progress*.24,a+1.08-progress*.52);g.stroke();
      }
      return;
    }
    if(effect.drawArcs){
      const {center,angle,scaleX,scaleY,alpha}=effect,c=Math.cos(angle),s=Math.sin(angle);
      const point=(a:number)=>{const x=39*Math.cos(a)*scaleX,y=39*Math.sin(a)*scaleY;
        return {x:center.x+x*c-y*s,y:center.y+x*s+y*c};};
      for(const side of [-1,1]){
        const start=side*Math.PI*.5-.88,end=side*Math.PI*.5+.88;
        arc(point,start,end);g.strokeColor=new Color(64,142,128,Math.round(alpha*255));g.lineWidth=5;g.stroke();
        arc(point,start,end);g.strokeColor=new Color(224,255,230,Math.round(alpha*255));g.lineWidth=2.5;g.stroke();
      }
    }
    const alpha=Math.round(255*effect.closeAlpha),y=bag.y+4,top=-5-(1-effect.close)*4;
    g.fillColor=new Color(140,85,57,alpha);g.strokeColor=new Color(255,218,141,alpha);g.lineWidth=1.6;
    g.roundRect(X(bag.x)-4,Y(y+top)-7,8,7,2);g.fill();g.stroke();
    if(!quiet&&effect.close>.85){
      g.strokeColor=new Color(255,244,204,alpha);g.lineWidth=2;
      g.moveTo(X(bag.x-8),Y(y-1));g.lineTo(X(bag.x-12),Y(y-4));
      g.moveTo(X(bag.x+8),Y(y-1));g.lineTo(X(bag.x+12),Y(y-4));g.stroke();
    }
  }
  private drawLid(pose:DeliveryBagPose|null,open:number):void {
    const g=this.lid;g.clear();if(!pose||open<=.01)return;
    const {width,height,tilt,flip,scale}=pose,c=Math.cos(tilt),s=Math.sin(tilt),edge=width*.40,lift=height*.35*open;
    const p=(x:number,y:number)=>{const yy=y-height*.75;return {x:X(pose.x+flip*scale*(x*c-yy*s)),y:Y(pose.y+scale*(x*s+yy*c))};};
    const move=(x:number,y:number)=>{const q=p(x,y);g.moveTo(q.x,q.y);};
    const line=(x:number,y:number)=>{const q=p(x,y);g.lineTo(q.x,q.y);};
    const quad=(x:number,y:number,u:number,v:number)=>{const a=p(x,y),b=p(u,v);g.quadraticCurveTo(a.x,a.y,b.x,b.y);};
    const alpha=Math.round(255*open);g.lineWidth=scale;
    move(-edge,-2);line(edge*.8,-4);line(edge,0);line(-edge*.85,2);g.close();
    g.fillColor=new Color(65,69,68,alpha);g.strokeColor=new Color(52,80,82,alpha);g.fill();g.stroke();
    move(-edge,-2);line(-edge-1,-2-lift);quad(0,-5-lift,edge*.77,-4-lift*.84);line(edge*.8,-4);g.close();
    g.fillColor=new Color(196,209,189,alpha);g.fill();g.stroke();
    move(-edge+1,-2-lift);line(edge*.72,-4-lift*.84);g.strokeColor=new Color(38,123,115,alpha);g.lineWidth=1.6*scale;g.stroke();
  }
  private create():Item {
    const node=new Node('Use prop');node.layer=this.node.layer;const transform=node.addComponent(UITransform);
    const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;const opacity=node.addComponent(UIOpacity);this.node.addChild(node);
    const fan=this.createFan(node);
    const paper=new Node('Use label');paper.layer=this.node.layer;paper.addComponent(UITransform);const paperGraphics=paper.addComponent(Graphics);
    const paperOpacity=paper.addComponent(UIOpacity);this.node.addChild(paper);
    const text=new Node('Text');text.layer=this.node.layer;text.addComponent(UITransform);const label=text.addComponent(Label);
    label.fontSize=15;label.lineHeight=20;label.isBold=true;label.color=new Color(72,58,50,255);
    label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;label.overflow=Label.Overflow.CLAMP;paper.addChild(text);
    const item={node,transform,sprite,opacity,fan,paper,paperGraphics,label,paperOpacity};this.items.push(item);return item;
  }
}
