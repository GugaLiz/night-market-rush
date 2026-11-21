import {Color, Graphics, Mask, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity} from 'cc';
import {WORLD} from '../domain/core/config';
import {ELEMENTAL, elementalRadius} from '../domain/core/elemental-skills';
import {clamp} from '../domain/core/geometry';
import type {ElementalField, ElementalKind, GameEvent, GameState, Settings, Vec} from '../domain/shared/types';
import {enemyHeight} from './enemy-view';
import {SpriteAtlas} from './sprite-atlas';

const turn=Math.PI*2;
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const unit=(n:number)=>clamp(n,0,1);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const color=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,Math.round(clamp(a,0,255)));
type DisplaySettings=Pick<Settings,'quality'|'reduceMotion'>;
type ImpactEvent=Extract<GameEvent,{type:'frostShatter'|'iceShards'}>;
interface Impact {event:ImpactEvent;bornAt:number}
interface WokBroth {mask:Node;transform:UITransform;rotor:Node}
interface FieldIcon {node:Node;transform:UITransform;sprite:Sprite;opacity:UIOpacity;kind:ElementalKind|null;broth?:WokBroth;rim?:FieldStamp}
interface FieldStamp {node:Node;transform:UITransform;sprite:Sprite;opacity:UIOpacity}

/** The active radius is shared with simulation, including growth and expiry. */
export function elementalVisualRadius(field:ElementalField,time:number):number {
  return elementalRadius(field,time);
}

function arc(g:Graphics,x:number,y:number,r:number,start:number,end:number):void {
  const steps=Math.max(3,Math.ceil(Math.abs(end-start)*12));
  for(let i=0;i<=steps;i++){
    const a=mix(start,end,i/steps),px=X(x+Math.cos(a)*r),py=Y(y+Math.sin(a)*r);
    if(i)g.lineTo(px,py);else g.moveTo(px,py);
  }
}
function path(g:Graphics,points:readonly Vec[],fill:Color,stroke?:Color,width=1):void {
  if(!points.length)return;
  g.moveTo(X(points[0].x),Y(points[0].y));
  for(let i=1;i<points.length;i++)g.lineTo(X(points[i].x),Y(points[i].y));
  g.close();g.fillColor=fill;g.fill();
  if(stroke){g.strokeColor=stroke;g.lineWidth=width;g.stroke();}
}
function local(x:number,y:number,angle:number,a:number,b:number):Vec {
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:x+a*c-b*s,y:y+a*s+b*c};
}

/**
 * Field-only presentation: ground behind enemies, near rim/ice shards above
 * them. Parents use a centred 1280x720 Y-up world. It reads (never mutates)
 * simulation data; actual frost/poison damage and timers remain in core.
 * EnemyLayer owns the ice shell and poisoned-enemy status decoration.
 */
export class ElementalLayer {
  readonly groundNode:Node;
  readonly foregroundNode:Node;
  private readonly ground:Graphics;
  private readonly foreground:Graphics;
  private readonly poisonDetails:Graphics;
  private readonly poisonSteam:Graphics;
  private readonly props:Node;
  private readonly rims:Node;
  private readonly pools:Node;
  private readonly vapors:Node;
  private readonly poolStamps:FieldStamp[]=[];
  private readonly vaporStamps:FieldStamp[]=[];
  private poolCount=0;
  private vaporCount=0;
  private warm:SpriteFrame|null=null;
  private broth:SpriteFrame|null=null;
  private rim:SpriteFrame|null=null;
  private vapor:SpriteFrame|null=null;
  private pool:SpriteFrame|null=null;
  private disposed=false;
  private readonly icons=new Map<number,FieldIcon>();
  private readonly iconPool:FieldIcon[]=[];
  private readonly impacts:Impact[]=[];
  private lastTime=0;

