import {Color, Graphics, Label, Node, Sprite, UITransform, UIOpacity} from 'cc';
import {CONFIG, WORLD} from '../domain/core/config';
import {isOnPaperRoute} from '../domain/core/geometry';
import type {GameState, Player, Settings, Vec, Zone} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';

const turn=Math.PI*2;
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const unit=(n:number)=>Math.max(0,Math.min(1,n));
const rgba=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,Math.round(Math.max(0,Math.min(255,a))));
const local=(x:number,y:number,angle:number,a:number,b:number):Vec=>{
  const c=Math.cos(angle),s=Math.sin(angle);return {x:x+a*c-b*s,y:y+a*s+b*c};
};
function line(g:Graphics,points:readonly Vec[],stroke:Color,width:number,closed=false,fill?:Color):void {
  if(!points.length)return;
  g.moveTo(X(points[0].x),Y(points[0].y));for(let i=1;i<points.length;i++)g.lineTo(X(points[i].x),Y(points[i].y));
  if(closed)g.close();if(fill){g.fillColor=fill;g.fill();}if(width>0){g.strokeColor=stroke;g.lineWidth=width;g.stroke();}
}
function arc(g:Graphics,x:number,y:number,r:number,start:number,end:number,stroke:Color,width:number):void {
  const steps=Math.max(3,Math.ceil(Math.abs(end-start)*12)),points:Vec[]=[];
  for(let i=0;i<=steps;i++){const a=start+(end-start)*i/steps;points.push({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r});}
  line(g,points,stroke,width);
}
function curve(g:Graphics,points:readonly [Vec,Vec,Vec,Vec],stroke:Color,width:number):void {
  const [a,b,c,d]=points;g.moveTo(X(a.x),Y(a.y));g.bezierCurveTo(X(b.x),Y(b.y),X(c.x),Y(c.y),X(d.x),Y(d.y));
  g.strokeColor=stroke;g.lineWidth=width;g.stroke();
}

interface SpriteNode {node:Node;transform:UITransform;sprite:Sprite;opacity:UIOpacity;image:string}
interface ZoneNode extends SpriteNode {label:Label;labelNode:Node}
export interface StatusAnchors {bag?:Vec}

/**
 * State-only presentation. Parents must be centred 1280x720, Y-up UI world
 * nodes. Put groundNode below enemies, backNode behind the courier and frontNode
 * above it. Atlas ownership stays with the caller; no game rules are changed.
 */
export class StatusZonesLayer {
  readonly groundNode:Node;
  readonly backNode:Node;
  readonly frontNode:Node;
  private readonly ground:Graphics;
  private readonly zoneSprites:Node;
  private readonly back:Graphics;
  private readonly front:Graphics;
  private readonly zoneViews=new Map<number,ZoneNode>();
  private readonly zonePool:ZoneNode[]=[];
  private readonly skatesBack:SpriteNode[]=[];
  private readonly skatesFront:SpriteNode[]=[];
  private readonly heat:SpriteNode;
  private readonly dispatch:SpriteNode;
  private readonly stamp:SpriteNode;

