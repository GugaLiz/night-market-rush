import {Node, Sprite, UITransform, UIOpacity} from 'cc';
import {CourierGait, type GaitPlayer, type Vec} from './courier-gait';
import {SpriteAtlas} from './sprite-atlas';
import {meleePose,WEAPONS} from '../domain/core/weapons';
import type {WeaponAttack,WeaponKind} from '../domain/shared/types';
import {COURIER_WEAPON_WIDTH as widths,courierWeaponPose,fitTwoHandedGrip} from './courier-weapon-pose';
import {HeldTongs} from './held-tongs';
import {tongsJawAngle} from './held-tongs-geometry';
import type {StrikeAnchor} from './weapon-release-model';

type Side = 'L' | 'R';
export interface CourierPlayer extends GaitPlayer {hurtAt:number; invulnerableUntil:number; dashUntil?:number}
export interface CourierPose {
  player:CourierPlayer;
  weapon:{kind:WeaponKind; attack:WeaponAttack|null};
  time:number;
  /** Presentation elapsed time; pass zero while paused. */
  dt:number;
  reduceMotion:boolean;
  dead?:boolean;
  trayInFlight?:boolean;
  /** Seconds since the last skill pickup; omitted when no pickup is active. */
  skillUseAge?:number;
  /** Must match the simulation's configured movement speed. */
  playerSpeed:number;
}
interface Part {node:Node; transform:UITransform; sprite:Sprite; image:string}
interface Foot extends Vec {lift:number; pitch:number; yaw:number}
interface Shoe {name:string; width:number; height:number; cuffX:number; cuffY:number}

const scale = 1.35;
const upperArm = 6.7, forearm = 8.5, legReach = 23;
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const blend=(a:Vec,b:Vec,t:number):Vec=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const degrees=(radians:number)=>-radians*180/Math.PI;
const shoes:Record<'side'|'front'|'rear'|'rearSide',Shoe>={
  side:{name:'rigShoeR',width:14,height:8.9,cuffX:.31,cuffY:.27},
  front:{name:'rigShoeToe',width:10,height:9.8,cuffX:.50,cuffY:.19},
  rear:{name:'rigShoeHeel',width:10,height:9.4,cuffX:.50,cuffY:.19},
  rearSide:{name:'rigShoeHeelSide',width:12.5,height:8.9,cuffX:.40,cuffY:.24},
};
function shoeView(yaw:number):Shoe {
  const y=Math.sin(yaw);
  if(y<-.50)return Math.abs(Math.cos(yaw))<.41?shoes.rear:shoes.rearSide;
  return y>.80?shoes.front:shoes.side;
}

/**
 * A migration-stage articulated courier made from the original sprite atlas.
 * Parent must be a UI node under a 1280x720, centre-origin, Y-up world root.
 * Gameplay uses its own unmodified state; only this presentation is animated.
 * This is not yet visually identical to the old CourierRig: see limitations below.
 */
export class CourierView {
  readonly node:Node;
  private readonly opacity:UIOpacity;
  private readonly gait=new CourierGait();
  private readonly parts:Record<string,Part>={};
  private readonly tongs:HeldTongs;
  private look:Vec={x:1,y:0};
  private flip=1;
  private back=false;
  private effort=0;
  /** Captured in simulation coordinates at release and stable while shots fly. */
  launch:{id:number;point:Vec}|null=null;
  strike:StrikeAnchor|null=null;
  /** Live world-space centre of the held tray, used to catch returning discs. */
  trayCatch:Vec|null=null;
  supplyHand:Vec|null=null;
  bagPoint:Vec|null=null;
  lidOpen=0;
  /** Backpack bottom anchor and local-to-world transform in simulation coordinates (Y down). */
  bagPose:{x:number;y:number;tilt:number;width:number;height:number;flip:number;scale:number}|null=null;