  constructor(groundParent:Node,private readonly atlas:SpriteAtlas,foregroundParent:Node=groundParent){
    this.groundNode=this.node('ElementalGround',groundParent);
    this.pools=this.node('BrineGradientPools',this.groundNode);
    this.ground=this.node('FieldGraphics',this.groundNode).addComponent(Graphics);
    this.vapors=this.node('BrineVapor',this.groundNode);
    this.poisonDetails=this.node('BrineDetails',this.groundNode).addComponent(Graphics);
    this.props=this.node('FieldProps',this.groundNode);
    this.poisonSteam=this.node('BrineSteam',this.groundNode).addComponent(Graphics);
    this.foregroundNode=this.node('ElementalForeground',foregroundParent);
    this.rims=this.node('VortexNearWalls',this.foregroundNode);
    this.foreground=this.node('RimsAndIceImpacts',this.foregroundNode).addComponent(Graphics);
    this.loadArt('vortex-warm',frame=>{this.warm=frame;});
    this.loadArt('vortex-broth',frame=>{this.broth=frame;});
    this.loadArt('vortex-rim',frame=>{this.rim=frame;});
    this.loadArt('brine-vapor',frame=>{this.vapor=frame;});
    this.loadArt('brine-pool',frame=>{this.pool=frame;});
  }

  /** Deliver each simulation event batch exactly once with its simulation time. */
  events(events:readonly GameEvent[],time:number):void {
    if(time<this.lastTime)this.reset();
    for(const event of events){
      if(event.type==='frostShatter'||event.type==='iceShards')this.impacts.push({event,bornAt:time});
    }
  }

  update(state:GameState,settings:DisplaySettings):void {
    const time=state.time;if(time<this.lastTime)this.reset();this.lastTime=time;
    this.ground.clear();this.foreground.clear();this.poisonDetails.clear();this.poisonSteam.clear();this.poolCount=0;this.vaporCount=0;
    const active=new Set<number>();
    for(const field of state.elementalFields??[]){
      if(time<field.bornAt||time>=field.expiresAt)continue;
      active.add(field.id);
      let icon=this.icons.get(field.id);
      if(!icon){icon=this.iconPool.pop()??this.makeIcon();this.icons.set(field.id,icon);icon.node.active=true;}
      if(icon.kind!==field.kind){icon.sprite.spriteFrame=this.atlas.require(field.kind);icon.kind=field.kind;}
      if(field.kind!=='vortex'&&icon.broth)icon.broth.mask.active=false;
      if(field.kind!=='vortex'&&icon.rim)icon.rim.node.active=false;
      if(field.kind==='vortex')this.vortex(field,time,settings,icon);
      else if(field.kind==='poison')this.poison(field,time,settings,icon);
      else this.frost(field,time,settings,icon);
    }
    for(const [id,icon] of this.icons){if(!active.has(id)){this.icons.delete(id);icon.node.active=false;if(icon.rim)icon.rim.node.active=false;this.iconPool.push(icon);}}
    for(let i=this.poolCount;i<this.poolStamps.length;i++)this.poolStamps[i].node.active=false;
    for(let i=this.vaporCount;i<this.vaporStamps.length;i++)this.vaporStamps[i].node.active=false;
    for(let i=this.impacts.length-1;i>=0;i--){
      const impact=this.impacts[i],duration=impact.event.type==='frostShatter'?.90:1.05,age=time-impact.bornAt;
      if(age<0||age>=duration){this.impacts.splice(i,1);continue;}
      if(impact.event.type==='frostShatter')this.splitIce(impact.event,age/duration,settings);
      else this.iceLane(impact.event,age/duration,settings);
    }
  }

  reset():void {
    this.lastTime=0;this.impacts.length=0;this.ground.clear();this.foreground.clear();this.poisonDetails.clear();this.poisonSteam.clear();
    for(const icon of this.icons.values()){icon.node.active=false;if(icon.rim)icon.rim.node.active=false;this.iconPool.push(icon);}this.icons.clear();
    for(const item of this.poolStamps)item.node.active=false;for(const item of this.vaporStamps)item.node.active=false;
  }
  destroy():void {
    this.disposed=true;this.impacts.length=0;this.icons.clear();this.iconPool.length=0;
    this.groundNode.destroy();this.foregroundNode.destroy();
    for(const frame of [this.warm,this.broth,this.rim,this.vapor,this.pool])frame?.destroy();
    this.warm=this.broth=this.rim=this.vapor=this.pool=null;
  }

