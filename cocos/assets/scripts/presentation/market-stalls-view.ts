import {Color, Graphics, Label, Node, resources, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity} from 'cc';
import {WORLD} from '../domain/core/config';
import {epicForWave} from '../domain/core/waves';
import type {EpicKind, GameState, MarketStall, MarketStallKind, Settings} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';

type Phase='open'|'signed'|'rolled';
interface VisibleStall {
  stall:MarketStall;phase:Phase;age:number;locked:boolean;reenter:boolean;coins:boolean;
  heal:number;boss?:EpicKind;remaining:number|null;
}
interface StallNode {
  node:Node;opacity:UIOpacity;floor:Graphics;shadow:Graphics;body:Sprite;
  signRoot:Node;signOpacity:UIOpacity;ropes:Graphics;paper:Node;paperGraphics:Graphics;
  icon:Sprite;coins:Graphics;label:Label;roll:Graphics;stamp:Node;stampOpacity:UIOpacity;
}
const styles:Record<MarketStallKind,{ink:string;trim:string;label:string;icon:string}>={
  soup:{ink:'#8b3e32',trim:'#c8543a',label:'回血',icon:'health'},
  vortex:{ink:'#57374c',trim:'#90527a',label:'涡锅',icon:'vortex'},
  frost:{ink:'#23546a',trim:'#508899',label:'冲刺碎冰',icon:'frost'},
  brine:{ink:'#365647',trim:'#548568',label:'餐盘带毒',icon:'poison'},
  final:{ink:'#733f28',trim:'#ab6935',label:'进圈交餐',icon:'meal'},
};
const color=(hex:string,alpha=255)=>{const value=new Color().fromHEX(hex);value.a=alpha;return value;};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const signTop=31+106*.63;

/** Ground art and raised placards are separated so combat warnings stay above both. */
export class MarketStallsView {
  readonly node:Node;
  private readonly signs:Node;
  private readonly stalls:StallNode[]=[];
  private readonly dyed=new Map<MarketStallKind,SpriteFrame>();
  private destroyed=false;
  constructor(parent:Node,private readonly atlas:SpriteAtlas) {
    this.node=this.makeNode('Market stalls',parent);
    this.signs=this.makeNode('Market placards',parent);
    for(const kind of ['vortex','frost','brine','final'] as const){
      resources.load(`art/stall-${kind}/texture`,Texture2D,(error,texture)=>{
        if(this.destroyed)return;
        if(error||!texture){console.warn(`Unable to load stall art ${kind}:`,error);return;}
        const frame=new SpriteFrame();frame.texture=texture;frame.packable=false;this.dyed.set(kind,frame);
      });
    }
  }