  constructor(parent:Node, private readonly atlas:SpriteAtlas) {
    this.node=new Node('Courier');
    this.node.layer=parent.layer;
    this.node.addComponent(UITransform);
    this.opacity=this.node.addComponent(UIOpacity);
    parent.addChild(this.node);
    for(const name of ['shinL','thighL','shoeL','shinR','thighR','shoeR',
      'hip','pack','torso','upperL','foreL','upperR','foreR','tool','toolOpen','head']){
      this.parts[name]=this.createPart(name);
    }
    this.tongs=new HeldTongs(this.node,this.atlas.require('tongs'),widths.tongs);
  }

  reset():void {this.gait.reset();this.look={x:1,y:0};this.flip=1;this.back=false;this.effort=0;this.launch=null;this.strike=null;this.trayCatch=null;this.supplyHand=null;this.bagPoint=null;this.lidOpen=0;this.bagPose=null;}
  destroy():void {this.node.destroy();}

  update(pose:CourierPose):void {
    const {player:p,weapon,time,reduceMotion}=pose;
    const dead=pose.dead===true, step=clamp(pose.dt,0,.1);
    if(!(pose.playerSpeed>0))throw new Error('CourierView requires a positive playerSpeed');
    const dash=!dead&&(p.dashUntil??0)>time;
    this.gait.update(p,dead?0:step,scale,dash,pose.playerSpeed);
    const speed=Math.hypot(p.vx,p.vy), attack=dead?null:weapon.attack;
    const heading=attack?.angle??Math.atan2(p.moveDirection.y,p.moveDirection.x);
    const lookX=speed>20?p.vx/speed:attack?Math.cos(heading):this.look.x;
    const lookY=speed>20?p.vy/speed:attack?Math.sin(heading):this.look.y;
    this.look=blend(this.look,{x:lookX,y:lookY},1-Math.exp(-step/.049));
    if(Math.abs(this.look.x)>.22)this.flip=this.look.x<0?-1:1;
    if(this.look.y<-.50)this.back=true;else if(this.look.y>-.27)this.back=false;
    const flip=this.flip, accent=reduceMotion?.24:1, running=dead?0:this.gait.drive;
    const depth=Math.abs(this.look.y), profile=running*Math.abs(this.look.x);
    const liftFoot=(foot:Foot)=>({
      x:(foot.x-p.x)*flip/scale,
      y:(foot.y-p.y)/scale-foot.lift*(1-.40*depth)*(reduceMotion?.68:1),
      lift:foot.lift*(1-.40*depth)*(reduceMotion?.68:1),
      pitch:foot.pitch*accent, forward:Math.cos(foot.yaw)*flip, shoe:shoeView(foot.yaw),
    });
    const footR=liftFoot(flip===1?this.gait.right:this.gait.left);
    const footL=liftFoot(flip===1?this.gait.left:this.gait.right);
    const shift=this.gait.weight*flip*accent, hipWidth=7-profile*2.4, hipRoll=shift*.105;
    const hurtAge=time-p.hurtAt;
    const hurt=dead||hurtAge<0?0:smooth(hurtAge/.035)*(1-smooth((hurtAge-.055)/.28));
    const hx=Math.cos(heading), hy=Math.sin(heading),cfg=WEAPONS[weapon.kind];
    const windup=attack?.phase==='windup',active=attack?.phase==='active',recovering=attack?.phase==='recovery';
    const age=attack?Math.max(0,time-attack.releaseAt):0;
    const phase=attack?(windup?clamp((time-attack.startedAt)/(attack.releaseAt-attack.startedAt||1)):
      active?clamp(age/cfg.active):clamp((time-attack.releaseAt-cfg.active)/Math.max(.001,attack.endsAt-attack.releaseAt-cfg.active))):0;
    const settle=recovering?1-smooth(phase):1;
    const cue=windup?-smooth(phase):active?1-smooth(phase)*.24:recovering?.76*settle:0;
    this.effort=lerp(this.effort,cue,1-Math.exp(-step/.032));
    const heavy=weapon.kind==='sword'||weapon.kind==='umbrella'||weapon.kind==='lunchbox';
    const lean=this.effort*(heavy?5.5:3.7);
    const hipX=shift*(2.8+1.1*depth)+(1-running)*(.8+hx*flip*this.effort*1.35);
    const delayedX=this.gait.velocity.x/pose.playerSpeed*flip,delayedY=this.gait.velocity.y/pose.playerSpeed;
    const turnLean=clamp(p.vx/pose.playerSpeed*flip-delayedX,-1,1);
    const upperX=hipX*.55+clamp(delayedX*(dash?7:5.6)+turnLean*4,-10,10)*accent+hx*flip*lean-hurt*3*accent;
    const bodyY=dead?17:lerp(.5,1.8,running)+(dash?3:0)+this.gait.rise*accent+hurt*.6+
      hy*lean*lerp(.19,.45,running)+(windup&&heavy?1.2*phase:0);
    const breath=dead||reduceMotion?0:Math.sin(time*2.45)*.44*(1-running);
    const stepSwing=clamp(((footR.x-footL.x)-(13.5-4*profile))/25*this.look.x*flip+
      (footR.y-footL.y+footR.lift-footL.lift)*this.look.y/23,-1,1)*running;
    const melee=attack?meleePose(attack,time):null;
    const sweepTurn=melee?Math.sin(melee.angle-heading)*(windup?smooth(phase):settle):0;
    const shoulderRoll=-hipRoll*.72+(stepSwing*.08+sweepTurn*(heavy?.20:.15))*accent;
    const chest={x:upperX,y:-25.7+bodyY+breath+delayedY*running*1.1*accent};
    const shoulderWidth=11.2-profile*1.6;
    const shoulderR={x:upperX+shoulderWidth,y:chest.y-4+shoulderRoll*shoulderWidth};
    const shoulderL={x:upperX-shoulderWidth,y:chest.y-4-shoulderRoll*shoulderWidth};
    const grip=courierWeaponPose({kind:weapon.kind,attack,time,heading,flip,upperX,chest,stepSwing,accent,effort:this.effort,scale});
    let {right,left,angle:toolAngle}=grip;
    const packX=upperX*.54+(this.back?-2:-16),packY=-12.5+bodyY*.83;
    const packHeight=this.back?22:20,packTilt=shoulderRoll*.48,handleY=-packHeight*.91;
    const handle={x:packX-Math.sin(packTilt)*handleY,y:packY+Math.cos(packTilt)*handleY};
    const skillAge=pose.skillUseAge??Infinity;
    const take=dead?0:smooth(skillAge/.10)*(1-smooth((skillAge-.60)/.18));
    this.lidOpen=dead?0:smooth(skillAge/.085)*(1-smooth((skillAge-.22)/.14));
    if(take>0){
      const lift=smooth((skillAge-.12)/.21),held={x:shoulderL.x-14,y:shoulderL.y-7+3*smooth((skillAge-.30)/.18)};
      left=blend(left,blend(handle,held,lift),take);
    }
    // Injury and the brief supply reach share the free hand, as in the web rig.
    const guard=hurt*(1-take);
    if(guard>0&&!dead){
      left=blend(left,{x:shoulderL.x-11,y:shoulderL.y-17},guard);
      if(!attack){right=blend(right,handle,guard*.82);toolAngle+=Math.atan2(Math.sin(.76-toolAngle),Math.cos(.76-toolAngle))*guard;}
    }
    if(dead){right={x:16,y:-10};left={x:-16,y:-10};footR.x=13;footL.x=-12;footR.y=0;footL.y=0;toolAngle=1.1;}
    else if(grip.twoHanded&&take===0&&guard===0)fitTwoHandedGrip(right,left,shoulderR,shoulderL);
    this.bagPoint={x:p.x+flip*scale*handle.x,y:p.y+scale*handle.y};
    this.bagPose={x:p.x+flip*scale*packX,y:p.y+scale*packY,tilt:packTilt,width:this.back?28:24,height:packHeight,flip,scale};

    this.node.setPosition(p.x-640,360-p.y,0);
    this.node.setScale(scale*flip,scale,1);
    this.opacity.opacity=(!dead&&p.invulnerableUntil>time)?Math.round(255*(reduceMotion?.84:.81+Math.sin(time*12)*.05)):255;
    const hipR={x:hipWidth+hipX,y:-16+bodyY+hipRoll*hipWidth};
    const hipL={x:-hipWidth+hipX,y:-16+bodyY-hipRoll*hipWidth};
    this.leg('L',hipL,footL,dead);this.leg('R',hipR,footR,dead);
    this.part('hip',this.back?'rigHipBack':'rigHipFront',hipX,-10.2+bodyY,28-profile*2,10,hipRoll,1);
    this.part('pack',this.back?'rigBag':'rigBagSide',packX,packY,this.back?28:24,this.back?22:20,shoulderRoll*.48,1);
    this.part('torso',this.back?'rigTorsoBack':'rigTorsoFront',upperX*.70,-11.5+bodyY+breath,36.5,24-hurt*1.2,dead?-.08:upperX*.019+shoulderRoll,1);
    this.arm('L',shoulderL,left,-1);this.arm('R',shoulderR,right,1);
    if(active&&grip.releasePoint){
      const wristAngle=Math.atan2(grip.releasePoint.y-right.y,grip.releasePoint.x-right.x);
      const adjustment=Math.atan2(Math.sin(wristAngle-toolAngle),Math.cos(wristAngle-toolAngle));
      toolAngle+=clamp(adjustment,-.34,.34)*smooth(phase/.16)*smooth((1-phase)/.14);
    }
    this.supplyHand={x:p.x+flip*scale*left.x,y:p.y+scale*left.y};
    const equipmentPoint=(x:number,y:number):Vec=>({
      x:p.x+flip*scale*(right.x+x*Math.cos(toolAngle)-y*Math.sin(toolAngle)),
      y:p.y+scale*(right.y+x*Math.sin(toolAngle)+y*Math.cos(toolAngle)),
    });
    if(weapon.kind==='tray'){
      const tray=this.atlas.size('tray');
      this.trayCatch=equipmentPoint(widths.tray*.30,-widths.tray*tray.height/tray.width*.20);
    }else this.trayCatch=null;
    this.strike=null;
    if(attack?.phase==='active'&&time>=attack.releaseAt&&melee){
      const reach=weapon.kind==='umbrella'?24:widths[weapon.kind];
      this.strike={id:attack.id,point:equipmentPoint(reach,0),
        angle:Math.atan2(Math.sin(toolAngle),flip*Math.cos(toolAngle)),progress:phase};
    }
    if(attack?.phase==='active'&&time>=attack.releaseAt&&!melee&&this.launch?.id!==attack.id){
      let point=this.trayCatch??{x:p.x+flip*right.x*scale+hx*10,y:p.y+right.y*scale+hy*10};
      if(weapon.kind==='bag'){
        const bag=this.atlas.size('bag'),dx=widths.bag*.24,dy=-widths.bag*bag.height/bag.width*.65;
        point=equipmentPoint(grip.stretch*(dx*Math.cos(1.33)-dy*Math.sin(1.33)),dx*Math.sin(1.33)+dy*Math.cos(1.33));
      }
      this.launch={id:attack.id,point};
    }
    const face=hurt>.16?'rigHeadHurt':attack&&Math.abs(this.effort)>.42?'rigHeadStrike':'rigHeadFront';
    this.part('head',this.back?'rigHeadBack':face,upperX*.80-1.1-hurt*1.8,-30+bodyY*.75+breath*.65,
      64,59,dead?-.19:shoulderRoll*.30+upperX*.007-hurt*.15*accent,1);
    this.drawTool(weapon.kind,right,toolAngle,pose.trayInFlight===true&&attack?.phase!=='windup',grip.stretch,grip.umbrellaSpread,tongsJawAngle(attack?.phase??null,grip.phase));
    // Explicit ordering keeps the backpack behind the torso when facing front,
    // and in front of it when facing away. Shoes nearer the camera draw last.
    const legs=footR.y+footR.lift>footL.y+footL.lift?['shinL','thighL','shoeL','shinR','thighR','shoeR']:
      ['shinR','thighR','shoeR','shinL','thighL','shoeL'];
    const upper=this.back?['torso','pack']:['pack','torso'];
    const toolBehind=melee?Math.sin(toolAngle)<-.12:this.back;
    const order=[...legs,'hip',...upper,'upperL','foreL','upperR',
      ...(toolBehind?['tool','toolTongs','toolOpen','foreR','head']:['head','tool','toolTongs','toolOpen','foreR'])];
    order.forEach((name,index)=>(name==='toolTongs'?this.tongs.node:this.parts[name].node).setSiblingIndex(index));
  }

