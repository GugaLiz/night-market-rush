import {Color, Graphics, Label, Node, Sprite, UITransform, UIOpacity} from 'cc';
import {WORLD} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import {ELITE_KINDS, EPIC_KINDS, ORDINARY_KINDS, SKILL_KINDS, WEAPON_KINDS, type GameEvent, type GameState, type Settings} from '../domain/shared/types';
import {DamageLabelModel, PLAYER_LABEL_HEIGHT, PLAYER_LABEL_LIFETIME, type EnemyVitals, type PlayerLabel} from './damage-model';
import {SpriteAtlas} from './sprite-atlas';

const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const rgba=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,Math.round(clamp(a,0,255)));
const spriteNames=new Set<string>([...ORDINARY_KINDS,...ELITE_KINDS,...EPIC_KINDS,...SKILL_KINDS,...WEAPON_KINDS]);

interface TextNode {node:Node;label:Label;transform:UITransform;opacity:UIOpacity}
interface PlayerNode extends TextNode {icon:Sprite;iconNode:Node;iconTransform:UITransform;image:string}

/**
 * Receives the same event stream and display dt as the Web renderer. World
 * parent must be centred 1280x720 and above enemy/courier sprites. The host
 * passes dt=0 when simulation is paused to keep labels frozen. SpriteAtlas is
 * borrowed and must outlive this layer. Enemy HP plaques use the same shared
 * collision-avoidance model as the old Web canvas; enemies do not gain a new
 * per-hit floating damage number.
 */
export class DamageLabelsView {
  readonly node:Node;
  private readonly model=new DamageLabelModel();
  private readonly panels:Graphics;
  private readonly panelTextRoot:Node;
  private readonly playerTextRoot:Node;
  private readonly labels=new Map<number,TextNode>();
  private readonly labelPool:TextNode[]=[];
  private readonly playerNodes:PlayerNode[]=[];

  constructor(parent:Node,private readonly atlas:SpriteAtlas){
    this.node=this.makeNode('DamageAndVitals',parent);
    this.panels=this.makeNode('EnemyHealthBars',this.node).addComponent(Graphics);
    this.panelTextRoot=this.makeNode('EnemyHealthText',this.node);
    this.playerTextRoot=this.makeNode('PlayerHealthFeedback',this.node);
  }

  /** Forward each simulation event once, before update(), in event order. */
  events(events:readonly GameEvent[]):void {for(const event of events)this.model.add(event);}

  update(dt:number,state:GameState,settings:Pick<Settings,'reduceMotion'>):void {
    this.model.update(dt,state,settings.reduceMotion);this.panels.clear();
    const ids=new Set<number>();
    for(const panel of this.model.vitals){
      this.drawPanel(panel);
      if(panel.h<=10)continue;
      ids.add(panel.id);let view=this.labels.get(panel.id);
      if(!view){view=this.labelPool.pop()??this.createText(this.panelTextRoot);this.labels.set(panel.id,view);}
      this.updatePanelText(view,panel);
    }
    for(const [id,view] of this.labels){
      if(ids.has(id))continue;
      this.labels.delete(id);view.node.active=false;this.labelPool.push(view);
    }
    this.model.visible.forEach((label,index)=>{
      const view=this.playerNodes[index]??this.createPlayerText();
      this.updatePlayerText(view,label,settings.reduceMotion);
    });
    for(let i=this.model.visible.length;i<this.playerNodes.length;i++)this.playerNodes[i].node.active=false;
  }

  reset():void {
    this.model.reset();this.panels.clear();
    for(const view of this.labels.values()){view.node.active=false;this.labelPool.push(view);}this.labels.clear();
    for(const view of this.playerNodes)view.node.active=false;
  }

  destroy():void {this.labels.clear();this.labelPool.length=0;this.playerNodes.length=0;this.node.destroy();}

