/** Presentation-only tally feedback, keyed to simulation time so pauses do not
 * advance the burst. It never changes the authoritative game state. */
export class HudCombatFeedback {
  private lastTime:number|null=null;
  private shownKills=0;
  private clusterStart=0;
  private clusterKills=0;
  private lastPulse=-Infinity;
  private pulseUntil=0;
  private burstUntil=0;
  private burstText='';

  update(kills:number,time:number,reduceMotion:boolean):{burstLabel:string;pulse:number;pulseTarget:'kills'|'combo'} {
    if(this.lastTime===null||time<this.lastTime||kills<this.shownKills){
      this.shownKills=kills;this.clusterStart=-Infinity;this.clusterKills=0;
      this.lastPulse=-Infinity;this.pulseUntil=0;this.burstUntil=0;this.burstText='';
    }
    this.lastTime=time;
    const gained=kills-this.shownKills;
    if(gained>0){
      this.shownKills=kills;
      if(time-this.clusterStart>.35){this.clusterStart=time;this.clusterKills=0;}
      this.clusterKills+=gained;
      if(this.clusterKills>=4){this.burstUntil=time+.85;this.burstText=`瞬间击败 ${this.clusterKills}`;}
      if(!reduceMotion&&time-this.lastPulse>.14){this.lastPulse=time;this.pulseUntil=time+.19;}
    }
    const burstLabel=time<this.burstUntil?this.burstText:'';
    const pulse=!reduceMotion&&time<this.pulseUntil?1+.18*Math.max(0,(this.pulseUntil-time)/.19):1;
    return {burstLabel,pulse,pulseTarget:this.clusterKills>=4?'combo':'kills'};
  }
}