  private createPart(name:string):Part {
    const node=new Node(name);node.layer=this.node.layer;
    const transform=node.addComponent(UITransform),sprite=node.addComponent(Sprite);
    sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    this.node.addChild(node);
    return {node,transform,sprite,image:''};
  }

  /** Parameters match drawSprite's source-space coordinates and vertical anchor. */
  private part(key:string,image:string,x:number,y:number,width:number,height:number,angle=0,anchorY=1):void {
    const part=this.parts[key];
    if(part.image!==image){part.sprite.spriteFrame=this.atlas.require(image);part.image=image;}
    part.transform.setContentSize(width,height);
    part.transform.setAnchorPoint(.5,1-anchorY);
    part.node.setPosition(x,-y,0);
    part.node.setRotationFromEuler(0,0,degrees(angle));
    part.node.active=true;
  }

  private arm(side:Side,shoulder:Vec,desired:Vec,bend:number):void {
    const dx=desired.x-shoulder.x,dy=desired.y-shoulder.y;
    const d=clamp(Math.hypot(dx,dy),forearm-upperArm+.01,upperArm+forearm-.1),angle=Math.atan2(dy,dx);
    const elbowAngle=angle+bend*Math.acos(clamp((upperArm*upperArm+d*d-forearm*forearm)/(2*upperArm*d),-1,1));
    const elbow={x:shoulder.x+Math.cos(elbowAngle)*upperArm,y:shoulder.y+Math.sin(elbowAngle)*upperArm};
    const wrist={x:shoulder.x+Math.cos(angle)*d,y:shoulder.y+Math.sin(angle)*d};
    this.part('upper'+side,'rigUpper'+side,shoulder.x,shoulder.y,12,upperArm+3.8,elbowAngle-Math.PI/2,.16);
    this.part('fore'+side,'rigFore'+side,elbow.x,elbow.y,11.4,forearm+4.8,Math.atan2(wrist.y-elbow.y,wrist.x-elbow.x)-Math.PI/2,.12);
    desired.x=wrist.x;desired.y=wrist.y;
  }

