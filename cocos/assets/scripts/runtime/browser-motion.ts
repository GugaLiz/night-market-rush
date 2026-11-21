import {DEFAULT_SETTINGS,type Settings,type Vec} from '../domain/shared/types';

type OrientationPermission = typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>};
const SENSITIVITY={low:.72,medium:1,high:1.3};

/** Browser-only motion input. Other hosts should supply their own motion adapter. */
export class BrowserMotionInput {
  private settings:Settings={...DEFAULT_SETTINGS};
  private enabled=false;private permission=false;private calibrated=false;private disposed=false;
  private staleReported=false;private raw:Vec={x:0,y:0};private neutral:Vec={x:0,y:0};private filtered:Vec={x:0,y:0};
  private sampleAt=0;private filterAt=0;private waiters:Array<(value:boolean)=>void>=[];

  constructor(private readonly onUnavailable:()=>void,private readonly now:()=>number=()=>performance.now()) {
    if(typeof window!=='undefined'){
      window.addEventListener('deviceorientation',this.orientation);
      window.addEventListener('orientationchange',this.screenChanged);
    }
  }

  setSettings(settings:Settings):void {this.settings={...settings};this.clear();this.staleReported=false;}
  setEnabled(enabled:boolean):void {this.enabled=enabled;this.clear();if(enabled)this.staleReported=false;}
  get available():boolean {return this.permission&&this.sampleAt>0&&this.now()-this.sampleAt<1500;}

  /** Invoke immediately in the user gesture, before waiting for other work. */
  async request():Promise<boolean> {
    if(this.disposed||typeof window==='undefined'||typeof DeviceOrientationEvent==='undefined')return false;
    try {
      const ctor=DeviceOrientationEvent as OrientationPermission;
      if(ctor.requestPermission&&await ctor.requestPermission()!=='granted'){this.permission=false;return false;}
      if(this.disposed)return false;
      this.permission=true;if(this.available)return true;
      return await new Promise<boolean>(resolve=>{
        let done=false;
        const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);this.waiters=this.waiters.filter(fn=>fn!==finish);resolve(ok);};
        const timer=setTimeout(()=>finish(false),1800);this.waiters.push(finish);
      });
    }catch{this.permission=false;return false;}
  }

  calibrate():boolean {
    if(!this.available)return false;
    this.neutral={...this.raw};this.calibrated=true;this.staleReported=false;this.clear();return true;
  }

  getVector():Vec {
    if(!this.enabled||this.disposed)return {x:0,y:0};
    if(!this.available||!this.calibrated){
      if(!this.staleReported){this.staleReported=true;queueMicrotask(()=>{if(this.enabled&&!this.disposed)this.onUnavailable();});}
      return {x:0,y:0};
    }
    const now=this.now(),dt=Math.min(.1,Math.max(0,(now-this.filterAt)/1000));this.filterAt=now;
    const dx=this.raw.x-this.neutral.x,dy=this.raw.y-this.neutral.y,angle=Math.hypot(dx,dy);
    const strength=Math.min(1,Math.max(0,angle-2)/13*SENSITIVITY[this.settings.sensitivity]);
    if(strength===0){this.filtered={x:0,y:0};return {...this.filtered};}
    const target={x:dx/angle*strength,y:dy/angle*strength};
    const reversing=this.filtered.x*target.x+this.filtered.y*target.y<0;
    const alpha=1-Math.exp(-dt/(reversing?.020:.045));
    this.filtered.x+=(target.x-this.filtered.x)*alpha;this.filtered.y+=(target.y-this.filtered.y)*alpha;
    return {...this.filtered};
  }

  clear():void {this.filtered={x:0,y:0};this.filterAt=this.now();}
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.enabled=false;
    if(typeof window!=='undefined'){
      window.removeEventListener('deviceorientation',this.orientation);
      window.removeEventListener('orientationchange',this.screenChanged);
    }
    for(const finish of [...this.waiters])finish(false);this.waiters=[];
  }

  private screenChanged=()=>{
    this.calibrated=false;this.clear();
    if(this.enabled&&this.settings.mode==='tilt')this.onUnavailable();
  };
  private orientation=(event:DeviceOrientationEvent)=>{
    if(typeof event.beta!=='number'||typeof event.gamma!=='number'||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
    const fallback=(window as unknown as {orientation?:number}).orientation??0;
    const angle=(typeof screen!=='undefined'?screen.orientation?.angle??fallback:fallback)*Math.PI/180;
    this.raw={x:event.gamma*Math.cos(angle)+event.beta*Math.sin(angle),y:event.beta*Math.cos(angle)-event.gamma*Math.sin(angle)};
    this.sampleAt=this.now();this.staleReported=false;
    if(this.permission)for(const finish of [...this.waiters])finish(true);
  };
}