  private node(name:string,parent:Node):Node {
    const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;
  }
  private loadArt(name:string,done:(frame:SpriteFrame)=>void):void {
    resources.load(`art/${name}/texture`,Texture2D,(error,texture)=>{
      if(this.disposed)return;
      if(error||!texture){console.warn(`[ElementalLayer] Optional art unavailable: ${name}`,error);return;}
      const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(0,0,texture.width,texture.height);
      frame.originalSize=new Size(texture.width,texture.height);frame.packable=false;done(frame);
    });
  }
  private stamp(root:Node,list:FieldStamp[],index:number,frame:SpriteFrame,x:number,y:number,width:number,height:number,angle:number,alpha:number,flip=1):void {
    let item=list[index];
    if(!item){const node=this.node('Elemental stamp',root),transform=node.getComponent(UITransform)!;
      const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      item={node,transform,sprite,opacity:node.addComponent(UIOpacity)};list.push(item);}
    item.node.active=true;item.sprite.spriteFrame=frame;item.transform.setContentSize(width,height);
    item.node.setPosition(X(x),Y(y));item.node.angle=-angle*180/Math.PI;item.node.setScale(flip,1,1);
    item.opacity.opacity=Math.round(255*unit(alpha));
  }
  private updateBroth(icon:FieldIcon,scale:number,age:number,after:number,quiet:boolean):void {
    if(!this.warm||!this.broth){if(icon.broth)icon.broth.mask.active=false;return;}
    let broth=icon.broth;
    if(!broth){
      const mask=this.node('Wok broth mask',icon.node),transform=mask.getComponent(UITransform)!;
      mask.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;
      const normalized=this.node('Wok broth proportions',mask),rotor=this.node('Wok broth',normalized);
      rotor.getComponent(UITransform)!.setContentSize(2,2);
      const sprite=rotor.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.broth;
      broth={mask,transform,rotor};icon.broth=broth;
    }
    broth.mask.active=true;broth.mask.setPosition(0,0);
    broth.transform.setContentSize(122*scale,76*scale);broth.rotor.parent!.setScale(61*scale,38*scale,1);
    broth.rotor.angle=quiet?0:-(age*1.52+.84*unit((after+.38)/.38))*180/Math.PI;
  }
  private updateRim(icon:FieldIcon):void {
    if(!this.rim){if(icon.rim)icon.rim.node.active=false;return;}
    let item=icon.rim;
    if(!item){const node=this.node('Vortex near wall',this.rims),transform=node.getComponent(UITransform)!;
      const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      item={node,transform,sprite,opacity:node.addComponent(UIOpacity)};icon.rim=item;}
    item.node.active=icon.node.active;item.sprite.spriteFrame=this.rim;
    item.transform.setContentSize(icon.transform.contentSize);item.transform.setAnchorPoint(icon.transform.anchorPoint);
    item.node.setPosition(icon.node.position);item.node.setRotation(icon.node.rotation);item.opacity.opacity=icon.opacity.opacity;
  }
  private makeIcon():FieldIcon {
    const n=this.node('ElementalProp',this.props),transform=n.getComponent(UITransform)!;
    const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    return {node:n,transform,sprite,opacity:n.addComponent(UIOpacity),kind:null};
  }
  private setIcon(icon:FieldIcon,field:ElementalField,x:number,y:number,height:number,angle:number,opacity:number,anchorX=.5,anchorY=0):void {
    const size=this.atlas.size(field.kind);
    icon.transform.setAnchorPoint(anchorX,anchorY);icon.transform.setContentSize(height*size.width/size.height,height);
    icon.node.setPosition(X(x),Y(y));icon.node.setRotationFromEuler(0,0,-angle*180/Math.PI);
    icon.opacity.opacity=Math.round(255*unit(opacity));icon.node.active=icon.opacity.opacity>0;
  }