  constructor(groundParent:Node,private readonly atlas:SpriteAtlas,backParent:Node=groundParent,frontParent:Node=groundParent){
    this.groundNode=this.makeNode('StatusGround',groundParent);
    this.ground=this.makeNode('ZoneGraphics',this.groundNode).addComponent(Graphics);
    this.zoneSprites=this.makeNode('ZoneSprites',this.groundNode);
    this.backNode=this.makeNode('StatusBehindCourier',backParent);
    this.back=this.makeNode('StatusBehindGraphics',this.backNode).addComponent(Graphics);
    this.frontNode=this.makeNode('StatusAboveCourier',frontParent);
    this.front=this.makeNode('StatusFrontGraphics',this.frontNode).addComponent(Graphics);
    for(let i=0;i<3;i++){
      this.skatesBack.push(this.makeSprite('SkateBack',this.backNode));
      this.skatesFront.push(this.makeSprite('SkateFront',this.frontNode));
    }
    this.heat=this.makeSprite('HeatBag',this.frontNode);
    this.dispatch=this.makeSprite('Dispatch',this.frontNode);
    this.stamp=this.makeSprite('Stamp',this.frontNode);
  }

  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>,anchors:StatusAnchors={}):void {
    const time=state.time,p=state.player,reduced=settings.reduceMotion;
    this.ground.clear();this.back.clear();this.front.clear();
    const occupied=state.zones.some(z=>isOnPaperRoute(p,z,time)),ids=new Set<number>();
    for(const zone of state.zones){
      if(time<zone.bornAt||time>=zone.expiresAt)continue;
      if(zone.kind==='supply'&&!state.pickups.some(pickup=>pickup.groupId===zone.groupId&&!pickup.retiringUntil))continue;
      ids.add(zone.id);let view=this.zoneViews.get(zone.id);
      if(!view){view=this.zonePool.pop()??this.makeZone();this.zoneViews.set(zone.id,view);}
      view.node.active=true;
      this.drawZone(zone,state,reduced,occupied,view);
    }
    for(const [id,view] of this.zoneViews){if(!ids.has(id)){this.zoneViews.delete(id);view.node.active=false;this.zonePool.push(view);}}
    if(occupied)this.routeStride(p,time,reduced);
    this.skate(state,reduced);
    const bag=anchors.bag??{x:p.x-18*p.facing,y:p.y-38};
    this.hook(state,bag,reduced);
    this.playerStatus(state,settings,bag);
  }

  reset():void {
    this.ground.clear();this.back.clear();this.front.clear();
    for(const view of this.zoneViews.values()){view.node.active=false;this.zonePool.push(view);}this.zoneViews.clear();
    for(const view of [...this.skatesBack,...this.skatesFront,this.heat,this.dispatch,this.stamp])view.node.active=false;
  }
  destroy():void {this.zoneViews.clear();this.zonePool.length=0;this.groundNode.destroy();this.backNode.destroy();this.frontNode.destroy();}

  private makeNode(name:string,parent:Node):Node {
    const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;
  }
  private makeSprite(name:string,parent:Node):SpriteNode {
    const node=this.makeNode(name,parent),transform=node.getComponent(UITransform)!;
    const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    const opacity=node.addComponent(UIOpacity);node.active=false;
    return {node,transform,sprite,opacity,image:''};
  }
  private makeZone():ZoneNode {
    const view=this.makeSprite('Zone',this.zoneSprites);
    const labelNode=this.makeNode('RouteSign',view.node),transform=labelNode.getComponent(UITransform)!;
    transform.setContentSize(102,24);const label=labelNode.addComponent(Label);
    label.useSystemFont=true;label.isBold=true;label.fontSize=15;label.lineHeight=22;
    label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
    label.overflow=Label.Overflow.SHRINK;label.color=rgba(255,244,217);labelNode.active=false;
    return {...view,label,labelNode};
  }
  private sprite(view:SpriteNode,image:string,x:number,y:number,height:number,angle=0,flip=1,alpha=1,width?:number):void {
    if(view.image!==image){view.sprite.spriteFrame=this.atlas.require(image);view.image=image;}
    const source=this.atlas.size(image);view.transform.setAnchorPoint(.5,0);
    view.transform.setContentSize(width??height*source.width/source.height,height);
    view.node.active=true;view.node.setPosition(X(x),Y(y));view.node.setRotationFromEuler(0,0,-angle*180/Math.PI);
    view.node.setScale(flip<0?-1:1,1,1);view.opacity.opacity=Math.round(255*unit(alpha));
  }

  private drawZone(z:Zone,state:GameState,reduced:boolean,occupied:boolean,view:ZoneNode):void {
    const time=state.time,age=Math.max(0,time-z.bornAt),fade=unit((z.expiresAt-time)*2);
    if(z.kind==='route'){
      view.sprite.enabled=false;view.opacity.opacity=Math.round(255*fade);view.node.setPosition(X(z.x),Y(z.y));
      view.node.setScale(1,1,1);view.node.setRotationFromEuler(0,0,0);
      this.route(z,age,reduced,occupied,fade,view);return;
    }
    view.sprite.enabled=true;view.labelNode.active=false;
    const settle=reduced?1:Math.min(1,age/.30);
    const lift=18*(1-Math.min(1,settle/.62))**2+3*Math.sin(Math.PI*Math.max(0,(settle-.62)/.38));
    const x=z.kind==='supply'?Math.max(WORLD.bounds.left+20,z.x-31):z.x,y=z.y-lift,tilt=(z.id%2===0?1:-1)*.14*(1-settle);
    const radius=(z.kind==='cone'?14:22)*(1-lift*.018);
    this.ground.fillColor=rgba(35,24,29,64*fade);this.ground.ellipse(X(x),Y(z.y+2),radius,radius*.32);this.ground.fill();
    const image=z.kind==='cone'?'cone':z.kind==='supply'?'supplyBox':settle>.70?'lure':'lureBox';
    this.sprite(view,image,x,y,z.kind==='cone'?38:42,tilt,1,fade);
    if(z.kind==='lure'){
      for(let i=0;i<30;i++){const a=i*turn/30;arc(this.ground,z.x,z.y,z.radius,a,a+.04,rgba(248,213,148,101*fade),1.5);}
      for(let i=0;i<3;i++){
        const rise=reduced?i/3:(age*.57+i/3)%1,px=z.x-9+i*9,base=y-24-rise*19;
        curve(this.ground,[{x:px,y:base},{x:px-7,y:base-5},{x:px+7,y:base-9},{x:px+2,y:base-15}],rgba(255,229,183,255*(1-rise)*.62*settle*fade),1.8);
      }
    }
  }

  private route(z:Zone,age:number,reduced:boolean,occupied:boolean,fade:number,view:ZoneNode):void {
    const g=this.ground;if(z.length<1){view.labelNode.active=false;return;}
    const half=z.width/2,unfold=reduced?1:1-(1-unit(age/.36))**3,edge=z.length*unfold;
    const p=(a:number,b:number)=>local(z.x,z.y,z.angle,a,b);
    line(g,[p(0,-half),p(z.length,-half),p(z.length,half),p(0,half)],rgba(255,240,187,128*fade),1.5,true);
    if(edge>0){
      line(g,[p(0,-half),p(edge,-half),p(edge,half),p(0,half)],rgba(0,0,0,0),0,true,rgba(243,211,155,148*fade));
      for(let x=0,i=0;x<edge;x+=70,i++){
        const end=Math.min(edge,x+70),ink=i%2?rgba(255,240,200,66*fade):rgba(169,138,82,66*fade);
        line(g,[p(x,-half),p(end,-half),p(end,half),p(x,half)],ink,0,true,ink);
        line(g,[p(x,-half),p(x,half)],rgba(113,87,67,136*fade),1.4);
      }
      const edgeColor=occupied?rgba(104,240,199,255*fade):rgba(120,100,70,161*fade);
      line(g,[p(0,-half+2),p(edge,-half+2)],edgeColor,occupied?4:2);line(g,[p(0,half-3),p(edge,half-3)],edgeColor,occupied?4:2);
      const routePoints:Vec[]=[p(3,0)];for(let x=12;x<Math.min(z.length-18,edge);x+=12)routePoints.push(p(x,Math.sin(x/48)*6));
      if(edge>=z.length-18)routePoints.push(p(Math.max(3,z.length-18),0));
      line(g,routePoints,occupied?rgba(32,93,86,255*fade):rgba(58,129,118,255*fade),3);
      const advance=reduced?0:(age*(occupied?80:32))%63;
      for(let x=-35+advance;x<edge-18;x+=63){
        if(x<5)continue;const y=Math.sin(x/48)*6;
        line(g,[p(x-8,y-7),p(x+5,y),p(x-8,y+7),p(x-4,y)],rgba(255,241,198,255*fade),2,true,
          occupied?rgba(19,99,87,255*fade):rgba(56,127,114,255*fade));
      }
    }
    view.labelNode.active=edge>=100;
    if(view.labelNode.active){
      const along=Math.min(z.length*.42,142),across=half-19,pos=p(along,across);
      const width=102;
      g.fillColor=occupied?rgba(35,94,81,255*fade):rgba(73,63,50,255*fade);
      g.strokeColor=occupied?rgba(168,246,211,255*fade):rgba(239,219,179,255*fade);g.lineWidth=1.5;
      g.roundRect(X(pos.x-width/2),Y(pos.y+11),width,22,5);g.fill();g.stroke();
      view.label.string=occupied?'加速中':'上路加速';view.labelNode.setPosition(pos.x-z.x,-(pos.y-z.y));
    }
  }

  private routeStride(p:Player,time:number,reduced:boolean):void {
    const speed=Math.hypot(p.vx,p.vy);if(speed<55||reduced)return;
    const flow=Math.min(1,speed/380),angle=Math.atan2(p.vy,p.vx);
    for(const side of [-1,1]){
      const phase=(time*2.4+(side+1)*.24)%1,head=-11-phase*13,length=(13+phase*14)*flow;
      const points=[local(p.x,p.y-2,angle,head,side*9),local(p.x,p.y-2,angle,head-length*.48,side*13),local(p.x,p.y-2,angle,head-length,side*11)];
      line(this.back,points,rgba(48,123,106),4);line(this.back,points,rgba(190,255,224),1.8);
    }
  }

  private skate(state:GameState,reduced:boolean):void {
    const p=state.player,time=state.time,active=p.skateUntil>time;
    for(const view of [...this.skatesBack,...this.skatesFront])view.node.active=false;
    if(!active)return;
    const {inner,outer,duration}=CONFIG.skills.skate,age=Math.max(0,time-p.skateUntil+duration);
    const push=reduced?1:1-(1-Math.min(1,age/.24))**2,orbit=reduced?.22:3.7*(age-.16*(1-Math.exp(-age/.16)));
    const alpha=unit((p.skateUntil-time)*2),g=this.back;
    g.strokeColor=rgba(229,178,91,27*alpha);g.lineWidth=outer-inner;g.circle(X(p.x),Y(p.y),(inner+outer)/2);g.stroke();
    for(const r of [inner,outer]){g.strokeColor=rgba(255,226,160,140*alpha);g.lineWidth=1.5;g.circle(X(p.x),Y(p.y),r);g.stroke();}
    for(let i=0;i<3;i++){
      const a=orbit+i*turn/3-.72,r=16+(inner+(i+.5)*(outer-inner)/3-16)*push;
      for(const track of [r-4,r+4]){
        arc(g,p.x,p.y,track,a-.70*push,a-.07*push,rgba(86,62,59,150*alpha),2.5);
        arc(g,p.x,p.y,track-1,a-.52*push,a-.14*push,rgba(236,198,134,181*alpha),1.2);
      }
      const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r,facing=Math.sin(a)<0?1:-1;
      const front=Math.sin(a)>=0,view=front?this.skatesFront[i]:this.skatesBack[i];
      this.sprite(view,'skate',x,y-3-6*(1-push),28,facing*(.47+.38*Math.cos(a)),facing,alpha);
    }
  }

  private hook(state:GameState,bag:Vec,reduced:boolean):void {
    const {time,player:p}=state,until=state.effects.hookUntil,latched=state.pickups.filter(item=>(item.pulledUntil??0)>time);
    if(!latched.length&&!(until>time))return;
    for(const item of latched){
      const latchAge=time-(item.pulledUntil!-CONFIG.skills.hook.reelTimeout),progress=reduced?1:unit(latchAge/CONFIG.skills.hook.launchTime);
      const dx=item.x-bag.x,dy=item.y-39-bag.y,travel=progress*Math.max(0,1-34/(Math.hypot(dx,dy)||1));
      this.hookLine(bag,{x:bag.x+dx*travel,y:bag.y+dy*travel},1-progress);
    }
    if(!latched.length){
      const age=time-until+CONFIG.skills.hook.duration,sweep=reduced?.28:Math.sin(Math.PI*Math.min(1,(Math.max(0,age)%.95)/.72))**2;
      this.hookLine(bag,{x:bag.x-p.facing*(17+33*sweep),y:bag.y+11-10*sweep},sweep);
    }
    this.front.fillColor=rgba(65,108,112);this.front.strokeColor=rgba(35,61,67);this.front.lineWidth=2;
    this.front.circle(X(bag.x),Y(bag.y),6);this.front.fill();this.front.stroke();
    this.front.fillColor=rgba(255,207,128);this.front.circle(X(bag.x),Y(bag.y),3.6);this.front.fill();
  }

  private hookLine(bag:Vec,tip:Vec,opening:number):void {
    const g=this.front,dx=tip.x-bag.x,dy=tip.y-bag.y,bend=Math.min(16,Math.hypot(dx,dy)*.055);
    const draw=(color:Color,width:number)=>{g.moveTo(X(bag.x),Y(bag.y));g.quadraticCurveTo(X((bag.x+tip.x)/2),Y((bag.y+tip.y)/2+bend),X(tip.x),Y(tip.y));g.strokeColor=color;g.lineWidth=width;g.stroke();};
    draw(rgba(41,70,76),4.5);draw(rgba(141,208,197),2.2);
    const angle=Math.atan2(dy-bend*2,dx),gap=3+6*opening;
    for(const side of [-1,1]){
      const points=[local(tip.x,tip.y,angle,-5,0),local(tip.x,tip.y,angle,0,side*6),local(tip.x,tip.y,angle,7,side*(gap+2)),local(tip.x,tip.y,angle,11,side*gap)];
      line(g,points,rgba(50,65,74),6);line(g,points,rgba(255,211,135),3.3);
    }
  }

  private playerStatus(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>,bag:Vec):void {
    const p=state.player,time=state.time,reduced=settings.reduceMotion,g=this.front;
    this.heat.node.active=false;this.dispatch.node.active=false;this.stamp.node.active=false;
    if(p.bubbleUntil>time)this.packingWrap(p.x,p.y,Math.max(0,time-p.bubbleUntil+7),reduced,unit((p.bubbleUntil-time)*4));
    if((p.dashUntil??0)>time&&!reduced){
      const d=p.dashDirection??p.moveDirection;
      for(let i=-1;i<=1;i++)line(g,[{x:p.x-d.x*28-d.y*i*12,y:p.y-d.y*28+d.x*i*12-20},
        {x:p.x-d.x*(82-Math.abs(i)*12)-d.y*i*12,y:p.y-d.y*(82-Math.abs(i)*12)+d.x*i*12-20}],rgba(181,255,229,187),3);
    }
    if((p.sprintMultiplier??1)>1.03&&!reduced){const d=p.moveDirection;line(g,[{x:p.x-d.x*13,y:p.y-d.y*13},{x:p.x-d.x*30,y:p.y-d.y*30}],rgba(255,232,188,102),2);}
    if(p.invulnerableUntil>time){g.strokeColor=rgba(255,246,203);g.lineWidth=2;g.ellipse(X(p.x),Y(p.y+2),24,7);g.stroke();}
    if(p.heatUntil>time){
      const x=bag.x-9*p.facing;this.sprite(this.heat,'heat',x,bag.y+3,22,-.12*p.facing);
      for(let i=0;i<3;i++){
        const rise=reduced?i/3:(time*.73+i/3)%1,px=x+(i-1)*6,y=bag.y-14-rise*15;
        const points:[Vec,Vec,Vec,Vec]=[{x:px,y},{x:px-6,y:y-4},{x:px+5,y:y-9},{x:px+1,y:y-14}];
        curve(g,points,rgba(129,83,54,255*(1-rise)*.65),3);curve(g,points,rgba(255,229,182,255*(1-rise)*.9),1.7);
      }
    }
    if(state.effects.dispatchUntil>time){
      const x=p.x+25*p.facing,y=p.y-38,alpha=unit((state.effects.dispatchUntil-time)*4);
      this.sprite(this.dispatch,'dispatch',x,y,23,.14*p.facing,1,alpha);
      for(let i=0;i<2;i++){
        const signal=reduced?(i+1)/3:((time-state.effects.dispatchStartedAt)*1.6+i*.5)%1;
        arc(g,x+6,y-23,4+signal*13,-1.48,-.23,rgba(187,255,232,255*alpha*(1-signal*.72)),2.2);
      }
    }
    if(p.stampUntil>time){
      this.stampWave(p,time,reduced);this.sprite(this.stamp,'stamp',bag.x-8*p.facing,bag.y+5,18,-.18*p.facing);
    }
  }

  private packingWrap(x:number,y:number,age:number,reduced:boolean,alpha:number):void {
    const g=this.front,wrap=reduced?1:1-(1-unit(age/.23))**2,sx=.90+.10*wrap,sy=.76+.24*wrap;
    const p=(a:number,b:number)=>({x:x+a*sx,y:y-39+b*sy});
    const a=p(-18,-63),b=p(-39,-63),c=p(-38,-44);g.moveTo(X(a.x),Y(a.y));g.quadraticCurveTo(X(b.x),Y(b.y),X(c.x),Y(c.y));
    for(const [lx,ly] of [[-34,23],[-19,38],[26,36],[36,20],[39,-42],[25,-62]]){const v=p(lx,ly);g.lineTo(X(v.x),Y(v.y));}
    g.close();g.fillColor=rgba(208,237,222,20*alpha);g.strokeColor=rgba(188,226,220,191*alpha);g.lineWidth=2;g.fill();g.stroke();
    for(const side of [-1,1])for(let row=0;row<5;row++){
      const v=p(side*(29+(row%2)*3),-45+row*16);
      g.fillColor=rgba(221,247,233,54*alpha);g.strokeColor=rgba(183,223,211,161*alpha);g.lineWidth=1.2;
      g.ellipse(X(v.x),Y(v.y),4.2*sx,6.1*sy);g.fill();g.stroke();
    }
    line(g,[p(-23,31),p(0,36),p(24,30)],rgba(255,207,142,204*alpha),2.6);
  }

  private stampWave(p:Player,time:number,reduced:boolean):void {
    const speed=Math.hypot(p.vx,p.vy),heading=speed>5?Math.atan2(p.vy,p.vx):Math.atan2(p.moveDirection.y,p.moveDirection.x);
    const drive=unit(speed/CONFIG.player.speed),dash=(p.dashUntil??0)>time?1:0;
    const nose=46+22*Math.abs(Math.sin(heading))+20*drive+9*dash,wing=32+8*Math.abs(Math.cos(heading))+13*drive+4*dash,tail=12-18*drive-13*dash;
    const opening=unit((time-p.stampUntil+CONFIG.skills.stamp.duration)/.17),fade=unit((p.stampUntil-time)/.26);
    const unfold=reduced?1:.78+.22*(1-(1-opening)**2),alpha=(.74+.26*drive)*(.5+.5*fade);
    const v=(a:number,b:number)=>local(p.x,p.y-43,heading,a*unfold,b*unfold),g=this.front;
    const a=v(tail,-wing),b=v(nose*.48,-wing),c=v(nose,-wing*.54),d=v(nose,0),e=v(nose,wing*.54),f=v(nose*.48,wing),h=v(tail,wing);
    const q=v(nose*.47,wing*.84),r=v(nose-10-3*drive,wing*.29),s=v(nose-10-3*drive,0),t=v(nose-10-3*drive,-wing*.29),u=v(nose*.47,-wing*.84);
    g.moveTo(X(a.x),Y(a.y));g.bezierCurveTo(X(b.x),Y(b.y),X(c.x),Y(c.y),X(d.x),Y(d.y));
    g.bezierCurveTo(X(e.x),Y(e.y),X(f.x),Y(f.y),X(h.x),Y(h.y));
    g.bezierCurveTo(X(q.x),Y(q.y),X(r.x),Y(r.y),X(s.x),Y(s.y));
    g.bezierCurveTo(X(t.x),Y(t.y),X(u.x),Y(u.y),X(a.x),Y(a.y));g.close();
    g.fillColor=rgba(215,87,52,200*alpha);g.fill();
    curve(g,[a,b,c,d],rgba(153,70,39,255*alpha),4);curve(g,[d,e,f,h],rgba(255,240,188,255*alpha),2);
  }
}

// Not yet identical to Web: exact map-fold clipping/dashed ink, raised route
// pin, vapor curves/gradients, skate ground shadows, padded wrap seam highlights,
// animated hook stitches, stamp speed-front slips, and artwork-aware backpack
// and shoe anchors. Verify layer ordering, real Creator output and performance.
