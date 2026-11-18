import type {Player, Settings, Vec, WeaponKind, WeaponState} from '../shared/types';
import {meleePose, WEAPONS} from '../core/weapons';
import {CONFIG} from '../core/config';
import type {Assets} from './assets';
import {HeldBlades} from './held-weapon';
import {CourierGait} from './courier-gait';
import {drawSprite} from './sprite';

type Point=Vec;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const blend=(a:Point,b:Point,t:number):Point=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const angleBlend=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const widths:Record<WeaponKind,number>={tongs:34,bag:26,chopsticks:31,spirit:23,knife:29,tray:27,umbrella:35,sword:43,lunchbox:26,talisman:24};

export class CourierRig {
  private gait=new CourierGait();
  private flip=1;
  private back=false;
  private previousFacing={flip:1,back:false};
  private turnMix=1;
  private look:Point={x:1,y:0};
  private effort=0;
  private crouch=0;
  private packSwing=0;
  private blades:HeldBlades;
  launch:{id:number;point:Point}|null=null;
  bagPoint:Vec|null=null;
  supplyHand:Vec|null=null;

  constructor(private assets:Assets){this.blades=new HeldBlades(assets);}
  reset():void {
    this.gait.reset();this.flip=1;this.back=false;this.previousFacing={flip:1,back:false};
    this.look={x:1,y:0};this.turnMix=1;this.effort=0;this.crouch=0;this.packSwing=0;this.launch=null;this.bagPoint=null;this.supplyHand=null;
  }

