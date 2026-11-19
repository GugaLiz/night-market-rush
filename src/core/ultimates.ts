import type {Enemy, ExpressCast, GameState, UltimateKind, Vec, WaveCast} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD} from './config';
import {clamp, relativeSweep} from './geometry';
import {stunEnemy} from './enemies';

type WaveKind = WaveCast['kind'];
export const WAVES = {
  icebox:  {windup:.20, travel:.35, fade:.27, damage:85, push:34},
  steamer: {windup:.13, travel:.65, fade:.24, damage:100, push:48},
  berry:   {windup:.18, travel:.33, fade:.26, damage:144, push:56},
} as const satisfies Record<WaveKind,{windup:number;travel:number;fade:number;damage:number;push:number}>;
export const EXPRESS = {windup:.10, leg:.24, fade:.40, radius:37, damage:58, landingDamage:92, landingRadius:110} as const;
export const TOSS_DURATION=.24;

function tossEnemy(e:Enemy,now:number,height:number,frozen=false):void {
  e.tossAt=now;e.tossHeight=height*(e.kind==='giantBun'?.42:1);
  // The giant only flinches under ordinary impacts; ice can break a grounded windup.
  if(e.kind==='giantBun'&&!frozen)return;
  const until=now+(frozen?.75:TOSS_DURATION);
  if(frozen)e.chilledUntil=until;
  e.contactSuppressedUntil=Math.max(e.contactSuppressedUntil,until);
  stunEnemy(e,until);
}

function cornerDistance(p:Vec):number {
  const b=WORLD.bounds;
  return Math.hypot(Math.max(p.x-b.left,b.right-p.x),Math.max(p.y-b.top,b.bottom-p.y));
}

export function castUltimate(s:GameState,kind:UltimateKind,origin:Vec):void {
  // Different skills can overlap. Repeating the same skill replaces its old visual tail and hit history.
  s.ultimates=(s.ultimates??[]).filter(c=>c.kind!==kind);
  const base={x:origin.x,y:origin.y,bornAt:s.time,hitIds:[]};
  if(kind==='express'){
    s.ultimates.push({...base,kind,expiresAt:s.time+EXPRESS.windup+3*(EXPRESS.leg+CONFIG.step)+EXPRESS.fade,
      px:origin.x,py:origin.y,landings:[],legStart:s.time+EXPRESS.windup,target:{x:origin.x,y:origin.y},onLeg:false});
    return;
  }
  const tune=WAVES[kind];
  s.ultimates.push({...base,kind,expiresAt:s.time+tune.windup+tune.travel+tune.fade,angle:Math.atan2(s.player.moveDirection.y,s.player.moveDirection.x),reach:cornerDistance(origin),released:false});
}

export function waveRadius(cast:WaveCast,time:number):number {
  const t=WAVES[cast.kind];
  return cast.reach*clamp((time-cast.bornAt-t.windup)/t.travel,0,1);
}

/** Intersect the moving enemy with the wave at the same instant; another skill can shove it faster than the front. */
function touchesWave(cast:WaveCast,e:Enemy,previous:number,radius:number,start:number,end:number,forward:Vec):boolean {
  const travelX=e.x-e.px,travelY=e.y-e.py;
  const x=e.px+travelX*start-cast.x,y=e.py+travelY*start-cast.y;
  const vx=travelX*(end-start),vy=travelY*(end-start),growth=radius-previous;
  let from=0,to=1;
  if(cast.kind==='icebox'){
    const side=x*forward.x+y*forward.y+e.radius,next=side+vx*forward.x+vy*forward.y;
    if(side<0&&next<0)return false;
    if(side<0)from=side/(side-next);
    if(next<0)to=side/(side-next);
  }
  const gap=(t:number)=>Math.hypot(x+vx*t,y+vy*t)-(previous+growth*t);
  const first=gap(from),last=gap(to);
  // The radial distance minus the linear wave radius is convex; its maximum is at an endpoint.
  if(Math.max(first,last)<-e.radius)return false;
  if(Math.min(first,last)<=e.radius)return true;
  // Both ends are outside. Only an interior minimum of the squared outer-edge equation can touch.
  const curvature=vx*vx+vy*vy-growth*growth;
  if(curvature<=0)return false;
  const nearest=((previous+e.radius)*growth-x*vx-y*vy)/curvature;
  return nearest>from&&nearest<to&&gap(nearest)<=e.radius;
}

function updateWave(s:GameState,cast:WaveCast,dt:number,ctx:CombatContext):void {
  const tune=WAVES[cast.kind],release=cast.bornAt+tune.windup;
  if(!cast.released && cast.kind==='icebox'){
    cast.x=s.player.x;cast.y=s.player.y;
    cast.angle=Math.atan2(s.player.moveDirection.y,s.player.moveDirection.x);
    cast.reach=cornerDistance(cast);
  }
  if(s.time+1e-9<release || s.time-dt>=release+tune.travel)return;
  if(!cast.released){
    cast.released=true;
    ctx.emit({type:'ultimateBeat',kind:cast.kind,beat:1,x:cast.x,y:cast.y});
  }
  const previous=waveRadius(cast,s.time-dt),radius=waveRadius(cast,s.time);
  const start=clamp((release-s.time+dt)/dt,0,1),end=clamp((release+tune.travel-s.time+dt)/dt,0,1);
  const forward={x:Math.cos(cast.angle),y:Math.sin(cast.angle)};
  for(const e of s.enemies){
    if(!ctx.active(e)||cast.hitIds.includes(e.id))continue;
    if(!touchesWave(cast,e,previous,radius,start,end,forward))continue;
    const ox=e.x-cast.x,oy=e.y-cast.y;
    if(!ctx.damage(e,tune.damage,cast.kind,Math.atan2(oy,ox)))continue;
    cast.hitIds.push(e.id);
    if(e.hp<=0)continue;
    ctx.push(e,cast,tune.push);
    tossEnemy(e,s.time,cast.kind==='berry'?30:cast.kind==='steamer'?22:7,cast.kind==='icebox');
  }
}