  private makeNode(name:string,parent:Node):Node {
    const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;
  }
  private createText(parent:Node):TextNode {
    const node=this.makeNode('HealthValue',parent),transform=node.getComponent(UITransform)!;
    const opacity=node.addComponent(UIOpacity),label=node.addComponent(Label);
    label.useSystemFont=true;label.isBold=true;label.overflow=Label.Overflow.SHRINK;
    label.horizontalAlign=Label.HorizontalAlign.RIGHT;label.verticalAlign=Label.VerticalAlign.CENTER;
    label.enableOutline=true;label.outlineColor=rgba(84,51,39);label.outlineWidth=2.4;
    return {node,label,transform,opacity};
  }
  private createPlayerText():PlayerNode {
    const node=this.makeNode('PlayerHealthValue',this.playerTextRoot),transform=node.getComponent(UITransform)!;
    const opacity=node.addComponent(UIOpacity);
    const iconNode=this.makeNode('DamageSource',node),iconTransform=iconNode.getComponent(UITransform)!;
    const icon=iconNode.addComponent(Sprite);icon.sizeMode=Sprite.SizeMode.CUSTOM;
    const textNode=this.makeNode('SignedAmount',node);textNode.getComponent(UITransform)!.setContentSize(76,40);
    const label=textNode.addComponent(Label);label.useSystemFont=true;label.isBold=true;
    label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
    label.overflow=Label.Overflow.SHRINK;label.enableOutline=true;label.outlineColor=rgba(66,37,56);label.outlineWidth=4.5;
    const result={node,label,transform,opacity,icon,iconNode,iconTransform,image:''};this.playerNodes.push(result);return result;
  }
  private drawPanel(p:EnemyVitals):void {
    const g=this.panels,numbered=p.h>10,pad=numbered?2.8:1.6,innerW=p.w-pad*2,innerH=p.h-pad*2;
    const pill=(x:number,y:number,w:number,h:number,r:number,c:Color)=>{
      if(w<=0||h<=0)return;g.fillColor=c;g.roundRect(X(x),Y(y+h),w,h,Math.max(0,Math.min(r,w/2,h/2)));g.fill();
    };
    pill(p.x,p.y+1.8,p.w,p.h,p.h/2,rgba(85,51,39,255*p.alpha));
    pill(p.x,p.y,p.w,p.h,p.h/2,rgba(237,197,148,255*p.alpha));
    pill(p.x+.65,p.y+.45,p.w-1.3,p.h-2.6,(p.h-2.6)/2,rgba(255,231,190,255*p.alpha));
    pill(p.x+pad,p.y+pad,innerW,innerH,innerH/2,rgba(74,46,37,255*p.alpha));
    if(p.hp>0){
      const fill=innerW*clamp(p.hp/p.maxHp,0,1);
      pill(p.x+pad,p.y+pad,fill,innerH,Math.min(fill/2,3.6),rgba(214,80,53,255*p.alpha));
      pill(p.x+pad,p.y+pad,fill,innerH-1.8,Math.min(fill/2,3.6),rgba(255,130,84,255*p.alpha));
    }
  }
  private updatePanelText(view:TextNode,p:EnemyVitals):void {
    view.node.active=true;view.transform.setAnchorPoint(1,.5);view.transform.setContentSize(p.w-12,p.h);
    view.node.setPosition(X(p.x+p.w-8),Y(p.y+p.h*.51));view.opacity.opacity=Math.round(255*unit(p.alpha));
    view.label.fontSize=p.h>22?16:14;view.label.lineHeight=p.h;view.label.color=rgba(255,240,207);
    view.label.string=`${Math.ceil(p.hp)}/${p.maxHp}`;
  }
  private updatePlayerText(view:PlayerNode,label:PlayerLabel,reduced:boolean):void {
    const age=this.model.clock-label.at,y=label.y+PLAYER_LABEL_HEIGHT/2;
    view.node.active=true;view.node.setPosition(X(label.x),Y(y));
    view.opacity.opacity=Math.round(255*clamp((PLAYER_LABEL_LIFETIME-age)/.25,0,1));
    view.label.fontSize=26+(reduced?0:5*Math.max(0,1-age/.22));view.label.lineHeight=40;
    view.label.color=label.heal?rgba(163,255,203):rgba(255,153,128);
    view.label.string=(label.heal?'+':'−')+(Number.isInteger(label.amount)?String(label.amount):label.amount.toFixed(1));
    const hasIcon=!!label.source&&spriteNames.has(label.source);view.iconNode.active=hasIcon;
    if(hasIcon&&label.source){
      if(view.image!==label.source){view.icon.spriteFrame=this.atlas.require(label.source);view.image=label.source;}
      const size=this.atlas.size(label.source),h=Math.min(17,17*size.height/size.width);
      view.iconTransform.setContentSize(h*size.width/size.height,h);view.iconTransform.setAnchorPoint(.5,.5);
      view.iconNode.setPosition(-37,0);
    }
  }
}

function unit(n:number):number {return clamp(n,0,1);}

// Remaining parity: system font rasterisation, exact Canvas stroke metrics and
// clipped capsule edges can differ in Creator. Validate overlapping plaques,
// dense crowds, HUD/safe-area obstruction and actual Web/mobile screenshots.
