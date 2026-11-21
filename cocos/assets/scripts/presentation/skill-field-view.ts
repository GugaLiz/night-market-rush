import {Color, Graphics, Label, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GameState,Settings,SkillField} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';
import {skillFieldVisual} from './skill-field-model';

const turn=Math.PI*2;
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const color=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,a);
interface Stamp {node:Node; sprite:Sprite; transform:UITransform; opacity:UIOpacity}
interface Caption {node:Node; label:Label}

/** The ground art sits below actors; the outline sibling must sit above actors
 * and other world art, but below the HUD. Assets are optional: boundaries are
 * drawn even if the original atlas is unavailable or still loading. */
export class SkillFieldView {
  readonly groundNode:Node;
  readonly outlineNode:Node;
  private readonly fill:Graphics;
  private readonly outline:Graphics;
  private readonly stampRoot:Node;
  private readonly captionRoot:Node;
  private readonly frames:SpriteFrame[]=[];
  private readonly stamps:Stamp[]=[];
  private readonly captions:Caption[]=[];
  private stampCount=0;
  private captionCount=0;
  private disposed=false;

  constructor(parent:Node,private readonly atlas:SpriteAtlas){
    this.groundNode=this.node('Skill fields ground',parent);
    this.fill=this.node('Field color',this.groundNode).addComponent(Graphics);
    this.stampRoot=this.node('Field artwork',this.groundNode);
    this.outlineNode=this.node('Skill fields outlines',parent);
    this.outline=this.node('Live field boundaries',this.outlineNode).addComponent(Graphics);
    this.captionRoot=this.node('Field duration captions',this.outlineNode);
    resources.load('art/delivery-skills/texture',Texture2D,(error,texture)=>{
      if(this.disposed)return;
      if(error||!texture){console.warn('[SkillFieldView] Field art unavailable; range outlines remain visible.',error);return;}
      const w=texture.width/2,h=texture.height/2;
      if(!(w>0&&h>0))return;
      for(let i=0;i<4;i++){
        const frame=new SpriteFrame();frame.texture=texture;
        frame.rect=new Rect(i%2*w,Math.floor(i/2)*h,w,h);frame.originalSize=new Size(w,h);frame.packable=false;
        this.frames.push(frame);
      }
    });
  }

  update(state:GameState,settings:Pick<Settings,'quality'|'reduceMotion'>):void {
    this.fill.clear();this.outline.clear();this.stampCount=0;this.captionCount=0;
    for(const field of state.fields){
      const data=skillFieldVisual(field,state.time);if(!data)continue;
      const hot=field.kind==='fire',x=X(field.x),y=Y(field.y),r=data.radius;
      // Keep the complete, collision-aligned boundary legible throughout the
      // field's lifetime, including reduced motion and its final frames.
      this.fill.fillColor=hot?color(235,145,66,42):color(70,177,151,56);
      this.fill.circle(x,y,r);this.fill.fill();
      this.outline.strokeColor=hot?color(118,64,37,240):color(31,104,94,235);
      this.outline.lineWidth=5;this.outline.circle(x,y,r);this.outline.stroke();
      this.outline.strokeColor=hot?color(255,228,170):color(200,255,220);
      this.outline.lineWidth=2;this.outline.circle(x,y,r);this.outline.stroke();
      this.art(field,state.time,r,data.main,settings);
      if(data.main)this.caption(field,data.remaining);
    }
    for(let i=this.stampCount;i<this.stamps.length;i++)this.stamps[i].node.active=false;
    for(let i=this.captionCount;i<this.captions.length;i++)this.captions[i].node.active=false;
  }

  reset():void {
    this.fill.clear();this.outline.clear();this.stampCount=0;this.captionCount=0;
    for(const stamp of this.stamps)stamp.node.active=false;
    for(const caption of this.captions)caption.node.active=false;
  }

  destroy():void {
    this.disposed=true;this.groundNode.destroy();this.outlineNode.destroy();
    for(const frame of this.frames)frame.destroy();this.frames.length=0;
  }

  private node(name:string,parent:Node):Node {
    const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;
  }
  private stamp(frame:SpriteFrame,x:number,y:number,w:number,h:number,angle:number,alpha:number):void {
    let item=this.stamps[this.stampCount++];
    if(!item){
      const n=this.node('Field art',this.stampRoot),transform=n.getComponent(UITransform)!;
      const sprite=n.addComponent(Sprite),opacity=n.addComponent(UIOpacity);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      item={node:n,sprite,transform,opacity};this.stamps.push(item);
    }
    item.node.active=true;item.sprite.spriteFrame=frame;item.transform.setContentSize(w,h);
    item.node.setPosition(X(x),Y(y));item.node.angle=-angle*180/Math.PI;item.opacity.opacity=Math.round(alpha*255);
  }
  private art(field:SkillField,time:number,r:number,main:boolean,settings:Pick<Settings,'quality'|'reduceMotion'>):void {
    const hot=field.kind==='fire',age=time-field.bornAt,fade=Math.min(1,(field.expiresAt-time)/.42);
    if(this.frames.length===4){
      if(hot){
        const count=main?(settings.quality==='simple'?4:6):(settings.quality==='simple'?2:3);
        const spin=settings.reduceMotion?0:age*(main?1.1:1.5);
        for(let i=0;i<count;i++){
          const a=i*turn/count+spin+(main?.35:field.id*.89),distance=r*.78;
          const width=Math.min(main?122:69,r*.70);
          this.stamp(this.frames[(i+Number(main))%2],field.x+Math.cos(a)*distance,
            field.y+Math.sin(a)*distance,width,width,a+Math.PI/2,.72*fade);
        }
      }else this.stamp(this.frames[3],field.x,field.y,r*1.82,r*1.82,field.id%5*.45,.53*fade);
    }
    if(hot&&main){
      const fan=this.atlas.require('fan'),meal=this.atlas.require('meal');
      this.stamp(meal,field.x+1,field.y+9,25*meal.rect.width/meal.rect.height,25,-.12,fade);
      if(settings.reduceMotion||age>=.18)this.stamp(fan,field.x-36,field.y+7,40*fan.rect.width/fan.rect.height,40,0,fade);
    }
  }
  private caption(field:SkillField,remaining:number):void {
    let item=this.captions[this.captionCount++];
    if(!item){
      const node=this.node('Field duration',this.captionRoot);node.getComponent(UITransform)!.setContentSize(145,28);
      const label=node.addComponent(Label);label.fontSize=16;label.lineHeight=21;label.isBold=true;
      label.enableOutline=true;label.outlineColor=color(53,36,30);label.outlineWidth=3;
      label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
      item={node,label};this.captions.push(item);
    }
    item.node.active=true;item.label.string=`${field.kind==='fire'?'热风':'汽水'} ${remaining.toFixed(1)}秒`;
    item.label.color=field.kind==='fire'?color(255,232,182):color(203,255,225);
    item.node.setPosition(X(Math.max(75,Math.min(WORLD.width-75,field.x))),Y(Math.max(95,Math.min(WORLD.height-55,field.y-18))));
  }
}
