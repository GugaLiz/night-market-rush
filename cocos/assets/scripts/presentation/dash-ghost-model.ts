export interface DashGhost {slot:number;time:number;alpha:number}

/** Fixed pool of three captured poses; time is simulation time, not wall time. */
export class DashGhostTimeline {
  private entries:Array<{slot:number;time:number}>=[];
  private lastTime:number|null=null;
  private lastCapture=-Infinity;

  reset():void {this.entries=[];this.lastTime=null;this.lastCapture=-Infinity;}

  update(time:number,dashing:boolean,enabled:boolean,advancing:boolean):{capture:number|null;ghosts:DashGhost[]} {
    if(!enabled||!Number.isFinite(time)){this.reset();return {capture:null,ghosts:[]};}
    if(this.lastTime!==null&&time<this.lastTime)this.reset();
    this.lastTime=time;
    this.entries=this.entries.filter(entry=>time-entry.time>=0&&time-entry.time<=.17);
    let capture:number|null=null;
    if(dashing&&advancing&&time-this.lastCapture>=.05-1e-9){
      if(this.entries.length>=3)capture=this.entries.shift()!.slot;
      else capture=[0,1,2].find(slot=>!this.entries.some(entry=>entry.slot===slot))!;
      this.entries.push({slot:capture,time});this.lastCapture=time;
    }
    return {capture,ghosts:this.entries.map(entry=>({slot:entry.slot,time:entry.time,alpha:.36*Math.max(0,1-(time-entry.time)/.17)}))};
  }
}
