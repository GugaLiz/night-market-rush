import {clamp} from '../core/geometry';
import {pickupReach} from '../core/config';
import {isUltimate, SKILL_NAMES, type ElementalField, type GameEvent, type Pickup, type SkillKind, type Vec} from '../shared/types';
import {SKILL_GUIDE} from '../ui/catalog';
import {drawSprite} from './sprite';
import type {Assets} from './assets';

type Use = Extract<GameEvent, {type:'skill'}>;
const tau = Math.PI*2;
const ink = '#563c36';
const trim: Record<SkillKind,string> = {
  fan:'#df8841', soda:'#479b87', skate:'#bd5b46', lure:'#a76536', bubble:'#5993a1',
  cones:'#bc6239', bell:'#b38a38', route:'#438479', hook:'#487986', heat:'#b35d39',
  dispatch:'#566d81', stamp:'#b44b42', supply:'#798650', health:'#b74c51',
  icebox:'#428eb3',steamer:'#c58a41',express:'#319080',berry:'#b63565',
  vortex:'#9b5ee1',poison:'#6b9d34',frost:'#3985b7',
};
const unit = (x:number) => clamp(x,0,1);
const ease = (x:number) => {const t=unit(x);return t*t*(3-2*t);};
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;
const pickupScale=1.32;
const groundIconY=-39;
const groundIconHeight=(kind:SkillKind,width:number,height:number)=>
  pickupScale*Math.min(kind==='fan'?45:39,(kind==='fan'?55:49)*height/width);
const shellRadius=(kind:SkillKind)=>kind==='fan'||isUltimate(kind)?39:35;

/** A short cream stitch on the side the rider is approaching marks the pickup threshold. */
export function drawPickupReach(c:CanvasRenderingContext2D, item:Vec, player:Vec, radius:number):void {
  const dx=player.x-item.x,dy=player.y-item.y;
  const proximity=unit(1-(Math.hypot(dx,dy)-radius)/44);
  if(!proximity)return;
  const angle=Math.atan2(dy,dx);
  c.save();c.globalAlpha*=proximity*.85;c.lineCap='round';
  c.beginPath();c.arc(item.x,item.y,radius,angle-.22,angle+.22);
  c.strokeStyle=ink;c.lineWidth=3.5;c.stroke();
  c.strokeStyle='#ffeab5';c.lineWidth=1.7;c.stroke();c.restore();
}

/** Only the nearest available order gets a prompt, including when choosing from a supply box. */
export function nearestPickupHint(items:Pickup[],player:Vec,time:number,needsHealth=true):Pickup|undefined {
  let closest:Pickup|undefined;
  let nearest=Infinity;
  for(const p of items){
    if(p.kind==='health'&&!needsHealth)continue;
    if(p.retiringUntil||(p.disabledUntil??0)>time||(p.readyAt??0)>time||(p.expiresAt??Infinity)<=time)continue;
    const distance=Math.hypot(p.x-player.x,p.y-player.y);
    if(distance<nearest&&distance<=pickupReach(p)+145){closest=p;nearest=distance;}
  }
  return closest;
}

/** A translucent mint shell keeps the actual tool visible through its centre. */
function drawSkillShell(c:CanvasRenderingContext2D,r:number):void {
  const fill=c.createRadialGradient(-r*.22,-r*.32,r*.15,0,0,r);
  fill.addColorStop(0,'#f0ffe546');fill.addColorStop(.66,'#b9f8cd68');
  fill.addColorStop(.91,'#54ccabb8');fill.addColorStop(1,'#1c817c');
  c.fillStyle=fill;c.strokeStyle='#205d60';c.lineWidth=2.6;
  c.beginPath();c.arc(0,0,r,0,tau);c.fill();c.stroke();
  c.strokeStyle='#a0f6dc';c.lineWidth=2.2;
  c.beginPath();c.arc(0,0,r-1.6,0,tau);c.stroke();
  c.lineCap='round';c.lineWidth=4;c.strokeStyle='#f5ffdf';
  c.beginPath();c.arc(0,0,r-4,3.68,4.35);c.stroke();
  c.lineWidth=2;c.strokeStyle='#9befcf';
  c.beginPath();c.arc(0,0,r-4,.17,1.0);c.stroke();
}

