import {meleePose,WEAPONS} from '../domain/core/weapons';
import type {Vec,WeaponAttack,WeaponKind} from '../domain/shared/types';

/** Source-space weapon sizes and pose calculations shared by the Cocos rig. */
export const COURIER_WEAPON_WIDTH:Record<WeaponKind,number>={tongs:34,bag:26,chopsticks:31,spirit:23,knife:29,tray:27,umbrella:35,sword:43,lunchbox:26,talisman:24};
const upperArm=6.7,forearm=8.5;
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const blend=(a:Vec,b:Vec,t:number):Vec=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const angleBlend=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

/** Keep both palms on their grip points while moving the grip inside both arms' reach. */
export function fitTwoHandedGrip(right:Vec,left:Vec,shoulderR:Vec,shoulderL:Vec):void {
  const gripX=left.x-right.x,gripY=left.y-right.y;
  const halfX=(shoulderR.x-shoulderL.x+gripX)*.5,halfY=(shoulderR.y-shoulderL.y+gripY)*.5;
  const cx=shoulderR.x-halfX,cy=shoulderR.y-halfY,dx=right.x-cx,dy=right.y-cy,length=Math.hypot(dx,dy);
  if(length<.001)return;
  const projection=Math.abs(dx*halfX+dy*halfY)/length,reach=upperArm+forearm-.1;
  const distance=Math.sqrt(Math.max(0,reach*reach-halfX*halfX-halfY*halfY+projection*projection))-projection;
  const factor=clamp(distance/length);
  right.x=cx+dx*factor;right.y=cy+dy*factor;left.x=right.x+gripX;left.y=right.y+gripY;
}

export interface WeaponPoseInput {
  kind:WeaponKind;attack:WeaponAttack|null;time:number;heading:number;flip:number;
  upperX:number;chest:Vec;stepSwing:number;accent:number;effort:number;scale:number;
}
export interface WeaponPoseResult {
  right:Vec;left:Vec;angle:number;stretch:number;umbrellaSpread:number;
  phase:number;windup:boolean;active:boolean;recovering:boolean;twoHanded:boolean;
  /** Position of the visible melee tip, in rig-local coordinates. */
  releasePoint?:Vec;
}

/** Mirrors the original web rig's per-weapon windup, strike and recovery poses. */
export function courierWeaponPose(input:WeaponPoseInput):WeaponPoseResult {
  const {kind,attack,time,heading,flip,upperX,chest,stepSwing,accent,effort,scale}=input;
  const melee=attack?meleePose(attack,time):null,cfg=WEAPONS[kind];
  const windup=attack?.phase==='windup',active=attack?.phase==='active',recovering=attack?.phase==='recovery';
  const age=attack?Math.max(0,time-attack.releaseAt):0;
  const phase=attack?(windup?clamp((time-attack.startedAt)/(attack.releaseAt-attack.startedAt||1)):
    active?clamp(age/cfg.active):clamp((time-attack.releaseAt-cfg.active)/Math.max(.001,attack.endsAt-attack.releaseAt-cfg.active))):0;
  const settle=recovering?1-smooth(phase):1;
  const twoHanded=['bag','chopsticks','lunchbox','talisman','sword','umbrella'].includes(kind);
  const arms=stepSwing*(twoHanded?1.4:4.2)*accent,carryTongs=kind==='tongs';
  const idleRight={x:upperX+(twoHanded?9:14)-arms,y:chest.y+(twoHanded?1:5)+arms*.36};
  const idleLeft={x:upperX+(twoHanded?-1:-9)+arms,y:chest.y+(twoHanded?5:3)-arms*.50};
  const idleAngle=twoHanded?.06:carryTongs?.49+stepSwing*.12:.48;
  let right={...idleRight},left={...idleLeft},angle=idleAngle,stretch=1,umbrellaSpread=0,releasePoint:Vec|undefined;
  if(attack){
    const actualAngle=melee?.angle??heading,aim={x:Math.cos(actualAngle)*flip,y:Math.sin(actualAngle)};
    const direction=Math.atan2(aim.y,aim.x),pull=windup?smooth(phase):0;
    const point=(reach:number,up=0):Vec=>({x:chest.x+aim.x*reach,y:chest.y+aim.y*reach+up});
    const cast=windup?pull:settle;
    if(melee){
      const drive=active?smooth(phase/.28):1,reach=windup?lerp(11,8,pull):lerp(8,18,drive);
      right=point(reach,windup?-6*pull:lerp(-6,10,drive));
      if(!windup&&kind!=='umbrella'){
        releasePoint={x:aim.x*melee.reach/scale,y:(aim.y*melee.reach-28)/scale};
        right=blend(right,{x:releasePoint.x-aim.x*COURIER_WEAPON_WIDTH[kind],y:releasePoint.y-aim.y*COURIER_WEAPON_WIDTH[kind]},drive);
        if(carryTongs)right.x+=10*Math.max(0,aim.y)**3*drive;
      }
      left=twoHanded?{x:right.x-6,y:right.y+4}:{x:upperX-8-aim.x*6*effort+arms,y:chest.y+4-aim.y*4*effort-arms*.47};
      angle=kind==='umbrella'?direction+.32:direction;
      if(kind==='umbrella')umbrellaSpread=windup?smooth((phase-.55)/.45):active?1:1-smooth((phase-.20)/.45);
    }else switch(kind){
      case 'bag':right=point(windup?13:17,-1);left={x:right.x-10,y:right.y+4};stretch=windup?1+.14*pull:1-.23*(1-smooth(phase))*settle;angle=direction;break;
      case 'chopsticks':right=point(windup?9:20);left=point(windup?16:11,4);angle=direction+.16;break;
      case 'spirit':right=point(windup?11:16,-5*cast);left={x:right.x-9,y:right.y+7};angle=windup?-.23*pull:angleBlend(0,direction+Math.PI/2,.65)*settle;break;
      case 'tray':right=point(windup?lerp(10,-9,pull):22,windup?-pull*7:0);left={x:upperX-10,y:chest.y+7};angle=direction;break;
      case 'lunchbox':right=point(windup?10:18,windup?pull*3:-6);left={x:right.x-8,y:right.y+6};angle=windup?.23*pull:-.30*settle;break;
      case 'talisman':right=point(windup?9:21,-5*cast);left=point(4,1);angle=windup?-.23:direction*.27;break;
    }
    if(windup){right=blend(idleRight,right,smooth(phase));left=blend(idleLeft,left,smooth(phase));}
    if(recovering){right=blend(idleRight,right,settle);left=blend(idleLeft,left,settle);}
    if(!active)angle=angleBlend(idleAngle,angle,windup?smooth(phase):settle);
  }
  return {right,left,angle,stretch,umbrellaSpread,phase,windup:!!windup,active:!!active,recovering:!!recovering,twoHanded,releasePoint};
}