  update(state:GameState,settings:Settings):void {
    this.signs.active=this.node.activeInHierarchy;
    this.placeSignsBelowWarnings();
    const market=state.market,visible:VisibleStall[]=[];
    const coins=state.player.hp>=state.player.maxHp,heal=Math.min(25,state.player.maxHp-state.player.hp);
    if(market.offer){
      const offer=market.offer;
      const remaining=offer.expiresAt===null?null:clamp((offer.expiresAt-state.time)/Math.max(1e-9,offer.expiresAt-offer.openedAt));
      for(const stall of offer.stalls)visible.push({stall,phase:'open',age:state.time-offer.openedAt,
        locked:stall.kind==='final'&&!offer.ready,reenter:offer.mustReenter,coins,heal,boss:epicForWave(state.wave),remaining});
    }
    if(market.receipt&&state.time-market.receipt.signedAt<1.05){
      for(const stall of market.receipt.stalls){
        const signed=stall.kind===market.receipt.stall.kind;
        visible.push({stall,phase:signed?'signed':'rolled',age:state.time-market.receipt.signedAt,locked:false,reenter:false,
          coins:signed?market.receipt.soupCoins:coins,heal:signed?market.receipt.soupHeal??heal:heal,remaining:null});
      }
    }
    if(market.expired&&state.time-market.expired.at<.70){
      for(const stall of market.expired.stalls)visible.push({stall,phase:'rolled',age:state.time-market.expired.at,
        locked:false,reenter:false,coins,heal,remaining:null});
    }
    while(this.stalls.length<visible.length)this.stalls.push(this.create());
    this.stalls.forEach((item,index)=>{
      const data=visible[index];item.node.active=item.signRoot.active=!!data;if(!data)return;
      const {stall,phase,age,locked,reenter}=data,style=styles[stall.kind];
      const x=stall.x-WORLD.width/2,y=WORLD.height/2-stall.y;
      item.node.setPosition(x,y);item.signRoot.setPosition(x-2,y+signTop);
      const duration=phase==='signed'?1.05:.70;
      const alpha=phase==='open'?255:Math.round(255*clamp((duration-age)/.22));
      item.opacity.opacity=item.signOpacity.opacity=alpha;
      this.drawFloor(item.floor,stall.radius,phase==='open',locked);
      item.body.spriteFrame=this.dyed.get(stall.kind)??this.atlas.require('orderStall');
      item.body.node.getComponent(UITransform)!.setContentSize(163,106);item.body.node.setPosition(0,84);
      const text=stall.kind==='soup'?(data.coins?'金币 +5':`回血 +${data.heal}`):
        stall.kind==='final'?(locked?(data.boss?'击败首领':'巨包守摊'):reenter?'出圈再进':style.label):style.label;
      const width=text.length<=2?100:143;
      const retract=phase==='rolled'?(settings.reduceMotion?1:clamp(age/.48)):0;
      const swing=!settings.reduceMotion&&phase==='open'&&age<.34?Math.sin(age/.34*Math.PI*2)*.045*(1-age/.34):0;
      item.signRoot.angle=-(swing-.016)*180/Math.PI;
      this.drawRopes(item.ropes,width);
      item.paper.active=retract<.999;
      item.paper.setScale(1,1-retract,1);
      this.drawPaper(item.paperGraphics,width,style.trim,data.remaining);
      item.label.string=text;item.label.color=color(style.ink);
      item.label.node.getComponent(UITransform)!.setContentSize(width-46,31);
      item.label.node.setPosition(19,-18.5);
      const showCoins=stall.kind==='soup'&&data.coins&&!locked;
      item.coins.node.active=showCoins;item.icon.node.active=!showCoins;
      if(showCoins)this.drawCoins(item.coins,-width/2+23,-17.5);
      else {
        const picture=locked?(data.boss??'giantBun'):style.icon;
        const frame=this.atlas.require(picture),h=Math.min(29,37*frame.rect.height/frame.rect.width);
        item.icon.spriteFrame=frame;item.icon.node.getComponent(UITransform)!.setContentSize(h*frame.rect.width/frame.rect.height,h);
        item.icon.node.setPosition(-width/2+23,-17.15);
      }
      item.roll.clear();
      if(phase==='rolled'&&retract>0){
        const yRoll=-35*(1-retract);
        item.roll.fillColor=color('#d6b687');item.roll.strokeColor=color('#845d42');item.roll.lineWidth=1.2;
        item.roll.roundRect(-width/2,yRoll-3,width,4+retract*2,2.5);item.roll.fill();item.roll.stroke();
      }
      item.stamp.active=phase==='signed';
      if(phase==='signed'){
        const impact=settings.reduceMotion||stall.kind==='final'?1:clamp(age/.12);
        item.stamp.setPosition(width*.25,-41);item.stamp.angle=7.45;
        const scale=settings.reduceMotion?1:1+(1-impact)*.35;item.stamp.setScale(scale,scale,1);
        item.stampOpacity.opacity=Math.round(255*impact);
      }
    });
  }

  destroy():void {
    this.destroyed=true;this.node.destroy();this.signs.destroy();this.stalls.length=0;
    for(const frame of this.dyed.values())frame.destroy();this.dyed.clear();
  }