function drawSkillBadge(c:CanvasRenderingContext2D,r:number,healing:boolean):void {
  c.save();c.translate(-r*.62,r*.73);
  c.fillStyle=healing?'#a43d4b':'#207771';c.strokeStyle=healing?'#ffebe3':'#c4ffe0';c.lineWidth=1.7;
  c.beginPath();c.arc(0,0,10,0,tau);c.fill();c.stroke();
  c.beginPath();
  if(healing){
    c.fillStyle='#fff1e4';c.moveTo(0,6);
    c.bezierCurveTo(-10,-1,-6,-9,0,-4);c.bezierCurveTo(6,-9,10,-1,0,6);
  }else{
    c.fillStyle='#fff1a1';c.moveTo(1,-7);c.lineTo(-5.5,1.3);c.lineTo(-.8,1.3);
    c.lineTo(-2,7.3);c.lineTo(5.8,-1.8);c.lineTo(1.1,-1.8);
  }
  c.closePath();c.fill();
  c.restore();
}

/** A short wake points back along the flight path without covering the tool. */
function drawSkillWake(c:CanvasRenderingContext2D,r:number,vx:number,vy:number):void {
  const speed=Math.hypot(vx,vy);
  if(speed<2)return;
  const reach=Math.min(28,speed*.19);
  c.save();c.rotate(Math.atan2(vy,vx));
  for(const side of [-1,1]){
    const tail=-r-reach*(side<0?1:.68);
    c.fillStyle=side<0?'#75e2c2b5':'#d7ffe5b8';c.beginPath();
    c.moveTo(-r*.75,side*r*.49);
    c.quadraticCurveTo(-r-4,side*r*.46,tail,side*r*.30);
    c.quadraticCurveTo(-r,side*r*.29,-r*.79,side*r*.32);
    c.closePath();c.fill();
  }
  c.fillStyle='#c8ffe0db';c.beginPath();c.ellipse(-r-reach-4,-r*.29,3.4,2.2,0,0,tau);c.fill();
  c.restore();
}

/** All loose skills travel in the same bubble, with a ground shadow marking contact position. */
export function drawDeliveryPickup(c:CanvasRenderingContext2D, assets:Assets, pickup:Pickup, player:Vec, time:number, quiet:boolean, needsHealth=true,supplyOrigin?:Vec):void {
  const p=pickup,r=shellRadius(p.kind);
  const reach=pickupReach(p);
  if(p.groupId&&supplyOrigin){
    const progress=quiet?1:ease((time-p.bornAt)/Math.max(.01,(p.readyAt??p.bornAt)-p.bornAt));
    c.save();
    c.translate(lerp(supplyOrigin.x,p.x,progress),lerp(supplyOrigin.y,p.y,progress)-Math.sin(progress*Math.PI)*32);
    c.globalAlpha=p.retiringUntil?unit((p.retiringUntil-time)/.4):Math.min(1,progress*3);
    const label=p.kind==='fan'?'清怪':p.kind==='bubble'?'护身':'冰封';
    const color=p.kind==='fan'?'#a44e28':p.kind==='bubble'?'#347660':'#3d7199';
    c.fillStyle='#5b3c2e';c.beginPath();c.ellipse(0,0,33,10,0,0,tau);c.fill();
    c.fillStyle='#f3d9a9';c.beginPath();c.ellipse(0,-4,33,10,0,0,tau);c.fill();
    drawSprite(c,assets,p.kind,0,-7,48);
    c.fillStyle=color;c.strokeStyle='#ffe5bc';c.lineWidth=1.8;
    c.beginPath();c.roundRect(-21,0,42,19,4);c.fill();c.stroke();
    c.fillStyle='#fff3dd';c.textAlign='center';c.textBaseline='middle';c.font='bold 14px "Microsoft YaHei",sans-serif';c.fillText(label,0,9);
    c.restore();return;
  }
  const near = quiet ? 0 : ease(1-(Math.hypot(p.x-player.x,p.y-player.y)-reach)/44);
  const loose = quiet ? 0 : Math.sin(time*3.5+p.id)*1.9;
  if(!p.retiringUntil&&(p.disabledUntil??0)<=time&&(p.readyAt??0)<=time&&(p.kind!=='health'||needsHealth))drawPickupReach(c,p,player,reach);
  c.save();c.translate(p.x,p.y);
  if((p.disabledUntil??0)>time || (p.readyAt??0)>time)c.globalAlpha=.46;
  if(p.retiringUntil)c.globalAlpha*=unit((p.retiringUntil-time)/.4);
  c.fillStyle='#273a3e55';c.beginPath();c.ellipse(0,2,20,5,0,0,tau);c.fill();
  c.translate(0,groundIconY+loose-near*3);
  if(!quiet&&!p.retiringUntil&&(p.readyAt??0)<=time){
    const hooked=(p.pulledUntil??0)>time;
    drawSkillWake(c,r,hooked?player.x-p.x:p.vx??0,hooked?player.y-p.y:p.vy??0);
  }
  drawSkillShell(c,r);
  const spr=assets.sprites[p.kind];
  if(spr)drawSprite(c,assets,p.kind,2,0,groundIconHeight(p.kind,spr.width,spr.height),-.035+near*.08,1,.5);
  drawSkillBadge(c,r,p.kind==='health');
  c.restore();
}

