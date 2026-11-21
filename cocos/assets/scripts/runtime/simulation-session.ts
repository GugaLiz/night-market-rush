import {CONFIG} from '../domain/core/config';
import {Game} from '../domain/core/game';
import type {GameEvent, GameState, Vec} from '../domain/shared/types';

/** Platform-independent fixed-step driver. Hosts own UI, input and lifecycle. */
export class SimulationSession {
  readonly game:Game;
  private accumulator=0;
  private running=false;
  private interpolationReady=false;
  private impactHold=0;

  constructor(seed?:number, private readonly onEvents:(events:GameEvent[],state:GameState)=>void=()=>{}) {
    this.game=new Game(seed);
  }

  get state():GameState {return this.game.state;}
  get isRunning():boolean {return this.running;}
  get interpolation():number|null {return this.interpolationReady?this.accumulator/CONFIG.step:null;}

  start(seed?:number,practice=false):void {
    this.game.reset(seed,practice);
    this.accumulator=0;this.impactHold=0;this.interpolationReady=false;this.running=true;
  }

  pause():void {this.running=false;this.accumulator=0;this.interpolationReady=false;}
  resume():boolean {
    if(this.state.ended||this.state.market.closing==='choice')return false;
    this.accumulator=0;this.impactHold=0;this.interpolationReady=false;this.running=true;
    return true;
  }

  /** Freeze for a short presentation beat, as in the current web loop. */
  hold(seconds:number):void {if(Number.isFinite(seconds)&&seconds>0)this.impactHold=seconds;}

  /** A stalled foreground frame is discarded: there is no input history to replay. */
  update(elapsed:number,input:Vec,practiceSpeed=1):void {
    if(!this.running)return;
    let dt=!Number.isFinite(elapsed)||elapsed<0||elapsed>.25?0:Math.min(.1,elapsed);
    if(this.impactHold>0){const held=Math.min(this.impactHold,dt);this.impactHold-=held;dt-=held;}
    const speed=this.state.practice&&practiceSpeed===.5?.5:1;
    this.accumulator+=dt*speed;
    while(this.running&&this.accumulator>=CONFIG.step){
      this.game.update(CONFIG.step,input);this.accumulator-=CONFIG.step;this.interpolationReady=true;
      this.deliver();
      if(this.state.ended||this.state.market.closing==='choice')this.pause();
    }
  }

  dash(input:Vec):boolean {
    if(!this.running||!this.game.dash(input))return false;
    this.deliver();return true;
  }

  private deliver():void {this.onEvents(this.game.drainEvents(),this.state);}
}
