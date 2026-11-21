import {isUltimate, type ElementalField, type GameEvent, type Vec} from '../domain/shared/types';

export type SkillUse=Extract<GameEvent,{type:'skill'}>;
export const USE_LIFETIME=1.35;
const unit=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=unit(n);return t*t*(3-2*t);};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

/** Angular ramp shared by the carried and placed fan; radians in Web Y-down space. */
export function fanRotorAngle(age:number):number {
  const t=Math.max(0,age),ramp=.22,spinUp=Math.min(ramp,t);
  return 3*t+14*(spinUp*spinUp/(2*ramp)+Math.max(0,t-ramp));
}

export interface IceShaving {side:number;dx:number;dy:number;angle:number;scale:number;alpha:number;blue:boolean}
/** Curled shavings emitted by a shaver, in its current world-space position. */
export function iceShavings(age:number,quiet:boolean,simple:boolean):IceShaving[] {
  if(age<.22)return [];
  const result:IceShaving[]=[];
  for(let i=0;i<(simple?6:10);i++){
    const side=i%2===0?-1:1,start=.22+(i%3)*.12,t=quiet?.70:unit((age-start)/.76);
    if(t<=0||t>=1)continue;
    const reach=27+(i*17)%58,rise=18+(i*31)%53;
    result.push({side,dx:side*(8+t*reach),dy:t*t*(rise+10)-2*t*rise,
      angle:Math.atan2(2*t*(rise+10)-2*rise,reach)+i*.39,
      scale:.73+i%4*.13,alpha:quiet?.92*ease((age-.22)/.13):ease(t/.17)*ease((1-t)/.36),blue:i%3===0});
  }
  return result;
}

export interface DeliveryPose extends Vec {height:number;alpha:number;angle:number;labelAlpha:number;collect:number;start:Vec}
export type PickupShell=
  | {kind:'burst';center:Vec;radius:number;progress:number;alpha:number}
  | {kind:'fan';center:Vec;angle:number;scaleX:number;scaleY:number;alpha:number;drawArcs:boolean;close:number;closeAlpha:number};

/** Shape/timing of the original pickup shell and fan's bag clasp. */
export function pickupShell(use:SkillUse,time:number,bag:Vec,quiet:boolean):PickupShell|null {
  if(!use.pickupFrom)return null;
  const age=Math.max(0,time-use.time),source={x:use.pickupFrom.x+2,y:use.pickupFrom.y-39};
  if(use.kind==='fan'){
    if(age>=.22)return null;
    const gather=ease(age/.10);
    return {kind:'fan',center:quiet?source:{x:lerp(source.x,bag.x,gather),y:lerp(source.y,bag.y,gather)},
      angle:Math.atan2(bag.y-source.y,bag.x-source.x),scaleX:quiet?1:1-.74*gather,scaleY:quiet?1:1-.90*gather,
      alpha:1-gather*.9,drawArcs:age<.10,close:quiet?1:ease((age-.035)/.04),closeAlpha:ease((.22-age)/.08)};
  }
  if(quiet||age>=.16)return null;
  const progress=unit(age/.16),radius=(isUltimate(use.kind)?39:35)*(1+progress*.22);
  return {kind:'burst',center:{x:source.x-2,y:source.y},radius,progress,alpha:.75*(1-progress)};
}

/** Replicates the Web prop path without affecting the game state. */
export function deliveryUsePose(use:SkillUse,time:number,bag:Vec,hand:Vec,quiet:boolean,
  image:{width:number;height:number},field?:ElementalField):DeliveryPose|null {
  const age=Math.max(0,time-use.time);if(age>=USE_LIFETIME)return null;
  const side=use.facing.x<0?-1:1;
  const ground=['fan','skate','cones','lure','route','supply'].includes(use.kind);
  const end=use.kind==='fan'?{x:use.x-36,y:use.y+7}:ground?{x:use.x+side*21,y:use.y-6}:hand;
  const start=use.pickupFrom?{x:use.pickupFrom.x+2,y:use.pickupFrom.y-39}:bag;
  const collect=ease(age/.10),grip=ease((age-.08)/.09);
  const useTool=use.kind==='fan'?ease((age-.07)/.11):ease((age-.17)/.21);
  const heldX=lerp(lerp(start.x,bag.x,collect),hand.x,grip);
  const heldY=lerp(lerp(start.y,bag.y,collect),hand.y-4,grip);
  let x=ground?lerp(heldX,end.x,useTool):heldX;
  let y=ground?lerp(heldY,end.y,useTool)-(quiet?0:Math.sin(useTool*Math.PI)*12):heldY;
  const shaver=field?.kind==='frost';
  if(field&&(!quiet||shaver)){
    const toss=quiet?1:ease((age-.16)/.13);
    x=lerp(heldX,field.x-(shaver?side*50:0),toss);
    y=lerp(heldY,field.y-(shaver?24:12),toss)-Math.sin(toss*Math.PI)*24;
  }
  const fade=ease((USE_LIFETIME-age)/.32);
  let alpha=unit((.90-age)/.24);
  if(shaver)alpha=fade;
  else if(field)alpha=unit((.29-age)/.11);
  else if(isUltimate(use.kind))alpha=unit((.15-age)/.06);
  else if(use.kind==='fan')alpha=quiet||age>=.18?0:1;
  let angle=0;
  if(!quiet){
    if(use.kind==='soda')angle=-side*(.12+1.58*useTool*(1-ease((age-.62)/.17)));
    else if(use.kind==='bell')angle=side*Math.sin(age*38)*.36*(1-ease((age-.32)/.4));
    else angle=side*Math.sin(useTool*Math.PI)*.28;
  }else if(use.kind==='soda')angle=-side*1.28*useTool;
  const h=shaver?55:use.kind==='fan'?40:use.kind==='soda'?37:33;
  const heldHeight=Math.min(h,(h+10)*image.height/image.width);
  const groundHeight=1.32*Math.min(use.kind==='fan'?45:39,(use.kind==='fan'?55:49)*image.height/image.width);
  return {x,y,height:use.pickupFrom?lerp(groundHeight,heldHeight,collect):heldHeight,
    alpha,angle,labelAlpha:ease(age/.12)*fade,collect,start};
}