export const useLifetime = .90;
export const cartFanOffset = {x:-36, y:7};

/** Outbound route marks travel with the terminal's radio pulse, leaving the street readable. */
export function drawDispatchBroadcast(c:CanvasRenderingContext2D, origin:Vec, age:number, range:number, quiet:boolean):void {
  if(age<0||age>.70)return;
  const travel=unit(age/.46);
  const radius=quiet?range:22+(range-22)*(1-(1-travel)**2);
  c.save();c.translate(origin.x,origin.y);c.lineCap='round';c.lineJoin='round';
  c.globalAlpha*=unit((.70-age)/.30)*.85;
  c.beginPath();c.arc(0,0,radius,0,tau);
  c.lineWidth=7;c.strokeStyle='#304f5c9e';c.stroke();
  c.strokeStyle='#a9ecdc';c.lineWidth=2.5;c.stroke();
  c.setLineDash([6,10]);c.lineWidth=2;c.strokeStyle='#f6d693';
  c.beginPath();c.arc(0,0,Math.max(5,radius-8),0,tau);c.stroke();c.setLineDash([]);
  for(let i=0;i<6;i++){
    c.save();c.rotate(i*tau/6);c.translate(radius,0);
    c.fillStyle='#4c8380';c.strokeStyle='#f9edc0';c.lineWidth=1.5;
    c.beginPath();c.moveTo(-10,-6);c.lineTo(0,-6);c.lineTo(7,0);c.lineTo(0,6);c.lineTo(-10,6);
    c.lineTo(-4,0);c.closePath();c.fill();c.stroke();c.restore();
  }
  c.restore();
}

/** Short pressure ripples show the reach of the initial splash or bell strike. */
export function drawUseRipple(c:CanvasRenderingContext2D,use:Use,age:number,range:number,quiet:boolean):void {
  const soda=use.kind==='soda';
  const t=unit((age-(soda?0:.08))/.48);
  if(t<=0 || t>=1)return;
  const radius=quiet?range:range*(1-(1-t)**2);
  c.save();c.translate(use.x,use.y);c.lineCap='round';
  c.globalAlpha=(1-t)*Math.min(1,t*9);c.strokeStyle=soda?'#a4e4cd':'#fbd896';c.lineWidth=2.3;
  for(let i=0;i<6;i++){
    const a=i*tau/6+.2;
    c.beginPath();c.arc(0,0,radius,a,a+(soda?.45:.83));c.stroke();
    if(soda && !quiet){
      c.save();c.rotate(a+.61);c.fillStyle='#d3f8e8';
      c.beginPath();c.ellipse(radius,0,3.9,1.7,0,0,tau);c.fill();c.restore();
    }
  }
  c.restore();
}

