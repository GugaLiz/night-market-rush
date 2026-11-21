import {WEAPONS} from '../domain/core/weapons';
import type {GameEvent,GameState,Settings} from '../domain/shared/types';
import {skillCameraOffset} from './skill-camera';

type Mode='home'|'play'|'pause'|'result';
interface CrowdImpact {x:number;y:number;age:number;power:number;direction:number}
interface Stride {x:number;y:number;vx:number;vy:number;time:number}
export interface CameraShakeTransform {dx:number;dy:number;overscan:number}

/** Mirrors the legacy renderer's presentation clock and event ordering. Values
 * are in simulation world coordinates (+Y down). No engine nodes are touched. */
export class CameraShakeModel {
  private clock=0;
  private shake=0;
  private impact:CrowdImpact|null=null;
  private lastImpactAt=-Infinity;
  private recentDefeats:Array<{x:number;y:number;time:number}>=[];
  private lastStride:Stride|null=null;

  reset():void {
    this.clock=0;this.shake=0;this.impact=null;this.lastImpactAt=-Infinity;
    this.recentDefeats=[];this.lastStride=null;
  }

  /** Deliver every event batch once, in the same order as simulation. */
  events(events:readonly GameEvent[]):void {
    const fallen=events.filter((e):e is Extract<GameEvent,{type:'kill'}>=>e.type==='kill');
    let time=0;
    if(fallen.length){
      for(const event of events)if(event.type==='damage')time=event.time;
      this.recentDefeats=this.recentDefeats.filter(e=>e.time>=time-.15&&e.time<=time);
      for(const event of fallen)this.recentDefeats.push({x:event.x,y:event.y,time});
    }
    const center=fallen[0];
    const group=center?this.recentDefeats.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<300):[];
    if(group.length>=3){
      let x=0,y=0;for(const item of group){x+=item.x;y+=item.y;}x/=group.length;y/=group.length;
      if(time-this.lastImpactAt>.28){
        const power=Math.min(1,.48+group.length*.045);
        const direction=this.lastStride?Math.atan2(y-this.lastStride.y,x-this.lastStride.x):-.65;
        this.impact={x,y,age:0,power,direction};this.lastImpactAt=time;
      }
    }
    for(const event of events){
      if(event.type==='damage'){
        if((event.burstIndex??1)!==1)continue;
        if(event.victimId===0)this.shake=.14;
        else if(Object.hasOwn(WEAPONS,event.source))this.shake=Math.max(this.shake,.08);
      }else if(event.type==='fail')this.shake=.3;
    }
  }

  /** Advance once per rendered frame; pause supplies no presentation time.
   * `state` may be the same interpolated presentation snapshot used to draw. */
  frame(state:GameState|null,elapsed:number,mode:Mode,settings:Pick<Settings,'shake'|'reduceMotion'>,
    viewWidth:number,viewHeight:number):CameraShakeTransform {
    let dt=Number.isFinite(elapsed)?Math.min(.05,Math.max(0,elapsed)):0;
    if(mode==='pause')dt=0;
    this.clock+=dt;this.shake=Math.max(0,this.shake-dt);
    if(this.impact){this.impact.age+=dt;if(this.impact.age>.38)this.impact=null;}
    let dx=0,dy=0,overscan=1;
    if(state&&settings.shake&&!settings.reduceMotion&&mode==='play'){
      dx=Math.sin(this.clock*104)*this.shake*8;
      dy=Math.cos(this.clock*127)*this.shake*6;
      if(this.impact){
        const {age,power,direction}=this.impact;
        const kick=Math.cos(age*79)*Math.exp(-age*17)*power*8;
        dx-=Math.cos(direction)*kick;dy-=Math.sin(direction)*kick;
      }
      const recoil=skillCameraOffset(state);
      if(recoil){dx=recoil.x;dy=recoil.y;}
      if(Math.abs(dx)+Math.abs(dy)>.05&&viewWidth>0&&viewHeight>0){
        overscan=1+Math.max(Math.abs(dx)/viewWidth,Math.abs(dy)/viewHeight)*2;
      }else {dx=0;dy=0;}
    }
    // The old renderer records footwork during battle, after camera calculation.
    if(state&&mode!=='home')this.trackStride(state,dt,settings.reduceMotion);
    return {dx,dy,overscan};
  }

  private trackStride(state:GameState,dt:number,reduced:boolean):void {
    if(dt<=0||state.ended||reduced)return;
    const p=state.player,previous=this.lastStride;
    if(previous&&state.time-previous.time<.046)return;
    if(Math.hypot(p.vx,p.vy)>85)this.lastStride={x:p.x,y:p.y,vx:p.vx,vy:p.vy,time:state.time};
  }
}