  private vortex(field:ElementalField,time:number,settings:DisplaySettings,icon:FieldIcon):void {
    const g=this.ground,age=time-field.bornAt,after=time-field.releaseAt,quiet=settings.reduceMotion,full=settings.quality==='standard';
    const open=unit((age-.15)/.26),fade=unit(1-after/ELEMENTAL.vortex.fade),alpha=open*fade;
    g.fillColor=color(56,41,31,72*alpha);g.ellipse(X(field.x-4),Y(field.y+17),56,13);g.fill();
    if(after>=0){
      const t=1-fade,travel=quiet?.85:1-(1-t)**2;
      if(t<.68){
        const radius=ELEMENTAL.vortex.blastRadius*(.22+.78*travel);
        for(let i=0;i<3;i++){
          const a=i*turn/3+.27;
          g.strokeColor=color(151,86,49,255*alpha*(1-t/.68));g.lineWidth=7;arc(g,field.x,field.y,radius,a-.64,a+.60);g.stroke();
          g.strokeColor=color(255,220,170,255*alpha*(1-t/.68));g.lineWidth=3;arc(g,field.x,field.y,radius+2,a-.56,a+.17);g.stroke();
        }
      }
      const count=full?13:8;
      for(let i=0;i<count;i++){
        const a=i*turn/count+.21,r=ELEMENTAL.vortex.blastRadius*(.24+.76*travel)*(.83+.17*Math.sin(i*3.2)**2);
        const lift=quiet?4:Math.sin(Math.PI*t)*(15+(i%3)*7);
        g.fillColor=color(194,124,69,201*alpha);g.ellipse(X(field.x+Math.cos(a)*r),Y(field.y+Math.sin(a)*r-lift),4.1,2.3);g.fill();
      }
    }else{
      const count=full?12:7,gather=.72+.28*unit(-after/.38);
      for(let i=0;i<count;i++){
        const progress=((quiet?0:age*.49)+.38+i*.618)%1,r=(25+(1-progress)**1.25*(126+i%3*20))*gather;
        const a=i*2.4+progress*2.9,x=field.x+Math.cos(a)*r,y=field.y+Math.sin(a)*r*.80-8;
        const a1=alpha*Math.sin(progress*Math.PI)**.6;
        g.fillColor=i%3===0?color(113,145,76,255*a1):i%3===1?color(173,80,57,255*a1):color(244,216,157,255*a1);
        g.ellipse(X(x),Y(y),i%3===1?5.2:4.1,2.3);g.fill();
      }
    }
    const rise=unit((age-.17)/.25),windup=unit((after+.32)/.32);
    const scale=(quiet?.70:.28+.42*(1-(1-rise)**2))*(1-.10*windup)*(.80+.20*fade);
    const size=this.atlas.size('vortex');
    icon.sprite.spriteFrame=this.warm??this.atlas.require('vortex');
    this.setIcon(icon,field,field.x,field.y-8-(quiet?0:Math.sin(rise*Math.PI)*9),size.height*scale,
      quiet?0:-.10*(1-rise)+.05*windup,rise*fade,144/size.width,1-64/size.height);
    this.updateBroth(icon,scale,age,after,quiet);
    // The cropped original near wall masks enemies inside the wok.
    this.updateRim(icon);
    // Steam follows the opening prop; still emits a quiet pose with reduced motion.
    for(let i=0;i<(full?3:2);i++){
      const lift=quiet?.36+i*.12:(age*.57+i*.37)%1;
      const x=field.x+(i-(full?1:.5))*12*scale,y=field.y-18*scale-lift*45*scale;
      const a=Math.sin(Math.PI*lift)*rise*fade;
      g.strokeColor=color(255,234,211,190*a);g.lineWidth=2.4*scale;
      g.moveTo(X(x),Y(y+7*scale));g.bezierCurveTo(X(x-6*scale),Y(y-scale),X(x+6*scale),Y(y-6*scale),X(x+2*scale),Y(y-15*scale));g.stroke();
    }
  }

