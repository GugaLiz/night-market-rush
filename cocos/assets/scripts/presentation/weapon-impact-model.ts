import {WEAPONS} from '../domain/core/weapons';
import type {GameEvent,Projectile} from '../domain/shared/types';

type Detonation=Extract<GameEvent,{type:'detonation'}>;
type ChainLink=Extract<GameEvent,{type:'chainLink'}>;
export type SnackKind='bun'|'onigiri'|'siumai'|'zongzi'|'box'|'bowl';
export type SnackImpact={type:'snackImpact';kind:SnackKind;x:number;y:number;angle:number};
export type WeaponImpact=(Detonation|ChainLink|SnackImpact)&{bornAt:number;duration:number};
const snackKinds:readonly string[]=['bun','onigiri','siumai','zongzi','box','bowl'];

/** Preserve actual event coordinates and the web effect lifetimes. */
export class WeaponImpactModel {
  private items:WeaponImpact[]=[];
  add(events:readonly GameEvent[],time:number):void {
    for(const e of events){
      if(e.type==='detonation')this.items.push({...e,bornAt:time,duration:.43});
      else if(e.type==='chainLink')this.items.push({...e,bornAt:time,duration:.19});
      else if(e.type==='damage'&&e.victimId===0&&(e.burstIndex??1)===1){
        const kind=e.source==='dash'?'box':e.source;
        if(snackKinds.includes(kind))this.items.push({type:'snackImpact',kind:kind as SnackKind,x:e.x,y:e.y,angle:e.impactAngle??0,bornAt:time,duration:.29});
      }
    }
    if(this.items.length>48)this.items=this.items.slice(-48);
  }
  active(time:number):readonly WeaponImpact[] {
    this.items=this.items.filter(e=>time>=e.bornAt&&time-e.bornAt<e.duration);
    return this.items;
  }
  reset():void {this.items=[];}
}

/** The actual lunchbox blast collision radius. */
export const lunchboxBlastRadius=()=>WEAPONS.lunchbox.width;
export const isBrinedTray=(p:Pick<Projectile,'kind'|'brined'>)=>p.kind==='tray'&&p.brined===true;