  private leg(side:Side,hip:Vec,foot:{x:number;y:number;pitch:number;lift:number;forward:number;shoe:Shoe},dead:boolean):void {
    const shoe=foot.shoe,toe=foot.forward<0?-1:1;
    const pitch=dead?(side==='R'?.15:-.15):foot.pitch*lerp(.18,.85,Math.abs(foot.forward));
    const pivot=((pitch>0?.82:.17)-shoe.cuffX)*shoe.width,sole=(1-shoe.cuffY)*shoe.height;
    const ankle={x:foot.x+toe*(pivot*(1-Math.cos(pitch))+sole*Math.sin(pitch)),
      y:foot.y-pivot*Math.sin(pitch)-sole*Math.cos(pitch)};
    const dx=ankle.x-hip.x,dy=ankle.y-hip.y,d=Math.max(.1,Math.hypot(dx,dy));
    const fold=Math.sqrt(Math.max(0,(legReach*.5)**2-d*d*.25));
    const bend=Math.min(dead?11:lerp(1.7,8,clamp(foot.lift/6)),fold)*foot.forward;
    const knee={x:lerp(hip.x,ankle.x,.5)+dy/d*bend,y:lerp(hip.y,ankle.y,.5)-dx/d*bend};
    const calf=Math.hypot(ankle.x-knee.x,ankle.y-knee.y),thigh=Math.hypot(knee.x-hip.x,knee.y-hip.y);
    this.part('shin'+side,'rigShin',knee.x,knee.y,10.5,calf+3.9,Math.atan2(ankle.y-knee.y,ankle.x-knee.x)-Math.PI/2,2.4/(calf+3.9));
    this.part('thigh'+side,'rigThigh',hip.x,hip.y,13.4,thigh+4.4,Math.atan2(knee.y-hip.y,knee.x-hip.x)-Math.PI/2,2.4/(thigh+4.4));
    const image=shoe===shoes.side&&side==='L'?'rigShoeL':shoe.name;
    this.part('shoe'+side,image,ankle.x+toe*shoe.width*(.5-shoe.cuffX),ankle.y,shoe.width,shoe.height,pitch,shoe.cuffY);
    this.parts['shoe'+side].node.setScale(toe,1,1);
  }