  private poison(field:ElementalField,time:number,settings:DisplaySettings,icon:FieldIcon):void {
    const g=this.ground,age=time-field.bornAt,fade=unit((field.expiresAt-time)/ELEMENTAL.poison.fade);
    const radius=elementalVisualRadius(field,time),full=settings.quality==='standard',motion=settings.reduceMotion?0:age;
    if(radius>0){
      // The outer boundary uses the same live radius that controls poison hits.
      if(this.pool)this.stamp(this.pools,this.poolStamps,this.poolCount++,this.pool,field.x,field.y,radius*2,radius*2,0,fade);
      else {g.fillColor=color(80,120,51,45*fade);g.circle(X(field.x),Y(field.y),radius);g.fill();}
      const edges=full?8:5;
      for(let i=0;i<edges;i++){
        const a=i*turn/edges+.17,t=settings.reduceMotion?.35:(age/ELEMENTAL.poison.interval*.5+i*.381)%1;
        g.strokeColor=color(213,230,137,255*fade*(.65-.36*t));g.lineWidth=2.5;
        arc(g,field.x,field.y,radius*(.94+.045*t),a-.21,a+.14);g.stroke();
        if(full||i%2===0)this.bubble(g,field.x+Math.cos(a)*radius*.94,field.y+Math.sin(a)*radius*.94-8*t,4.2+3*t,fade);
      }
      const lobes=full?13:8;
      for(let i=0;i<lobes;i++){
        const a=i*2.4+.16+.09*Math.sin(i+motion*.45),lift=settings.reduceMotion?.35:(age*.38+i*.381)%1;
        const r=radius*Math.sqrt((i+.45)/lobes)*.89,x=field.x+Math.cos(a)*r,y=field.y+Math.sin(a)*r-lift*16;
        const width=Math.min(158,radius*.77)*(.92+.21*Math.sin(a+motion));
        if(this.vapor){
          const flip=i%2===0?1:-1,rotation=Math.sin(a)*.17;
          this.stamp(this.vapors,this.vaporStamps,this.vaporCount++,this.vapor,
            x+flip*Math.sin(rotation)*width*.12,y-Math.cos(rotation)*width*.12,width,width*.74,rotation*flip,
            fade*(.55+.18*Math.sin(lift*Math.PI)),flip);
        }else{
          g.fillColor=color(155,209,111,54*fade);g.ellipse(X(x),Y(y),width*.48,width*.32);g.fill();
          g.fillColor=color(199,238,144,35*fade);g.ellipse(X(x-width*.1),Y(y-width*.1),width*.3,width*.21);g.fill();
        }
        const detail=this.poisonDetails;
        this.bubble(detail,x+width*.26,y-width*.1-lift*13,3.3+((i+1)%3)*1.5,fade*.88);
        if(i%3===0){
          detail.strokeColor=color(215,233,155,161*fade);detail.lineWidth=1.7;
          detail.moveTo(X(x-width*.32),Y(y));detail.bezierCurveTo(X(x-width*.53),Y(y-14),X(x-width*.18),Y(y-width*.20),X(x-width*.36),Y(y-width*.28));detail.stroke();
          detail.fillColor=color(102,141,67,255*fade);detail.ellipse(X(x+width*.08),Y(y+width*.09),10.5,4.3);detail.fill();
          detail.fillColor=color(192,222,115,255*fade);detail.ellipse(X(x+width*.08-.4),Y(y+width*.09-.8),8.7,3.4);detail.fill();
        }
      }
    }
    this.setIcon(icon,field,field.x,field.y+5,50,.035*Math.sin(motion*2.3),fade*unit((age-.18)/.11));
    const steam=this.poisonSteam;
    for(let i=0;i<3;i++){
      const side=i===0?-1:1,w=10+i*5,alpha=fade*unit((age-.18)/.11);
      steam.strokeColor=i===1?color(217,245,141,191*alpha):color(148,204,105,191*alpha);
      steam.lineWidth=3.2-i*.55;steam.moveTo(X(field.x-4+i*3),Y(field.y-37));
      steam.bezierCurveTo(X(field.x+side*w),Y(field.y-52),X(field.x-side*w),Y(field.y-55),X(field.x+side*(w+4*Math.sin(motion+i))),Y(field.y-68-i*4));steam.stroke();
    }
  }