  draw(ctx:CanvasRenderingContext2D,p:Player,weapon:WeaponState,time:number,dt:number,settings:Settings,scale=1,dead=false,trayInFlight=false,skillUseAge=Infinity):void {
    const step=clamp(dt,0,.1),speed=Math.hypot(p.vx,p.vy);
    const dash=!dead&&(p.dashUntil??0)>time;
    this.gait.update(p,dead?0:step,scale,dash);
    const attack=dead?null:weapon.attack,kind=weapon.kind;
    const melee=attack?meleePose(attack,time):null;
    const cfg=WEAPONS[kind];
    const windup=attack?.phase==='windup',active=attack?.phase==='active',recovering=attack?.phase==='recovery';
    const age=attack?Math.max(0,time-attack.releaseAt):0;
    const phase=attack?(windup?clamp((time-attack.startedAt)/(attack.releaseAt-attack.startedAt||1)):
      active?clamp(age/cfg.active):clamp((time-attack.releaseAt-cfg.active)/Math.max(.001,attack.endsAt-attack.releaseAt-cfg.active))):0;
    const settle=recovering?1-smooth(phase):1;
    const heading=attack?.angle??Math.atan2(p.moveDirection.y,p.moveDirection.x);
    const hx=Math.cos(heading),hy=Math.sin(heading);
    const moving=speed>20;
    const lookX=moving?p.vx/speed:hx,lookY=moving?p.vy/speed:hy;
    const turn=1-Math.exp(-step/.049);
    this.look=blend(this.look,{x:lookX,y:lookY},turn);
    const oldFlip=this.flip,oldBack=this.back;
    if(Math.abs(this.look.x)>.22)this.flip=this.look.x<0?-1:1;
    if(this.look.y<-.50)this.back=true;else if(this.look.y>-.27)this.back=false;
    if(this.back!==oldBack||this.flip!==oldFlip){
      this.previousFacing={flip:oldFlip,back:oldBack};this.turnMix=0;
    }
    this.turnMix=Math.min(1,this.turnMix+step/.095);
    const flip=this.flip,back=this.back;
    const accent=settings.reduceMotion?.24:1;
    const running=dead?0:this.gait.drive;
    const lifted=(foot:typeof this.gait.right)=>({
      x:(foot.x-p.x)*flip/scale,y:(foot.y-p.y)/scale-foot.lift*(settings.reduceMotion?.68:1),
      pitch:foot.pitch*accent,lift:foot.lift,
    });
    const footR=lifted(flip===1?this.gait.right:this.gait.left);
    const footL=lifted(flip===1?this.gait.left:this.gait.right);
    const delayedX=this.gait.velocity.x/CONFIG.player.speed*flip,delayedY=this.gait.velocity.y/CONFIG.player.speed;
    const turnLean=clamp(p.vx/CONFIG.player.speed*flip-delayedX,-1,1);
    const shift=this.gait.weight*flip*accent;
    const hipRoll=shift*.115;
    const stepSwing=clamp(((footR.x-footL.x)-11)/30 * this.look.x*flip+
      (footR.y-footL.y+footR.lift-footL.lift)*this.look.y/28,-1,1)*running;
    const cue=windup?-smooth(phase):active?1-smooth(phase)*.24:recovering?.76*settle:0;
    this.effort=lerp(this.effort,cue,1-Math.exp(-step/.032));
    const effort=this.effort;
    const heavy=kind==='sword'||kind==='umbrella'||kind==='lunchbox';
    const lean=effort*(heavy?5.5:3.7);
    const hipX=shift*2.5;
    const upperX=hipX*.55+clamp(delayedX*(dash?7:5.6)+turnLean*4,-10,10)*accent+hx*flip*lean;
    const hurt=!dead&&time-p.hurtAt<.1?1-clamp((time-p.hurtAt)/.1):0;
    const bounce=(dead?17:0)+(dash?3:0)+this.gait.rise*accent+hurt*.6+
      (settings.reduceMotion?0:Math.sin(time*2.6)*.45)+hy*lean*.5+(windup&&heavy?2.1*phase:0);
    // In this top-down projection a planted foot can trail toward the camera on a
    // sharp turn. Lower the pelvis over the extended leg while the other foot lands.
    const minHipY=(foot:typeof footR,side:1|-1)=>{
      const dx=foot.x-(side===1?1:0)-(side*5+hipX);
      const verticalReach=Math.sqrt(Math.max(0,29*29-dx*dx));
      return foot.y-5+28-side*hipRoll*5-verticalReach;
    };
    const neededDrop=Math.max(0,Math.max(minHipY(footR,1),minHipY(footL,-1))-bounce);
    this.crouch=Math.max(neededDrop,lerp(this.crouch,neededDrop,1-Math.exp(-step/.065)));
    const bodyY=dead?bounce:bounce+this.crouch;
    const chest:Point={x:upperX,y:-44+bodyY+delayedY*running*1.3*accent};
    const sweepTurn=melee?Math.sin(melee.angle-heading)*(windup?smooth(phase):settle):0;
    const shoulderRoll=-hipRoll*.8+(stepSwing*.045+sweepTurn*(heavy?.17:.11))*accent;
    const shoulderR={x:upperX+8,y:chest.y-6+shoulderRoll*8},shoulderL={x:upperX-8,y:chest.y-6-shoulderRoll*8};
    const twoHanded=['bag','chopsticks','lunchbox','talisman','sword','umbrella'].includes(kind);
    const arms=stepSwing*(twoHanded?1.7:6.5)*accent;
    const idleRight={x:upperX+14-arms,y:(twoHanded?-40:-32)+bodyY+arms*.28};
    const idleLeft={x:upperX+(twoHanded?1:-10)+arms,y:(twoHanded?-36:-31)+bodyY-arms*.47};
    const idleAngle=twoHanded?.06:.48;
    let right={...idleRight},left={...idleLeft},toolAngle=idleAngle,stretch=1,umbrellaSpread=0;
    let releasePoint:Point|undefined;
    if(attack){
      const actualAngle=melee?.angle??heading;
      const aim={x:Math.cos(actualAngle)*flip,y:Math.sin(actualAngle)};
      const angle=Math.atan2(aim.y,aim.x);
      const pull=windup?smooth(phase):0;
      const point=(reach:number,up=0):Point=>({x:chest.x+aim.x*reach,y:chest.y+aim.y*reach+up});
      const cast=windup?pull:settle;
      if(melee){
        // The windup draws the grip behind the shoulder. During the cut the
        // arm lowers toward the release plane while following the strike angle.
        const drive=active?smooth(phase/.28):1;
        const reach=windup?lerp(13,11,pull):lerp(11,23,drive);
        right=point(reach,windup?-6*pull:lerp(-6,10,drive));
        if(!windup&&kind!=='umbrella'){
          releasePoint={x:aim.x*melee.reach/scale,y:(aim.y*melee.reach-28)/scale};
          right=blend(right,{x:releasePoint.x-aim.x*widths[kind],y:releasePoint.y-aim.y*widths[kind]},drive);
        }
        left=twoHanded?{x:right.x-6,y:right.y+4}:{x:upperX-8-aim.x*5*effort+arms,y:-34+bodyY-aim.y*4*effort-arms*.47};
        toolAngle=kind==='umbrella'?angle+.32:angle;
        if(kind==='umbrella'){
          umbrellaSpread=windup?smooth((phase-.55)/.45):active?1:1-smooth((phase-.20)/.45);
        }
      }else {
        switch(kind){
          case 'bag':
            right=point(windup?13:17,-1);left={x:right.x-10,y:right.y+4};
            stretch=windup?1+.14*pull:1-.23*(1-smooth(phase))*settle;toolAngle=angle;break;
          case 'chopsticks':
            right=point(windup?9:20);left=point(windup?16:11,4);toolAngle=angle+.16;break;
          case 'spirit':
            right=point(windup?11:16,-5*cast);left={x:right.x-9,y:right.y+7};
            toolAngle=windup?-.23*pull:angleBlend(0,angle+Math.PI/2,.65)*settle;break;
          case 'tray':
            right=point(windup?lerp(10,-9,pull):22,windup?-pull*7:0);
            left={x:upperX-10,y:-32+bodyY};toolAngle=angle;break;
          case 'lunchbox':
            right=point(windup?10:18,windup?pull*3:-6);left={x:right.x-8,y:right.y+6};
            toolAngle=windup?.23*pull:-.30*settle;break;
          case 'talisman':
            right=point(windup?9:21,-5*cast);left=point(4,1);toolAngle=windup?-.23:angle*.27;break;
        }
      }
      if(windup){right=blend(idleRight,right,smooth(phase));left=blend(idleLeft,left,smooth(phase));}
      if(recovering){right=blend(idleRight,right,settle);left=blend(idleLeft,left,settle);}
      if(!active)toolAngle=angleBlend(idleAngle,toolAngle,windup?smooth(phase):settle);
    }
    // The loaded box swings from its strap and settles after a turn.
    const packTarget=(stepSwing*.115+turnLean*.18+(dash?-.19:0))*accent;
    this.packSwing=lerp(this.packSwing,packTarget,1-Math.exp(-step/.074));
    const backWeight=lerp(Number(this.previousFacing.back),Number(back),smooth(this.turnMix));
    const packX=upperX*.54+lerp(-13,-4,backWeight)+this.packSwing*7;
    const packY=-26.5+bodyY*.83-Math.abs(this.packSwing)*5;
    const tilt=shoulderRoll*.48+this.packSwing;
    const packHeight=lerp(22,24,backWeight),packWidth=lerp(24,27,backWeight);
    const handleY=-packHeight*.91;
    const handle={x:packX-Math.sin(tilt)*handleY,y:packY+Math.cos(tilt)*handleY};
    this.bagPoint={x:p.x+flip*scale*handle.x,y:p.y+scale*handle.y};

    const take=dead?0:smooth(skillUseAge/.10)*(1-smooth((skillUseAge-.60)/.18));
    const lid=dead?0:smooth(skillUseAge/.085)*(1-smooth((skillUseAge-.22)/.14));
    if(take>0){
      // Keep the prop on the free side, clear of the weapon and the face. This hand
      // briefly leaves the shaft on two-handed weapons; the striking hand still leads.
      const lift=smooth((skillUseAge-.12)/.21);
      const held={x:shoulderL.x-14,y:shoulderL.y-7+3*smooth((skillUseAge-.30)/.18)};
      left=blend(left,blend(handle,held,lift),take);
    }
    if(dead){right={x:20,y:-17};left={x:-20,y:-17};toolAngle=1.1;footR.x=17;footL.x=-16;footR.y=0;footL.y=0;}
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale*flip,scale);
    if(!dead&&p.invulnerableUntil>time)ctx.globalAlpha*=settings.reduceMotion?.84:.81+Math.sin(time*12)*.05;
    const hipR={x:5+hipX,y:-28+bodyY+hipRoll*5},hipL={x:-5+hipX,y:-28+bodyY-hipRoll*5};
    const rightInFront=(footR.y+footR.lift)>(footL.y+footL.lift);
    const kneeFacing=.65+Math.abs(this.look.x)*.35;
    this.leg(ctx,rightInFront?hipL:hipR,rightInFront?footL:footR,rightInFront?'L':'R',dead,kneeFacing);
    this.leg(ctx,rightInFront?hipR:hipL,rightInFront?footR:footL,rightInFront?'R':'L',dead,kneeFacing);
    this.bodyPart(ctx,'rigHipFront','rigHipBack',hipX,-24+bodyY,12,hipRoll,21);
    if(take===0)this.arm(ctx,shoulderL,left,'L',-1);
    const drawPack=()=>{
      this.bodyPart(ctx,'rigBagSide','rigBag',packX,packY,packHeight,tilt,packWidth);
      if(lid>.01)this.openLid(ctx,packX,packY,tilt,packWidth,packHeight,lid);
    };
    if(!back)drawPack();
    this.bodyPart(ctx,'rigTorsoFront','rigTorsoBack',upperX*.70,-30+bodyY,25-hurt*.8,dead?-.08:upperX*.023+shoulderRoll,23);
    if(back)drawPack();
    if(take>0)this.arm(ctx,shoulderL,left,'L',-1);
    // arm() clamps its target to the actual wrist through two-bone IK.
    this.supplyHand={x:p.x+flip*scale*left.x,y:p.y+scale*left.y};
    this.arm(ctx,shoulderR,right,'R',1);
    if(active&&releasePoint){
      const wristAngle=Math.atan2(releasePoint.y-right.y,releasePoint.x-right.x);
      const adjust=Math.atan2(Math.sin(wristAngle-toolAngle),Math.cos(wristAngle-toolAngle));
      toolAngle+=clamp(adjust,-.34,.34)*smooth(phase/.16)*smooth((1-phase)/.14);
    }
    const drawTool=()=>{
      if(kind==='tongs'||kind==='knife'||kind==='sword'){
        const jaws=windup?.045*smooth(phase):active?.04-.064*smooth(phase):0;
        this.blades.draw(ctx,kind,right,toolAngle,widths[kind],jaws);
      }else if(kind==='umbrella'&&umbrellaSpread>0){
        const alpha=ctx.globalAlpha;
        if(umbrellaSpread<1){
          ctx.globalAlpha=alpha*(1-umbrellaSpread);
          this.tool(ctx,'umbrella',right,toolAngle,widths.umbrella,1);
        }
        ctx.globalAlpha=alpha*umbrellaSpread;
        this.tool(ctx,'umbrellaOpen',right,toolAngle+1.78,lerp(40,51,umbrellaSpread),lerp(.50,1,umbrellaSpread));
        ctx.globalAlpha=alpha;
      }else if(kind!=='tray'||!trayInFlight){
        this.tool(ctx,kind,right,toolAngle,widths[kind],stretch);
      }
    };
    const toolBehindHead=melee?Math.sin(toolAngle)<-.12:back;
    if(toolBehindHead)drawTool();
    this.bodyPart(ctx,'rigHeadFront','rigHeadBack',upperX-2,-52+bodyY*.84,35,dead?-.19:shoulderRoll*.38+upperX*.009,43);
    if(!toolBehindHead)drawTool();
    if(attack&&active&&!melee&&this.launch?.id!==attack.id){
      this.launch={id:attack.id,point:{x:p.x+flip*right.x*scale+hx*10,y:p.y+right.y*scale+hy*10}};
    }
    ctx.restore();
  }
  private openLid(ctx:CanvasRenderingContext2D,x:number,y:number,tilt:number,width:number,height:number,open:number):void {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.translate(0,-height*.75);
    const edge=width*.40,lift=height*.35*open;
    ctx.globalAlpha*=open;ctx.lineJoin='round';ctx.lineWidth=1;ctx.strokeStyle='#345052';
    ctx.beginPath();ctx.moveTo(-edge,-2);ctx.lineTo(edge*.8,-4);ctx.lineTo(edge,0);ctx.lineTo(-edge*.85,2);ctx.closePath();
    ctx.fillStyle='#414544';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-edge,-2);ctx.lineTo(-edge-1,-2-lift);
    ctx.quadraticCurveTo(0,-5-lift,edge*.77,-4-lift*.84);ctx.lineTo(edge*.8,-4);ctx.closePath();
    ctx.fillStyle='#c4d1bd';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-edge+1,-2-lift);ctx.lineTo(edge*.72,-4-lift*.84);
    ctx.strokeStyle='#267b73';ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
  }
  private bodyPart(ctx:CanvasRenderingContext2D,front:string,back:string,x:number,y:number,height:number,angle:number,width:number):void {
    if(this.turnMix<1){
      const opacity=ctx.globalAlpha,mix=smooth(this.turnMix);
      ctx.globalAlpha=opacity*(1-mix);
      drawSprite(ctx,this.assets,this.previousFacing.back?back:front,x,y,height,angle,this.previousFacing.flip*this.flip,1,width);
      ctx.globalAlpha=opacity*mix;
      this.part(ctx,this.back?back:front,x,y,height,angle,1,width);
      ctx.globalAlpha=opacity;
    }else this.part(ctx,this.back?back:front,x,y,height,angle,1,width);
  }
  private part(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,height:number,angle=0,anchorY=1,width?:number):void {drawSprite(ctx,this.assets,name,x,y,height,angle,1,anchorY,width);}
  private arm(ctx:CanvasRenderingContext2D,shoulder:Point,desired:Point,side:'L'|'R',bend:number):void {
    const upper=11.5,fore=12.5,dx=desired.x-shoulder.x,dy=desired.y-shoulder.y,d=Math.max(.1,Math.min(upper+fore-.1,Math.hypot(dx,dy))),angle=Math.atan2(dy,dx);
    const elbowAngle=angle+bend*Math.acos(clamp((upper*upper+d*d-fore*fore)/(2*upper*d),-1,1));
    const elbow={x:shoulder.x+Math.cos(elbowAngle)*upper,y:shoulder.y+Math.sin(elbowAngle)*upper},wrist={x:shoulder.x+Math.cos(angle)*d,y:shoulder.y+Math.sin(angle)*d};
    this.part(ctx,side==='R'?'rigUpperR':'rigUpperL',shoulder.x,shoulder.y,upper+2,elbowAngle-Math.PI/2,.06,7.8);
    this.part(ctx,side==='R'?'rigForeR':'rigForeL',elbow.x,elbow.y,fore+2,Math.atan2(wrist.y-elbow.y,wrist.x-elbow.x)-Math.PI/2,.1,7.8);
    desired.x=wrist.x;desired.y=wrist.y;
  }
  private leg(ctx:CanvasRenderingContext2D,hip:Point,foot:Point&{pitch:number;lift:number},side:'L'|'R',dead:boolean,kneeFacing:number):void {
    const ankle={x:foot.x-(side==='R'?1:0),y:foot.y-5};
    const dx=ankle.x-hip.x,dy=ankle.y-hip.y,d=Math.max(.1,Math.hypot(dx,dy));
    // Two projected bones keep their length while the swing knee leads the ankle.
    const bone=Math.max(13.1,d*.501),bend=Math.min(11,Math.sqrt(Math.max(0,bone*bone-d*d*.25)))*kneeFacing;
    const knee={x:(hip.x+ankle.x)*.5+dy/d*bend,y:(hip.y+ankle.y)*.5-dx/d*bend};
    this.part(ctx,'rigThigh',hip.x,hip.y,Math.hypot(knee.x-hip.x,knee.y-hip.y)+3,Math.atan2(knee.y-hip.y,knee.x-hip.x)-Math.PI/2,.07,7.5);
    this.part(ctx,'rigShin',knee.x,knee.y,Math.hypot(ankle.x-knee.x,ankle.y-knee.y)+2,Math.atan2(ankle.y-knee.y,ankle.x-knee.x)-Math.PI/2,.09,6.2);
    this.part(ctx,side==='R'?'rigShoeR':'rigShoeL',foot.x,foot.y,8,dead?(side==='R'?.15:-.15):foot.pitch,1,12);
  }
  private tool(ctx:CanvasRenderingContext2D,name:string,hand:Point,angle:number,width:number,stretch:number):void {
    const sprite=this.assets.sprites[name];if(!sprite)return;
    const upright=['spirit','lunchbox','talisman','bag','umbrellaOpen'].includes(name),height=width*sprite.height/sprite.width;
    const gripX=upright?.5:.2,gripY=upright?.8:.7;
    ctx.save();ctx.translate(hand.x,hand.y);ctx.rotate(angle);ctx.scale(stretch,1);
    drawSprite(ctx,this.assets,name,width*(.5-gripX),height*(1-gripY),height,0,1,1,width);ctx.restore();
  }
}