/** The picked-up prop travels to the satchel, then is used or put down. Gameplay keeps running. */
export function drawDeliveryUse(c:CanvasRenderingContext2D, assets:Assets, use:Use, time:number, bag:Vec, hand:Vec, quiet:boolean, field?:ElementalField):void {
  const age=Math.max(0,time-use.time);
  if(age>=useLifetime)return;
  const side=use.facing.x<0?-1:1;
  const ground = use.kind==='fan'||use.kind==='skate'||use.kind==='cones'||use.kind==='lure'||use.kind==='route'||use.kind==='supply';
  const end = use.kind==='fan' ? {x:use.x+cartFanOffset.x,y:use.y+cartFanOffset.y}
    : ground ? {x:use.x+side*21,y:use.y-6}
    : hand;
  const start=use.pickupFrom ? {x:use.pickupFrom.x+2,y:use.pickupFrom.y+groundIconY} : bag;
  if(use.pickupFrom&&!quiet&&age<.16){
    const t=unit(age/.16),r=shellRadius(use.kind)*(1+t*.22);
    c.save();c.translate(start.x-2,start.y);c.lineCap='round';
    c.strokeStyle='#b6ffdc';c.lineWidth=3-2*t;c.globalAlpha=.75*(1-t);
    for(const a of [.15,2.05,4.32]){
      c.beginPath();c.arc(0,0,r,a+t*.24,a+1.08-t*.52);c.stroke();
    }
    c.restore();
  }
  const collect=ease(age/.10), grip=ease((age-.08)/.09), useTool=ease((age-.17)/.21);
  const heldX=lerp(lerp(start.x,bag.x,collect),hand.x,grip);
  const heldY=lerp(lerp(start.y,bag.y,collect),hand.y-4,grip);
  let x=ground?lerp(heldX,end.x,useTool):heldX;
  let y=ground?lerp(heldY,end.y,useTool)-(quiet?0:Math.sin(useTool*Math.PI)*12):heldY;
  if(field&&!quiet){
    const toss=ease((age-.16)/.13);
    x=lerp(heldX,field.x,toss);
    y=lerp(heldY,field.y-12,toss)-Math.sin(toss*Math.PI)*24;
  }
  const fan=use.kind==='fan', soda=use.kind==='soda';
  const fade=unit((useLifetime-age)/.24);
  const propAlpha=field?unit((.29-age)/.11):isUltimate(use.kind)?unit((.15-age)/.06):fan?unit((.46-age)/.11):fade;
  let turn=0;
  if(!quiet){
    if(soda)turn=-side*(.12+1.58*useTool*(1-ease((age-.62)/.17)));
    else if(use.kind==='bell')turn=side*Math.sin(age*38)*.36*(1-ease((age-.32)/.4));
    else turn=side*Math.sin(useTool*Math.PI)*.28;
  }else if(soda)turn=-side*1.28*useTool;
  c.save();c.globalAlpha=propAlpha;
  const spr=assets.sprites[use.kind], h=fan?40:soda?37:33;
  if(spr){
    const heldHeight=Math.min(h,(h+10)*spr.height/spr.width);
    const height=use.pickupFrom?lerp(groundIconHeight(use.kind,spr.width,spr.height),heldHeight,collect):heldHeight;
    drawSprite(c,assets,use.kind,x,y,height,turn,1,.5);
  }
  if(soda && age>.18 && age<.66){
    const pour=Math.sin(unit((age-.18)/.48)*Math.PI);
    const neckX=x+Math.sin(turn)*16,neckY=y-Math.cos(turn)*16;
    const landX=clamp(neckX-side*15,use.x-74,use.x+74);
    const landY=clamp(bag.y+58,use.y-60,use.y+60);
    c.globalAlpha*=pour*unit((145-Math.hypot(neckX-landX,neckY-landY))/40);
    c.lineWidth=2+pour*2.5;c.lineCap='round';c.strokeStyle='#4f9987';
    c.beginPath();c.moveTo(neckX,neckY);c.quadraticCurveTo(neckX-side*17,neckY+3,landX,landY);c.stroke();
    c.lineWidth=1.4;c.strokeStyle='#dcf6da';c.stroke();
  }
  c.restore();
  // Label the collected item on a small paper slip at the pickup site, clear of head-level damage.
  const labelOpacity=ease(age/.12)*fade;
  if(labelOpacity<=0)return;
  c.save();c.globalAlpha=labelOpacity;
  const text=SKILL_NAMES[use.kind]+' · '+SKILL_GUIDE[use.kind].role;c.font='bold 15px "Microsoft YaHei",sans-serif';
  const w=c.measureText(text).width+15;
  c.translate(clamp(use.x,12+w/2,1268-w/2),Math.min(652,use.y+32));
  c.fillStyle='#f7e3b9';c.strokeStyle='#614638';c.lineWidth=1.4;
  c.beginPath();c.roundRect(-w/2,-10,w,20,3);c.fill();c.stroke();
  c.fillStyle=trim[use.kind];c.fillRect(-w/2+2,-7,3,14);
  c.fillStyle='#483a32';c.textAlign='center';c.textBaseline='middle';c.fillText(text,2,.5);c.restore();
}