  private bubble(g:Graphics,x:number,y:number,r:number,alpha:number):void {
    g.fillColor=color(85,148,77,203*alpha);g.ellipse(X(x),Y(y),r,r*1.02);g.fill();
    g.fillColor=color(183,227,100,217*alpha);g.ellipse(X(x-r*.09),Y(y-r*.15),r*.79,r*.73);g.fill();
    g.fillColor=color(249,255,228,255*alpha);g.ellipse(X(x-r*.25),Y(y-r*.38),r*.29,r*.18);g.fill();
  }

  private frost(field:ElementalField,time:number,settings:DisplaySettings,icon:FieldIcon):void {
    const g=this.ground,age=time-field.bornAt,after=time-field.releaseAt,quiet=settings.reduceMotion;
    const radius=elementalVisualRadius(field,time),growth=ELEMENTAL.frost.growth;
    if(after<0&&radius>0){
      // Unlike the old per-enemy-only shell, the advancing boundary explicitly
      // shows the real freeze contact radius. It fades after growth completes.
      const edge=unit((growth+.38-age)/.38);
      if(edge>0){g.strokeColor=color(188,245,255,145*edge);g.lineWidth=quiet?2:3;
        arc(g,field.x,field.y,radius,0,turn);g.stroke();}
    }else if(after>=0){
      const progress=unit(after/ELEMENTAL.frost.fade),r=radius*(quiet?.96:.91+.09*progress);
      g.strokeColor=color(214,251,255,210*(1-progress));g.lineWidth=quiet?2:4*(1-progress)+1;
      arc(g,field.x,field.y,r,0,turn);g.stroke();
      const count=settings.quality==='simple'?8:14;
      for(let i=0;i<count;i++){
        const a=i*turn/count+.2,travel=quiet?.88:.80+.20*progress;
        this.shard(g,field.x+Math.cos(a)*radius*travel,field.y+Math.sin(a)*radius*travel,
          7+i%3*2,12+i%4*2,a+progress,1-progress);
      }
    }
    // DeliveryUseView is the single owner of the shaver and its curls, which
    // originate at the animated hand position. The field keeps only its range.
    icon.node.active=false;
  }

  private shard(g:Graphics,x:number,y:number,width:number,height:number,angle:number,opacity:number):void {
    const p=(a:number,b:number)=>local(x,y,angle,a,b);
    path(g,[p(0,0),p(-width*.5,-height*.28),p(-width*.33,-height*.78),p(width*.08,-height),p(width*.5,-height*.47),p(width*.38,-height*.16)],
      color(84,184,213,255*opacity),color(220,250,255,255*opacity),1.2);
    path(g,[p(0,-height*.1),p(-width*.33,-height*.78),p(width*.08,-height),p(width*.16,-height*.53)],color(188,242,252,255*opacity));
  }