export function expressCast(s:GameState):ExpressCast|undefined {
  return s.ultimates?.find((cast):cast is ExpressCast=>cast.kind==='express');
}

function nextStop(s:GameState,cast:ExpressCast,input:Vec):Vec {
  const b=WORLD.bounds;
  const left=b.left+52,right=b.right-52,top=CONFIG.player.minY+28,bottom=b.bottom-50;
  let sign:number;
  if(cast.landings.length===1){
    const facing=s.player.moveDirection.x;
    sign=Math.abs(facing)>.28?Math.sign(facing):(cast.x<(left+right)/2?1:-1);
    if((sign>0?right-cast.x:cast.x-left)<(right-left)*.35)sign=-sign;
  }else sign=cast.x<(left+right)/2?1:-1;
  const center=(top+bottom)/2;
  // The outer runs occupy opposite rows with a diagonal return between them.
  const highLane=top+43,lowLane=bottom-38;
  const first=cast.landings.length===1,final=cast.landings.length===3;
  const defaultY=final?cast.y+(cast.y<center?18:-18):
    first?(cast.y<center-44?highLane:lowLane):(cast.y<center?lowLane:highLane);
  const aim=Math.min(1,Math.abs(input.y));
  const desiredY=cast.y+input.y*240;
  const edge=sign>0?right:left;
  const pullIn=clamp(-sign*input.x,0,1)*130;
  return {x:edge-sign*pullIn,y:clamp(defaultY*(1-aim)+desiredY*aim,top,bottom)};
}

function updateExpress(s:GameState,cast:ExpressCast,input:Vec,dt:number,ctx:CombatContext):void {
  cast.px=cast.x;cast.py=cast.y;
  if(s.time+1e-9<cast.bornAt+EXPRESS.windup||cast.landings.length>=4)return;
  if(!cast.onLeg){
    if(!cast.landings.length)cast.landings.push({x:cast.x,y:cast.y});
    cast.legStart=s.time-dt;
    cast.target=nextStop(s,cast,input);
    cast.hitIds=[];
    cast.onLeg=true;
  }
  const start=cast.landings[cast.landings.length-1],progress=clamp((s.time-cast.legStart)/EXPRESS.leg,0,1);
  // Use the same moving parcel for the projected trail and the swept hit volume.
  const t=.30*progress+.70*(.5-.5*Math.cos(Math.PI*progress));
  const dx=cast.target.x-start.x,dy=cast.target.y-start.y,distance=Math.hypot(dx,dy)||1;
  cast.x=start.x+dx*t;
  cast.y=start.y+dy*t;
  const arrived=s.time+1e-9>=cast.legStart+EXPRESS.leg,leg=cast.landings.length;
  const heavy=arrived&&leg===3;
  for(const e of s.enemies){
    if(!ctx.active(e)||cast.hitIds.includes(e.id))continue;
    // Hold damage inside the final seal for touchdown so the lane cannot spend its heavier hit early.
    if(leg===3&&!arrived && Math.hypot(e.x-cast.target.x,e.y-cast.target.y)<=EXPRESS.landingRadius+e.radius)continue;
    const touches=relativeSweep({x:cast.px,y:cast.py},cast,{x:e.px,y:e.py},e,EXPRESS.radius+e.radius)!==null;
    const inLanding=heavy && Math.hypot(e.x-cast.x,e.y-cast.y)<=EXPRESS.landingRadius+e.radius;
    if(!touches&&!inLanding)continue;
    const side=(e.y-start.y)*dx-(e.x-start.x)*dy>=0?1:-1;
    const outward=inLanding?cast:{x:e.x+side*dy/distance,y:e.y-side*dx/distance};
    if(ctx.damage(e,inLanding?EXPRESS.landingDamage:EXPRESS.damage,'express',Math.atan2(e.y-outward.y,e.x-outward.x))){
      cast.hitIds.push(e.id);
      if(e.hp>0){
        ctx.push(e,outward,inLanding?54:32);
        tossEnemy(e,s.time,inLanding?32:15);
      }
    }
  }
  if(arrived){
    ctx.emit({type:'ultimateBeat',kind:'express',beat:leg,x:cast.x,y:cast.y});
    cast.landings.push({x:cast.x,y:cast.y});cast.onLeg=false;
    if(heavy)cast.expiresAt=s.time+EXPRESS.fade;
  }
}

export function updateUltimates(s:GameState,dt:number,ctx:CombatContext,input:Vec):void {
  if(!s.ultimates?.length)return;
  for(const cast of s.ultimates){
    if(cast.kind==='express')updateExpress(s,cast,input,dt,ctx);
    else updateWave(s,cast,dt,ctx);
  }
  s.ultimates=s.ultimates.filter(c=>c.expiresAt>s.time);
}
