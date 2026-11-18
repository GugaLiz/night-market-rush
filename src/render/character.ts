import type {Player,Settings,WeaponKind,WeaponState} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';
type Point={x:number;y:number};
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const blend=(a:Point,b:Point,t:number):Point=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const widths:Record<WeaponKind,number>={tongs:34,bag:23,chopsticks:29,spirit:21,knife:29,tray:26,umbrella:35,sword:43,lunchbox:24,talisman:22};
/** Jointed courier. Travel controls feet; weapon logic time controls upper-body acting. */
export class CourierRig {
  private phase=0;private moving=0;private previous:Point|null=null;private lookBack=false;
  private lastAttackId=-1;private trayRelease=-100;
  constructor(private assets:Assets){}
  reset():void {this.phase=0;this.moving=0;this.previous=null;this.lookBack=false;this.lastAttackId=-1;this.trayRelease=-100;}
  draw(ctx:CanvasRenderingContext2D,p:Player,weapon:WeaponState,time:number,dt:number,settings:Settings,scale=1,dead=false):void {
    const speed=Math.hypot(p.vx,p.vy),step=Math.max(0,Math.min(.1,dt));
    const distance=this.previous?Math.hypot(p.x-this.previous.x,p.y-this.previous.y):0;this.previous={x:p.x,y:p.y};
    if(!dead&&step>0&&distance<40)this.phase+=distance*Math.PI*2/100;
    const actualSpeed=step>0&&distance<40?distance/step:0;
    const target=!dead&&actualSpeed>4?clamp(actualSpeed/170):0;
    this.moving=lerp(this.moving,target,1-Math.exp(-step/(target>this.moving?.075:.095)));
    if(dead)this.moving=0;if(speed>8)this.lookBack=p.vy<-Math.abs(p.vx)*.5;
    const attack=dead?null:weapon.attack;
    let flip=p.facing<0?-1:1;if(attack&&Math.abs(Math.cos(attack.angle))>.28)flip=Math.cos(attack.angle)<0?-1:1;
    const back=attack?Math.sin(attack.angle)<-.6:this.lookBack;
    const breath=settings.reduceMotion?0:Math.sin(time*2.6)*.45,gait=Math.sin(this.phase),opposite=-gait;
    const bob=settings.reduceMotion?0:-Math.abs(gait)*1.1*this.moving,hurt=!dead&&time-p.hurtAt<.1?1-clamp((time-p.hurtAt)/.1):0;
    const bodyY=(dead?17:0)+breath+bob+hurt*.6,chest:Point={x:0,y:-44+bodyY};
    const shoulderR:Point={x:8,y:-50+bodyY},shoulderL:Point={x:-8,y:-50+bodyY};
    let right:Point={x:14,y:-31+bodyY},left:Point={x:-10,y:-31+bodyY};
    let toolAngle=.55,toolName:string=weapon.kind,stretch=1;
    if(['bag','chopsticks','lunchbox','talisman'].includes(weapon.kind)){right={x:13,y:-40+bodyY};left={x:1,y:-38+bodyY};toolAngle=.1;}
    else if(weapon.kind==='spirit'){right={x:15,y:-35+bodyY};left={x:4,y:-34+bodyY};toolAngle=0;}
    else if(weapon.kind==='tray'){right={x:19,y:-37+bodyY};left={x:-8,y:-32+bodyY};toolAngle=.1;}
    else if(weapon.kind==='sword'){right={x:14,y:-35+bodyY};left={x:4,y:-32+bodyY};toolAngle=.75;}
    const idleRight={...right},idleLeft={...left},idleAngle=toolAngle;
    if(!attack&&!dead){const swing=gait*this.moving*2.3;right.y+=swing;left.y-=swing;toolAngle+=swing*.014;}
    if(attack){
      const windup=attack.phase==='windup',recovery=attack.phase==='recovery';
      const progress=windup?clamp((time-attack.startedAt)/Math.max(.001,attack.releaseAt-attack.startedAt)):recovery?clamp((time-(attack.endsAt-.16))/.16):clamp((time-attack.releaseAt)/Math.max(.001,attack.endsAt-attack.releaseAt));
      const aim={x:Math.cos(attack.angle)*flip,y:Math.sin(attack.angle)},angle=Math.atan2(aim.y,aim.x);
      const point=(d:number,up=0):Point=>({x:chest.x+aim.x*d,y:chest.y+aim.y*d+up});toolAngle=angle+.35;
      const motion=recovery?1:progress;
      switch(weapon.kind){
        case 'tongs':right=point(windup?lerp(11,5,motion):lerp(23,19,motion));left={x:-6,y:-36+bodyY};break;
        case 'bag':{const c=point(windup?10:15);right={x:c.x+5,y:c.y+3};left={x:c.x-7,y:c.y+2};stretch=windup?1.08:lerp(.78,1,motion);toolAngle=angle;break;}
        case 'chopsticks':right=point(windup?12:19);left=point(8,5);toolAngle=angle;break;
        case 'spirit':right=point(windup?12:18,windup?-motion*5:-5);left={x:right.x-8,y:right.y+6};toolAngle=windup?-.2:angle*.3;break;
        case 'knife':case 'sword':{const heavy=weapon.kind==='sword',sweep=windup?lerp(.2,heavy?-1.3:-1.05,motion):lerp(heavy?-1.3:-1.05,heavy?.65:1.05,motion),a=angle+sweep;right={x:chest.x+Math.cos(a)*(heavy?18:20),y:chest.y+Math.sin(a)*(heavy?18:20)};left=heavy?{x:right.x-6,y:right.y+5}:{x:-9,y:-35+bodyY};toolAngle=a+.35;break;}
        case 'tray':right=point(windup?lerp(5,-10,motion):21);left={x:-9,y:-34+bodyY};toolAngle=angle;if(attack.phase==='active'&&this.lastAttackId!==attack.id){this.lastAttackId=attack.id;this.trayRelease=time;}break;
        case 'umbrella':right=point(windup?12:19);left=point(7,6);toolName=attack.phase==='active'&&!attack.blocked?'umbrellaOpen':'umbrella';toolAngle=angle+(toolName==='umbrellaOpen'?Math.PI/2:.35);break;
        case 'lunchbox':right=point(windup?10:18,windup?motion*2:-7);left={x:right.x-7,y:right.y+5};toolAngle=angle*.5;break;
        case 'talisman':right=point(windup?12:20,windup?-3:-5);left={x:5,y:-39+bodyY};toolAngle=windup?-.2:angle*.25;break;
      }
      if(recovery){right=blend(right,idleRight,progress);left=blend(left,idleLeft,progress);toolAngle=lerp(toolAngle,idleAngle,progress);}
    }
    if(dead){right={x:20,y:-17};left={x:-20,y:-17};toolAngle=1.1;}
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale*flip,scale);
    if(!dead&&p.invulnerableUntil>time)ctx.globalAlpha*=settings.reduceMotion?.84:.81+Math.sin(time*12)*.05;
    const stride=6.8*this.moving,walkSign=Math.abs(p.vx)>speed*.25?Math.sign(p.vx)*flip:1;
    const footR={x:6+gait*stride*walkSign,y:-Math.max(0,gait)*4.5*this.moving},footL={x:-6+opposite*stride*walkSign,y:-Math.max(0,opposite)*4.5*this.moving};
    if(dead){footR.x=17;footL.x=-16;footR.y=0;footL.y=0;}
    const hipR={x:5,y:-28+bodyY},hipL={x:-5,y:-28+bodyY};
    this.leg(ctx,back?hipR:hipL,back?footR:footL,back?'R':'L',dead);this.leg(ctx,back?hipL:hipR,back?footL:footR,back?'L':'R',dead);
    this.part(ctx,back?'rigHipBack':'rigHipFront',0,-24+bodyY,12,0,1,21);this.arm(ctx,shoulderL,left,'L',-1);
    this.part(ctx,'rigBag',-12,-29+bodyY,19,Math.sin(this.phase+.4)*this.moving*.06,1,21);
    this.part(ctx,back?'rigTorsoBack':'rigTorsoFront',0,-30+bodyY,25-hurt*.8,dead?-.08:0,1,23);this.arm(ctx,shoulderR,right,'R',1);
    // Source heads contain ponytails; do not duplicate the spare rigTail.
    this.part(ctx,back?'rigHeadBack':'rigHeadFront',-2,-52+bodyY,35,dead?-.19:gait*this.moving*.018,1,43);
    if(!(weapon.kind==='tray'&&time-this.trayRelease<.9))this.tool(ctx,toolName,right,toolAngle,toolName==='umbrellaOpen'?47:widths[weapon.kind],stretch);
    ctx.restore();
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
  private leg(ctx:CanvasRenderingContext2D,hip:Point,foot:Point,side:'L'|'R',dead:boolean):void {
    const ankle={x:foot.x-(side==='R'?1:0),y:foot.y-5},knee={x:lerp(hip.x,ankle.x,.53)+(dead?(side==='R'?7:-7):Math.max(0,-foot.y)*.7),y:lerp(hip.y,ankle.y,.52)};
    this.part(ctx,'rigThigh',hip.x,hip.y,Math.hypot(knee.x-hip.x,knee.y-hip.y)+3,Math.atan2(knee.y-hip.y,knee.x-hip.x)-Math.PI/2,.07,7.5);
    this.part(ctx,'rigShin',knee.x,knee.y,Math.hypot(ankle.x-knee.x,ankle.y-knee.y)+2,Math.atan2(ankle.y-knee.y,ankle.x-knee.x)-Math.PI/2,.09,6.2);
    this.part(ctx,side==='R'?'rigShoeR':'rigShoeL',foot.x+2.5,foot.y,8,dead?(side==='R'?.15:-.15):0,1,12);
  }
  private tool(ctx:CanvasRenderingContext2D,name:string,hand:Point,angle:number,width:number,stretch:number):void {
    const sprite=this.assets.sprites[name];if(!sprite)return;
    const upright=['spirit','lunchbox','talisman','bag','umbrellaOpen'].includes(name),height=width*sprite.height/sprite.width;
    const gripX=upright?.5:.2,gripY=upright?.8:.7;
    ctx.save();ctx.translate(hand.x,hand.y);ctx.rotate(angle);ctx.scale(stretch,1);
    drawSprite(ctx,this.assets,name,width*(.5-gripX),height*(1-gripY),height,0,1,1,width);ctx.restore();
  }
}