  private iceLane(event:Extract<ImpactEvent,{type:'iceShards'}>,progress:number,settings:DisplaySettings):void {
    const g=this.foreground,quiet=settings.reduceMotion,advance=quiet?1:1-(1-Math.min(progress/.38,1))**3;
    const tip=event.reach*(.27+.73*advance),tail=quiet?4:Math.max(0,progress-.46)*event.reach*.66;
    const alpha=Math.min(1,(1-progress)/.44),p=(a:number,b:number)=>local(event.x,event.y-21,event.angle,a,b);
    path(g,[p(tail,-1),p(tip*.48,-12),p(tip*.76,-8),p(tip,-1),p(tip*.69,7),p(tip*.48,10),p(tail,2)],color(81,187,217,168*alpha));
    const pieces=[[.63,7,28,4],[.80,-7,28,4],[1,0,41,5.6],[.40,-6,15,2.9],[.52,5,15,2.9]],count=settings.quality==='simple'?3:pieces.length;
    for(let i=0;i<count;i++){
      const [position,offset,length,radius]=pieces[i],nose=tip*position,origin=p(nose,offset*advance);
      this.iceSliver(g,origin.x,origin.y,event.angle+offset*.009,Math.min(length,nose),radius,alpha);
    }
  }

  private iceSliver(g:Graphics,x:number,y:number,angle:number,length:number,radius:number,alpha:number):void {
    const p=(a:number,b:number)=>local(x,y,angle,a,b);
    path(g,[p(0,0),p(-length*.62,-radius),p(-length,-radius*.35),p(-length*.84,radius*.85),p(-length*.31,radius*.54)],
      color(112,211,233,255*alpha),color(36,87,115,255*alpha),2.2);
    path(g,[p(-length*.91,-radius*.36),p(-length*.62,-radius*.84),p(-2,0),p(-length*.64,radius*.14)],color(238,255,252,255*alpha));
  }

  private splitIce(event:Extract<ImpactEvent,{type:'frostShatter'}>,progress:number,settings:DisplaySettings):void {
    const g=this.foreground,t=settings.reduceMotion?.62:progress,opening=1-(1-Math.min(t/.86,1))**2;
    const height=enemyHeight(event.kind),scale=Math.min(1.32,height/58),angle=event.angle;
    const dx=Math.cos(angle),dy=Math.sin(angle),flip=dy>0?-1:1,nx=-dy*flip,ny=dx*flip;
    const variation=Math.sin(event.x*.071+event.y*.123),mid=height*.49,fall=t*t*8-Math.sin(t*Math.PI)*5;
    const baseY=event.y-mid+(mid-21)*opening*.85+fall,alpha=Math.min(1,(1-progress)/.44);
    for(const side of [-1,1]){
      const hand=side*height*.19*(1-opening*.69),scatter=side*(27+scale*12+variation*side*5)*opening;
      const carry=(4+variation*8*side)*opening,x=event.x+hand+nx*scatter+dx*carry,y=baseY+ny*scatter+dy*carry;
      const spin=side*(.14+opening*(.65+.42*variation*side)),sx=side*scale*(.88+variation*side*.10),sy=scale*(.9-variation*side*.12);
      const p=(a:number,b:number)=>local(x,y,spin,a*sx,b*sy);
      path(g,[p(-2,-21),p(11,-17),p(19,-4),p(16,8),p(7,17),p(-6,14),p(2,5),p(-4,1),p(3,-7),p(-3,-11)],
        color(162,232,243,168*alpha),color(55,107,128,223*alpha),2.4);
      path(g,[p(10,-14),p(17,-4),p(14,8),p(7,14),p(5,7)],color(69,147,187,168*alpha));
      path(g,[p(-1,-18),p(8,-15),p(4,-6)],color(239,255,252,232*alpha));
    }
    const count=settings.quality==='simple'||settings.reduceMotion?2:4;
    for(let i=0;i<count;i++){
      const side=i%2===0?-1:1,leading=i<2,scatter=side*(14+opening*((leading?40:22)+variation*5)),carry=(leading?12:-15)*(1+opening*.7);
      this.iceSliver(g,event.x+nx*scatter+dx*carry,baseY+ny*scatter+dy*carry,angle+side*(.7+opening*(1+variation*.44)),leading?12:8,leading?3.7:2.8,alpha);
    }
  }
}

// Remaining parity work: brine slice rotation, fine gradients/lighting and
// full enemy shell/poison decorations.
// Frost range ring is an explicit new visibility aid; compare it with the
// original before final visual acceptance.
