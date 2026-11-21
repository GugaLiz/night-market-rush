import {Color, Graphics, Label, Node, Sprite, UITransform, UIOpacity} from 'cc';
import {CONFIG, pickupReach, WORLD} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import {isUltimate, SKILL_NAMES, WEAPON_NAMES, type GameState, type GroundCoin, type Pickup, type Settings, type Vec, type WeaponDrop} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';

const turn=Math.PI*2;
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const unit=(n:number)=>clamp(n,0,1);
const smooth=(n:number)=>{const t=unit(n);return t*t*(3-2*t);};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const color=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,a);

/** Identical target selection to the Web renderer; the caller can reuse it for HUD hints. */
export function nearestPickupHint(items:readonly Pickup[],player:Vec,time:number,needsHealth=true):Pickup|undefined {
  let closest:Pickup|undefined,nearest=Infinity;
  for(const p of items){
    if(p.kind==='health'&&!needsHealth)continue;
    if(p.retiringUntil||(p.disabledUntil??0)>time||(p.readyAt??0)>time||(p.expiresAt??Infinity)<=time)continue;
    const distance=Math.hypot(p.x-player.x,p.y-player.y);
    if(distance<nearest&&distance<=pickupReach(p)+145){closest=p;nearest=distance;}
  }
  return closest;
}

interface Visual {node:Node;opacity:UIOpacity}
interface PickupVisual extends Visual {back:Graphics; icon:Sprite; transform:UITransform; front:Graphics; label:Label;image:string}
interface WeaponVisual extends Visual {back:Graphics; crate:Sprite; crateTransform:UITransform; weapon:Sprite; weaponTransform:UITransform; weaponOpacity:UIOpacity; label:Label;image:string}

/**
 * Displays loot without changing GameState. Both parents must use a 1280x720,
 * centre-origin, Y-up world. Place groundNode below actors, and floatingNode
 * above enemies but below the courier, matching the Web rendering order.
 * SpriteAtlas textures and frames remain owned by the caller.
 */
export class PickupsLayer {
  readonly groundNode:Node;
  readonly floatingNode:Node;
  private readonly ground:Graphics;
  private readonly weapons:Node;
  private readonly bubbles:Node;
  private readonly hint:Label;
  private readonly pickups=new Map<number,PickupVisual>();
  private readonly pickupPool:PickupVisual[]=[];
  private readonly drops=new Map<number,WeaponVisual>();
  private readonly dropPool:WeaponVisual[]=[];

