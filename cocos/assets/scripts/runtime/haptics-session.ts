import {EXPRESS} from '../domain/core/ultimates';
import type {GameEvent} from '../domain/shared/types';

/** Platform adapters provide a monotonic millisecond clock and a cancellable motor. */
export interface HapticsHost {
  isAvailable():boolean;
  now():number;
  vibrate(pattern:number|number[]):boolean;
  /** Notify on hide/blur/interruption; return an unsubscribe function. */
  onInterrupt?(callback:()=>void):()=>void;
}

// Alternating motor-on and rest intervals, in milliseconds.
const pulses = {
  icebox: [18, 22, 35], steamer: [34, 32, 56], berry: [75, 30, 35],
  vortex: [24, 36, 65], turn: [18], delivery: [28, 26, 40], finalDelivery: [55, 28, 75],
};

function pulseFor(event:GameEvent):number[]|undefined {
  if(event.type==='elementalBurst'&&event.kind==='vortex')return pulses.vortex;
  if(event.type!=='ultimateBeat')return;
  if(event.kind!=='express')return pulses[event.kind];
  if(event.beat===EXPRESS.legs)return pulses.finalDelivery;
  return event.beat%EXPRESS.legsPerOrder===0?pulses.delivery:pulses.turn;
}

/** A light impact cannot interrupt a stronger in-progress pulse. Hosts remain
 * responsible for stopping on pause and when user preferences disable haptics. */
export class HapticsSession {
  private until=0;
  private strength=0;
  private unsubscribe:(()=>void)|null=null;
  private disposed=false;

  constructor(private readonly host:HapticsHost){
    try{this.unsubscribe=host.onInterrupt?.(()=>this.stop())??null;}catch{/* optional lifecycle hook unavailable */}
  }
  get available():boolean {
    if(this.disposed)return false;
    try{return this.host.isAvailable();}catch{return false;}
  }
  play(events:readonly GameEvent[]):void {
    if(this.disposed||!events.length)return;
    if(!this.available){this.stop();return;}
    let selected:number[]|undefined,strength=0;
    for(const event of events){
      const pulse=pulseFor(event);if(!pulse)continue;
      const onTime=pulse.reduce((sum,ms,index)=>sum+(index%2===0?ms:0),0);
      if(onTime>strength){selected=pulse;strength=onTime;}
    }
    if(!selected)return;
    try{
      const now=this.host.now();if(!Number.isFinite(now)||(now<this.until&&strength<=this.strength))return;
      if(this.host.vibrate([...selected])){
        this.until=now+selected.reduce((sum,ms)=>sum+ms,0);this.strength=strength;
      }
    }catch{/* unavailable permissions, unsupported device or interrupted host */}
  }
  stop():void {
    if(!this.until)return;
    this.until=0;this.strength=0;
    try{this.host.vibrate(0);}catch{/* an interrupted runtime can lose motor access */}
  }
  dispose():void {
    if(this.disposed)return;
    this.stop();this.disposed=true;
    try{this.unsubscribe?.();}catch{/* already detached */}
    this.unsubscribe=null;
  }
}