  private makeNode(name:string,parent:Node):Node {
    const node=new Node(name);node.layer=parent.layer;node.addComponent(UITransform);parent.addChild(node);return node;
  }
  private placeSignsBelowWarnings():void {
    const parent=this.signs.parent;if(!parent)return;
    // Keep every collidable field/attack boundary and enemy projectile above signs.
    const names=new Set(['Giant pulse warnings','Skill fields outlines','EnemyWarningOutlines','Enemy projectiles foreground']);
    const first=parent.children.findIndex(child=>names.has(child.name));
    if(first<0)return;
    const current=this.signs.getSiblingIndex(),target=current<first?first-1:first;
    if(current!==target)this.signs.setSiblingIndex(target);
  }
  private drawFloor(g:Graphics,radius:number,visible:boolean,locked:boolean):void {
    g.clear();if(!visible)return;
    g.fillColor=color(locked?'#3b373a':'#f9d99b',locked?80:36);
    g.strokeColor=color('#4c4144');g.lineWidth=5.2;g.circle(0,0,radius);g.fill();g.stroke();
    g.strokeColor=color(locked?'#c5b9a7':'#ffe7b2');g.lineWidth=2.7;g.circle(0,0,radius);g.stroke();
    const r=Math.max(0,radius-4),step=7.2/Math.max(1,r),dash=3.4/Math.max(1,r);
    g.strokeColor=color(locked?'#c2b8a4':'#f4d598',locked?173:220);g.lineWidth=1.2;
    for(let a=0;a<Math.PI*2;a+=step){g.arc(0,0,r,a,Math.min(Math.PI*2,a+dash),false);g.stroke();}
    if(locked){
      g.strokeColor=color('#f0d9b4');g.lineWidth=2.8;g.arc(0,2.8,4.2,0,Math.PI,false);g.stroke();
      g.fillColor=color('#ecd5b1');g.roundRect(-7,-9,14,10,2);g.fill();
      g.fillColor=color('#594a49');g.rect(-1.1,-6,2.2,4);g.fill();
    }else{
      g.fillColor=color('#ffe6b5',230);g.strokeColor=color('#685344');g.lineWidth=1.7;
      g.moveTo(-8,10);g.lineTo(5,10);g.lineTo(9,6);g.lineTo(9,-10);g.lineTo(6,-8.5);
      g.lineTo(3,-10);g.lineTo(0,-8.5);g.lineTo(-3,-10);g.lineTo(-8,-8.5);g.close();g.fill();g.stroke();
      g.strokeColor=color('#576c55');g.lineWidth=2.4;g.moveTo(-4,0);g.lineTo(-1,-3);g.lineTo(5,3);g.stroke();
    }
  }
  private drawRopes(g:Graphics,width:number):void {
    g.clear();g.strokeColor=color('#634634');g.lineWidth=2.3;
    for(const side of [-1,1]){const x=side*width*.32;g.moveTo(x-2,6);g.lineTo(x,-4);g.stroke();}
    g.strokeColor=color('#e5cc97');g.lineWidth=1.1;
    for(const side of [-1,1]){const x=side*width*.32;g.moveTo(x-1,6);g.lineTo(x+1,-4);g.stroke();}
  }
  private drawPaper(g:Graphics,width:number,trim:string,remaining:number|null):void {
    g.clear();g.fillColor=color('#4e382c',136);g.roundRect(-width/2+1,-37,width,35,4);g.fill();
    g.fillColor=color('#fff2d3');g.strokeColor=color('#795438');g.lineWidth=1.8;
    g.roundRect(-width/2,-34,width,34,4);g.fill();g.stroke();
    g.fillColor=color(trim);g.rect(-width/2+3,-31,3.3,28);g.fill();
    if(remaining!==null){
      g.fillColor=color('#b29d74',46);g.rect(-width/2+8,-33,width-16,1.7);g.fill();
      g.fillColor=color(trim);g.rect(-width/2+8,-33,(width-16)*remaining,1.7);g.fill();
    }
  }
  private drawCoins(g:Graphics,x:number,y:number):void {
    g.clear();
    for(const offset of [-5,4]){
      g.fillColor=color('#bc791e');g.strokeColor=color('#955522');g.lineWidth=1.5;g.ellipse(x+offset,y-1,8,8.8);g.fill();g.stroke();
      g.fillColor=color('#ffd66a');g.ellipse(x+offset-.9,y+.5,7,7.6);g.fill();
      g.fillColor=color('#aa7837');g.rect(x+offset-2.6,y-2,3.8,4);g.fill();
    }
  }
  private create():StallNode {
    const node=this.makeNode('Stall',this.node),opacity=node.addComponent(UIOpacity);
    const floor=this.makeNode('Delivery zone',node).addComponent(Graphics);
    const shadow=this.makeNode('Stall shadow',node).addComponent(Graphics);
    shadow.fillColor=color('#392e3b',96);shadow.ellipse(3,32,70.1,10);shadow.fill();
    const body=this.makeNode('Stall art',node).addComponent(Sprite);body.sizeMode=Sprite.SizeMode.CUSTOM;
    const signRoot=this.makeNode('Stall placard',this.signs),signOpacity=signRoot.addComponent(UIOpacity);
    const ropes=this.makeNode('Placard ropes',signRoot).addComponent(Graphics);
    const paper=this.makeNode('Placard paper',signRoot),paperGraphics=paper.addComponent(Graphics);
    const icon=this.makeNode('Placard icon',paper).addComponent(Sprite);icon.sizeMode=Sprite.SizeMode.CUSTOM;
    const coins=this.makeNode('Coin reward',paper).addComponent(Graphics);
    const label=this.makeNode('Placard label',paper).addComponent(Label);
    label.fontSize=23;label.lineHeight=28;label.isBold=true;label.overflow=Label.Overflow.SHRINK;
    label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
    const roll=this.makeNode('Rolled placard edge',signRoot).addComponent(Graphics);
    const stamp=this.makeNode('Signed stamp',signRoot),stampOpacity=stamp.addComponent(UIOpacity);
    stamp.getComponent(UITransform)!.setContentSize(42,22);
    const stampArt=stamp.addComponent(Graphics);stampArt.fillColor=color('#fff0d0');stampArt.strokeColor=color('#ac4337');stampArt.lineWidth=2.7;
    stampArt.roundRect(-21,-11,42,22,4);stampArt.fill();stampArt.stroke();
    const stampText=this.makeNode('Signed text',stamp);stampText.getComponent(UITransform)!.setContentSize(42,22);
    const text=stampText.addComponent(Label);text.string='已签';text.fontSize=16;text.lineHeight=20;text.isBold=true;text.color=color('#98362d');
    text.horizontalAlign=Label.HorizontalAlign.CENTER;text.verticalAlign=Label.VerticalAlign.CENTER;
    return {node,opacity,floor,shadow,body,signRoot,signOpacity,ropes,paper,paperGraphics,icon,coins,label,roll,stamp,stampOpacity};
  }
}
