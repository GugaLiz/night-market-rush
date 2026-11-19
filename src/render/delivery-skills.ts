import {clamp} from '../core/geometry';
import {pickupReach} from '../core/config';
import {isUltimate, SKILL_NAMES, type GameEvent, type Pickup, type SkillKind, type Vec} from '../shared/types';
import {drawSprite} from './sprite';
import type {Assets} from './assets';

type Use = Extract<GameEvent, {type:'skill'}>;
const tau = Math.PI*2;
const ink = '#563c36';
const trim: Record<SkillKind,string> = {
  fan:'#df8841', soda:'#479b87', skate:'#bd5b46', lure:'#a76536', bubble:'#5993a1',
  cones:'#bc6239', bell:'#b38a38', route:'#438479', hook:'#487986', heat:'#b35d39',
  dispatch:'#566d81', stamp:'#b44b42', supply:'#798650',
  icebox:'#428eb3',steamer:'#c58a41',express:'#319080',berry:'#b63565',
};
const unit = (x:number) => clamp(x,0,1);
const ease = (x:number) => {const t=unit(x);return t*t*(3-2*t);};
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;

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

/** The loose tool sits on a short tear-off order tag, with its shadow at the pickup location. */
export function drawDeliveryPickup(c:CanvasRenderingContext2D, assets:Assets, pickup:Pickup, player:Vec, time:number, quiet:boolean):void {
  const p=pickup, color=trim[p.kind];
  const reach=pickupReach(p);
  const near = quiet ? 0 : ease(1-(Math.hypot(p.x-player.x,p.y-player.y)-reach)/44);
  const loose = quiet ? 0 : Math.sin(time*3.5+p.id)*1.9;
  const height=p.kind==='fan'?45:39;
  if(!p.retiringUntil&&(p.disabledUntil??0)<=time&&(p.readyAt??0)<=time)drawPickupReach(c,p,player,reach);
  c.save();c.translate(p.x,p.y);
  if((p.disabledUntil??0)>time || (p.readyAt??0)>time)c.globalAlpha=.46;
  if(p.retiringUntil)c.globalAlpha*=unit((p.retiringUntil-time)/.4);
  c.fillStyle='#35262d52';c.beginPath();c.ellipse(0,0,19,5,0,0,tau);c.fill();
  c.translate(0,-28+loose-near*3);
  c.save();c.rotate(-.12+near*.09);c.translate(-18,-18);
  c.fillStyle='#ffedc8';c.strokeStyle=ink;c.lineWidth=1.8;
  c.beginPath();c.moveTo(1,-3);c.lineTo(37,-3);c.lineTo(37,33);
  for(let x=37;x>=1;x-=6){c.lineTo(x-3,30);c.lineTo(x-6,33);}
  c.lineTo(-3,1);c.closePath();c.fill();c.stroke();
  c.fillStyle=color;c.fillRect(0,-1,35,5);
  c.strokeStyle='#b99b75';c.lineWidth=1;c.setLineDash([2,3]);c.beginPath();c.moveTo(1,24);c.lineTo(33,24);c.stroke();
  c.restore();
  const spr=assets.sprites[p.kind];
  if(spr)drawSprite(c,assets,p.kind,2,-5,Math.min(height,(height+10)*spr.height/spr.width),-.035+near*.08,1,.5);
  c.restore();
}

export const useLifetime = .90;
export const cartFanOffset = {x:-36, y:7};

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
export function drawDeliveryUse(c:CanvasRenderingContext2D, assets:Assets, use:Use, time:number, bag:Vec, hand:Vec, quiet:boolean):void {
  const age=Math.max(0,time-use.time);
  if(age>=useLifetime)return;
  const side=use.facing.x<0?-1:1;
  const ground = use.kind==='fan'||use.kind==='skate'||use.kind==='cones'||use.kind==='lure'||use.kind==='route'||use.kind==='supply';
  const end = use.kind==='fan' ? {x:use.x+cartFanOffset.x,y:use.y+cartFanOffset.y}
    : ground ? {x:use.x+side*21,y:use.y-6}
    : hand;
  const start=use.pickupFrom ? {x:use.pickupFrom.x+2,y:use.pickupFrom.y-33} : bag;
  const collect=ease(age/.10), grip=ease((age-.08)/.09), useTool=ease((age-.17)/.21);
  const heldX=lerp(lerp(start.x,bag.x,collect),hand.x,grip);
  const heldY=lerp(lerp(start.y,bag.y,collect),hand.y-4,grip);
  const x=ground?lerp(heldX,end.x,useTool):heldX;
  const y=ground?lerp(heldY,end.y,useTool)-(quiet?0:Math.sin(useTool*Math.PI)*12):heldY;
  const fan=use.kind==='fan', soda=use.kind==='soda';
  const fade=unit((useLifetime-age)/.24);
  const propAlpha=isUltimate(use.kind)?unit((.15-age)/.06):fan?unit((.46-age)/.11):fade;
  let turn=0;
  if(!quiet){
    if(soda)turn=-side*(.12+1.58*useTool*(1-ease((age-.62)/.17)));
    else if(use.kind==='bell')turn=side*Math.sin(age*38)*.36*(1-ease((age-.32)/.4));
    else turn=side*Math.sin(useTool*Math.PI)*.28;
  }else if(soda)turn=-side*1.28*useTool;
  c.save();c.globalAlpha=propAlpha;
  const spr=assets.sprites[use.kind], h=fan?40:soda?37:33;
  if(spr)drawSprite(c,assets,use.kind,x,y,Math.min(h,(h+10)*spr.height/spr.width),turn,1,.5);
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
  const text=SKILL_NAMES[use.kind];c.font='bold 14px "Microsoft YaHei",sans-serif';
  const w=c.measureText(text).width+15;
  c.translate(clamp(use.x,12+w/2,1268-w/2),Math.min(652,use.y+32));
  c.fillStyle='#f7e3b9';c.strokeStyle='#614638';c.lineWidth=1.4;
  c.beginPath();c.roundRect(-w/2,-10,w,20,3);c.fill();c.stroke();
  c.fillStyle=trim[use.kind];c.fillRect(-w/2+2,-7,3,14);
  c.fillStyle='#483a32';c.textAlign='center';c.textBaseline='middle';c.fillText(text,2,.5);c.restore();
}