  constructor(groundParent:Node,private readonly atlas:SpriteAtlas,floatingParent:Node=groundParent){
    this.groundNode=this.node('PickupGround',groundParent);
    this.ground=this.node('CoinsAndShadows',this.groundNode).addComponent(Graphics);
    this.weapons=this.node('WeaponDrops',this.groundNode);
    this.floatingNode=this.node('FloatingPickups',floatingParent);
    this.bubbles=this.node('PickupBubbles',this.floatingNode);
    this.hint=this.makeLabel('PickupHint',this.floatingNode,15,360,24);
    this.hint.node.active=false;
  }

  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    const {time,player}=state,needsHealth=player.hp<player.maxHp;
    this.ground.clear();
    for(const coin of state.coins)this.drawCoin(coin,time,settings.reduceMotion);
    const supply=state.zones.find(z=>z.kind==='supply');
    const ids=new Set<number>();
    for(const p of state.pickups){
      ids.add(p.id);let view=this.pickups.get(p.id);
      if(!view){view=this.pickupPool.pop()??this.createPickup();this.pickups.set(p.id,view);view.node.active=true;}
      this.updatePickup(view,p,player,time,settings.reduceMotion,needsHealth,supply);
    }
    for(const [id,view] of this.pickups){if(!ids.has(id)){this.pickups.delete(id);view.node.active=false;this.pickupPool.push(view);}}
    const weaponIds=new Set<number>();
    for(const d of state.weaponDrops){
      weaponIds.add(d.id);let view=this.drops.get(d.id);
      if(!view){view=this.dropPool.pop()??this.createWeapon();this.drops.set(d.id,view);view.node.active=true;}
      this.updateWeapon(view,d,player,time);
    }
    for(const [id,view] of this.drops){if(!weaponIds.has(id)){this.drops.delete(id);view.node.active=false;this.dropPool.push(view);}}
    const hint=nearestPickupHint(state.pickups,player,time,needsHealth);
    this.hint.node.active=!!hint&&!hint.groupId;
    if(hint&&!hint.groupId){
      this.hint.string=(hint.kind==='health'?'回血 · ':'技能 · ')+SKILL_NAMES[hint.kind];
      this.hint.color=hint.kind==='health'?color(255,218,213):color(192,255,226);
      this.hint.node.setPosition(X(hint.x),Y(hint.y+20));
    }
  }

  destroy():void {
    this.pickups.clear();this.pickupPool.length=0;this.drops.clear();this.dropPool.length=0;
    this.groundNode.destroy();this.floatingNode.destroy();
  }

  private node(name:string,parent:Node):Node {
    const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;
  }

  private makeLabel(name:string,parent:Node,fontSize:number,width:number,height:number):Label {
    const node=this.node(name,parent);node.getComponent(UITransform)!.setContentSize(width,height);
    const label=node.addComponent(Label);label.fontSize=fontSize;label.lineHeight=height;
    label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
    label.color=color(255,243,221);label.isBold=true;label.overflow=Label.Overflow.CLAMP;return label;
  }

  private createPickup():PickupVisual {
    const node=this.node('Pickup',this.bubbles),opacity=node.addComponent(UIOpacity);
    const back=this.node('BubbleBack',node).addComponent(Graphics);
    const iconNode=this.node('PickupIcon',node),transform=iconNode.getComponent(UITransform)!;
    const icon=iconNode.addComponent(Sprite);icon.sizeMode=Sprite.SizeMode.CUSTOM;
    const front=this.node('BubbleBadge',node).addComponent(Graphics);
    const label=this.makeLabel('SupplyChoice',node,14,42,19);
    return {node,opacity,back,icon,transform,front,label,image:''};
  }

  private createWeapon():WeaponVisual {
    const node=this.node('WeaponDrop',this.weapons),opacity=node.addComponent(UIOpacity);
    const back=this.node('Stand',node).addComponent(Graphics);
    const crateNode=this.node('CrateIcon',node),crateTransform=crateNode.getComponent(UITransform)!;
    const crate=crateNode.addComponent(Sprite);crate.sizeMode=Sprite.SizeMode.CUSTOM;crate.spriteFrame=this.atlas.require('weaponCrate');
    const weaponNode=this.node('WeaponIcon',node),weaponTransform=weaponNode.getComponent(UITransform)!;
    const weapon=weaponNode.addComponent(Sprite);weapon.sizeMode=Sprite.SizeMode.CUSTOM;
    const weaponOpacity=weaponNode.addComponent(UIOpacity);
    const label=this.makeLabel('WeaponCaption',node,14,260,22);
    return {node,opacity,back,crate,crateTransform,weapon,weaponTransform,weaponOpacity,label,image:''};
  }

  private updatePickup(view:PickupVisual,p:Pickup,player:Vec,time:number,quiet:boolean,needsHealth:boolean,supplyOrigin?:Vec):void {
    const r=p.kind==='fan'||isUltimate(p.kind)?39:35,reach=pickupReach(p),choice=!!p.groupId&&!!supplyOrigin;
    const near=quiet?0:smooth(1-(Math.hypot(p.x-player.x,p.y-player.y)-reach)/44);
    const loose=quiet?0:Math.sin(time*3.5+p.id)*1.9;
    let x=p.x,y=p.y;
    view.back.clear();view.front.clear();view.label.node.active=choice;
    if(view.image!==p.kind){view.icon.spriteFrame=this.atlas.require(p.kind);view.image=p.kind;}
    const size=this.atlas.size(p.kind);
    if(choice&&supplyOrigin){
      const progress=quiet?1:smooth((time-p.bornAt)/Math.max(.01,(p.readyAt??p.bornAt)-p.bornAt));
      x=lerp(supplyOrigin.x,p.x,progress);y=lerp(supplyOrigin.y,p.y,progress)-Math.sin(progress*Math.PI)*32;
      view.opacity.opacity=Math.round(255*(p.retiringUntil?unit((p.retiringUntil-time)/.4):Math.min(1,progress*3)));
      const b=view.back;b.fillColor=color(91,60,46);b.ellipse(0,0,33,10);b.fill();
      b.fillColor=color(243,217,169);b.ellipse(0,4,33,10);b.fill();
      view.transform.setAnchorPoint(.5,0);view.transform.setContentSize(48*size.width/size.height,48);
      view.icon.node.setPosition(0,7);view.icon.node.setRotationFromEuler(0,0,0);
      const healing=p.kind==='bubble',ice=p.kind!=='fan'&&!healing;
      const f=view.front;f.fillColor=p.kind==='fan'?color(164,78,40):healing?color(52,118,96):color(61,113,153);
      f.strokeColor=color(255,229,188);f.lineWidth=1.8;f.roundRect(-21,-19,42,19,4);f.fill();f.stroke();
      view.label.string=p.kind==='fan'?'清怪':healing?'护身':'冰封';view.label.node.setPosition(0,-9.5);
    }else{
      const disabled=(p.disabledUntil??0)>time||(p.readyAt??0)>time;
      view.opacity.opacity=Math.round(255*(disabled?.46:1)*(p.retiringUntil?unit((p.retiringUntil-time)/.4):1));
      this.shadow(p.x,p.y,20,5,85);
      if(!p.retiringUntil&&!disabled&&(p.kind!=='health'||needsHealth))this.reach(p,player,reach);
      const b=view.back;
      if(!quiet&&!p.retiringUntil&&(p.readyAt??0)<=time){
        const hooked=(p.pulledUntil??0)>time,vx=hooked?player.x-p.x:p.vx??0,vy=hooked?player.y-p.y:p.vy??0;
        this.wake(b,r,vx,vy);
      }
      b.fillColor=color(185,248,205,104);b.strokeColor=color(32,93,96);b.lineWidth=2.6;b.circle(0,0,r);b.fill();b.stroke();
      b.strokeColor=color(160,246,220);b.lineWidth=2.2;b.circle(0,0,r-1.6);b.stroke();
      b.strokeColor=color(245,255,223);b.lineWidth=4;this.arc(b,0,0,r-4,-4.35,-3.68);b.stroke();
      const h=1.32*Math.min(p.kind==='fan'?45:39,(p.kind==='fan'?55:49)*size.height/size.width);
      view.transform.setAnchorPoint(.5,.5);view.transform.setContentSize(h*size.width/size.height,h);
      view.icon.node.setPosition(2,0);view.icon.node.setRotationFromEuler(0,0,-(-.035+near*.08)*180/Math.PI);
      const f=view.front,badgeX=-r*.62,badgeY=-r*.73;
      f.fillColor=p.kind==='health'?color(164,61,75):color(32,119,113);
      f.strokeColor=p.kind==='health'?color(255,235,227):color(196,255,224);f.lineWidth=1.7;
      f.circle(badgeX,badgeY,10);f.fill();f.stroke();
      f.fillColor=p.kind==='health'?color(255,241,228):color(255,241,161);
      if(p.kind==='health'){
        f.moveTo(badgeX,badgeY-5);f.bezierCurveTo(badgeX-10,badgeY+1,badgeX-6,badgeY+9,badgeX,badgeY+4);
        f.bezierCurveTo(badgeX+6,badgeY+9,badgeX+10,badgeY+1,badgeX,badgeY-5);
      }else{
        f.moveTo(badgeX+1,badgeY+7);f.lineTo(badgeX-5.5,badgeY-1.3);f.lineTo(badgeX-.8,badgeY-1.3);
        f.lineTo(badgeX-2,badgeY-7.3);f.lineTo(badgeX+5.8,badgeY+1.8);f.lineTo(badgeX+1.1,badgeY+1.8);
      }
      f.close();f.fill();
      y+=-39+loose-near*3;
    }
    view.node.setPosition(X(x),Y(y));
  }

  private updateWeapon(view:WeaponVisual,d:WeaponDrop,player:Vec,time:number):void {
    const locked=d.readyAt>time||(d.returnDrop&&!d.leftPickupCircle);
    this.shadow(d.x,d.y,27,6,64);
    if(!locked)this.reach(d,player,CONFIG.weapons.pickupReach);
    view.node.setPosition(X(d.x),Y(d.y));view.opacity.opacity=255;
    const g=view.back;g.clear();g.fillColor=color(151,84,57);g.strokeColor=color(102,60,49);g.lineWidth=2;
    g.roundRect(-32,-9,64,16,5);g.fill();g.stroke();
    g.fillColor=locked?color(188,148,108):color(215,148,77);g.rect(-29,-3,58,9);g.fill();
    g.fillColor=locked?color(216,185,154):color(255,230,160);g.rect(-27,-7,6,13);g.rect(21,-7,6,13);g.fill();
    const crateSize=this.atlas.size('weaponCrate');
    view.crateTransform.setAnchorPoint(.5,0);view.crateTransform.setContentSize(35*crateSize.width/crateSize.height,35);view.crate.node.setPosition(0,-2);
    if(view.image!==d.kind){view.weapon.spriteFrame=this.atlas.require(d.kind);view.image=d.kind;}
    const size=this.atlas.size(d.kind),h=Math.min(39,55*size.height/size.width);
    view.weaponTransform.setAnchorPoint(.5,0);view.weaponTransform.setContentSize(h*size.width/size.height,h);
    view.weapon.node.setPosition(0,18);view.weaponOpacity.opacity=locked?128:255;
    view.label.color=color(255,227,166);view.label.string=locked?(d.readyAt>time?'武器 · 退换锁定':'武器 · 离开后可退换'):`${d.returnDrop?'退换武器':'武器'} · ${WEAPON_NAMES[d.kind]}`;
    view.label.node.setPosition(0,-24);
  }

  private shadow(x:number,y:number,rx:number,ry:number,alpha:number):void {
    const g=this.ground;g.fillColor=color(39,58,62,alpha);g.ellipse(X(x),Y(y)-2,rx,ry);g.fill();
  }

  private reach(item:Vec,player:Vec,radius:number):void {
    const dx=player.x-item.x,dy=player.y-item.y,proximity=unit(1-(Math.hypot(dx,dy)-radius)/44);
    if(!proximity)return;
    const g=this.ground,angle=-Math.atan2(dy,dx),alpha=Math.round(255*proximity*.85);
    g.strokeColor=color(86,60,54,alpha);g.lineWidth=3.5;this.arc(g,X(item.x),Y(item.y),radius,angle-.22,angle+.22);g.stroke();
    g.strokeColor=color(255,234,181,alpha);g.lineWidth=1.7;this.arc(g,X(item.x),Y(item.y),radius,angle-.22,angle+.22);g.stroke();
  }

  private wake(g:Graphics,r:number,vx:number,vy:number):void {
    const speed=Math.hypot(vx,vy);if(speed<2)return;
    const dx=vx/speed,dy=-vy/speed,reach=Math.min(28,speed*.19);
    for(const side of [-1,1]){
      const x1=-r*.75,y1=side*r*.49,x2=-r-reach*(side<0?1:.68),y2=side*r*.30,x3=-r*.79,y3=side*r*.32;
      const point=(x:number,y:number)=>({x:x*dx-y*dy,y:x*dy+y*dx});
      const a=point(x1,y1),b=point(x2,y2),c=point(x3,y3);
      g.fillColor=side<0?color(117,226,194,181):color(215,255,229,184);
      g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineTo(c.x,c.y);g.close();g.fill();
    }
  }

  private arc(g:Graphics,x:number,y:number,r:number,start:number,end:number):void {
    const steps=Math.max(3,Math.ceil(Math.abs(end-start)*12));
    for(let i=0;i<=steps;i++){const a=start+(end-start)*i/steps,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(i)g.lineTo(px,py);else g.moveTo(px,py);}
  }

  private drawCoin(coin:GroundCoin,time:number,reduced:boolean):void {
    const g=this.ground,age=Math.max(0,time-coin.bornAt),flight=reduced?1:Math.min(1,age/CONFIG.rewards.coinGrace);
    const origin=coin.dropOrigin??coin,ease=1-(1-flight)**2;
    const x=lerp(origin.x,coin.x,ease),y=lerp(origin.y,coin.y,ease);
    const hop=Math.sin(flight*Math.PI)*(21+coin.id%18),size=coin.value>1?9:7.8;
    const phase=age*(flight<1?22:5)+coin.id,spin=reduced?.94:.56+.44*Math.abs(Math.cos(phase));
    g.fillColor=color(50,33,45,128);g.ellipse(X(x),Y(y)-1,size*(1-hop/130),size*.40);g.fill();
    const rotation=-.25,cos=Math.cos(rotation),sin=Math.sin(rotation);
    const point=(a:number,b:number)=>({x:X(x)+a*spin*cos-b*sin,y:Y(y-6-hop)-(a*spin*sin+b*cos)});
    const disc=(cx:number,cy:number,r:number)=>{
      for(let i=0;i<=24;i++){const a=i*turn/24,p=point(cx+Math.cos(a)*r,cy+Math.sin(a)*r);if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);}g.close();
    };
    g.fillColor=color(189,107,22);g.strokeColor=color(115,56,27);g.lineWidth=1.8;disc(0,0,size);g.fill();g.stroke();
    g.fillColor=color(255,211,73);disc(-.7,-.9,size-1.3);g.fill();
    g.strokeColor=color(255,241,164);g.lineWidth=1.8;
    for(let i=0;i<=12;i++){const a=Math.PI+i*Math.PI*.8/12,p=point(-.7+Math.cos(a)*(size-2.7),-.9+Math.sin(a)*(size-2.7));if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);}g.stroke();
    g.fillColor=color(169,104,35);const corners=[[-2.1,-2.2],[1.9,-2.2],[1.9,1.8],[-2.1,1.8]];
    corners.forEach(([cx,cy],i)=>{const p=point(cx,cy);if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);});g.close();g.fill();
  }
}

// Not yet migrated: exact radial-gradient bubble shading, curved wake and
// typographic outline, particle effects on collection, and all post-activation
// skill/weapon visuals. Verify appearance, touch-world mapping and performance
// in real builds before claiming parity with the Web renderer.