  private drawTool(kind:WeaponKind,hand:Vec,angle:number,hidden:boolean,stretch:number,umbrellaSpread:number,jaws:number):void {
    const part=this.parts.tool,open=this.parts.toolOpen;
    open.node.active=false;this.tongs.hide();
    if(hidden&&kind==='tray'){part.node.active=false;return;}
    if(kind==='tongs'&&jaws!==0){part.node.active=false;this.tongs.show(hand,angle,jaws);return;}
    const size=this.atlas.size(kind);
    const landmarks={tongs:{grip:{x:.16,y:.83},tip:{x:.78,y:.15}},knife:{grip:{x:.11,y:.76},tip:{x:.98,y:.11}},sword:{grip:{x:.13,y:.63},tip:{x:.97,y:.09}}} as const;
    if(kind==='tongs'||kind==='knife'||kind==='sword'){
      const {grip,tip}=landmarks[kind],dx=(tip.x-grip.x)*size.width,dy=(tip.y-grip.y)*size.height;
      const factor=widths[kind]/Math.hypot(dx,dy);
      this.part('tool',kind,hand.x,hand.y,size.width*factor,size.height*factor,angle-Math.atan2(dy,dx),grip.y);
      part.transform.setAnchorPoint(grip.x,1-grip.y);part.node.setScale(1,1,1);
      const alpha=part.node.getComponent(UIOpacity)??part.node.addComponent(UIOpacity);alpha.opacity=255;
      return;
    }
    const width=widths[kind],height=width*size.height/size.width;
    const upright=['spirit','lunchbox','talisman','bag'].includes(kind);
    const gripX=upright?.5:.2,gripY=upright?.8:.7,rotation=angle+(kind==='bag'?1.33:0);
    this.part('tool',kind,hand.x,hand.y,width,height,rotation,gripY);
    part.transform.setAnchorPoint(gripX,1-gripY);part.node.setScale(stretch,1,1);
    const opacity=part.node.getComponent(UIOpacity)??part.node.addComponent(UIOpacity);
    opacity.opacity=Math.round(255*(kind==='umbrella'?1-umbrellaSpread:1));
    if(kind==='umbrella'&&umbrellaSpread>0){
      const opened=this.atlas.size('umbrellaOpen'),openWidth=lerp(40,51,umbrellaSpread),openHeight=openWidth*opened.height/opened.width;
      this.part('toolOpen','umbrellaOpen',hand.x,hand.y,openWidth,openHeight,angle+1.78,.8);
      open.transform.setAnchorPoint(.5,.2);open.node.setScale(lerp(.5,1,umbrellaSpread),1,1);
      const alpha=open.node.getComponent(UIOpacity)??open.node.addComponent(UIOpacity);alpha.opacity=Math.round(255*umbrellaSpread);
    }
  }

}

// Current gaps versus src/render/character.ts: supply-box lid and upgrade
// patch, injury hand pose, weapon launch/catch positions, shoe clipping, turning
// blend, floor shadow/marker and dash ghosts. These must be migrated and visually
// compared before claiming full parity.
