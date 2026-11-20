import {DEFAULT_SETTINGS,type Settings,type Vec} from '../shared/types';

export interface JoystickState {active:boolean;x:number;y:number;dx:number;dy:number}
type PermissionConstructor=typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
const RADII={small:32,medium:42,large:54};
const KEY_DIRECTIONS:Readonly<Record<string,Vec>>={
  ArrowRight:{x:1,y:0}, KeyD:{x:1,y:0}, ArrowLeft:{x:-1,y:0}, KeyA:{x:-1,y:0},
  ArrowUp:{x:0,y:-1}, KeyW:{x:0,y:-1}, ArrowDown:{x:0,y:1}, KeyS:{x:0,y:1},
};
const SENSITIVITY={low:0.72,medium:1,high:1.3};
const normalize=(x:number,y:number):Vec=>{const n=Math.hypot(x,y);return n>1?{x:x/n,y:y/n}:{x,y};};

/** All output is intent, never direct movement of game entities. */
export class WebInput {
  private settings:Settings={...DEFAULT_SETTINGS};
  private enabled=false;
  private keys=new Set<string>();
  private pointer:number|null=null;
  private touchJoystick=false;
  private origin={x:0,y:0};
  private stick:Vec={x:0,y:0};
  private raw:Vec={x:0,y:0};
  private neutral:Vec={x:0,y:0};
  private filtered:Vec={x:0,y:0};
  private sampleAt=0;
  private filterAt=0;
  private permission=false;
  private calibrated=false;
  private staleReported=false;
  private disposed=false;
  private cleanup:Array<()=>void>=[];
  private sampleWaiters:Array<(ok:boolean)=>void>=[];
  constructor(private surface:HTMLElement,private onPause:()=>void,private onJoystick?:(state:JoystickState)=>void,private onDash?:()=>void){
    const listen=(target:EventTarget,type:string,handler:EventListener,options?:AddEventListenerOptions)=>{target.addEventListener(type,handler,options);this.cleanup.push(()=>target.removeEventListener(type,handler,options));};
    listen(window,'keydown',this.keyDown as EventListener);
    listen(window,'keyup',this.keyUp as EventListener);
    listen(window,'blur',this.loseFocus);
    listen(window,'contextmenu',this.contextMenu as EventListener,{passive:false});
    listen(document,'visibilitychange',this.visibility);
    listen(surface,'pointerdown',this.pointerDown as EventListener,{passive:false});
    listen(surface,'pointermove',this.pointerMove as EventListener,{passive:false});
    listen(surface,'pointerup',this.pointerEnd as EventListener);
    listen(surface,'pointercancel',this.pointerEnd as EventListener);
    listen(surface,'lostpointercapture',this.captureLost as EventListener);
    listen(window,'pointerup',this.pointerEnd as EventListener,{capture:true});
    listen(window,'pointercancel',this.pointerEnd as EventListener,{capture:true});
    listen(surface,'pointerleave',this.pointerLeave as EventListener);
    listen(window,'deviceorientation',this.orientation as EventListener);
    listen(window,'orientationchange',this.screenChanged);
  }
  setSettings(settings:Settings):void {const modeChanged=settings.mode!==this.settings.mode;this.settings={...settings};this.clear();if(modeChanged)this.staleReported=false;}
  setEnabled(enabled:boolean):void {this.enabled=enabled;this.clear();if(enabled)this.staleReported=false;}
  get tiltAvailable():boolean {return this.permission&&this.sampleAt>0&&performance.now()-this.sampleAt<1500;}
  getVector():Vec {
    if(!this.enabled||this.disposed)return {x:0,y:0};
    // During an overlapping key transition, the most recent direction wins on that axis.
    let x=0,y=0;
    for(const key of this.keys){
      const direction=KEY_DIRECTIONS[key];
      if(direction?.x)x=direction.x;
      if(direction?.y)y=direction.y;
    }
    if(x||y)return normalize(x,y);
    if(this.settings.mode==='joystick')return {...this.stick};
    if(!this.tiltAvailable||!this.calibrated){
      if(!this.staleReported){this.staleReported=true;queueMicrotask(()=>{if(this.enabled)this.onPause();});}
      return {x:0,y:0};
    }
    const now=performance.now();const dt=Math.min(0.1,Math.max(0,(now-this.filterAt)/1000));this.filterAt=now;
    const dx=this.raw.x-this.neutral.x,dy=this.raw.y-this.neutral.y,angle=Math.hypot(dx,dy);
    const strength=Math.min(1,Math.max(0,angle-2)/13*SENSITIVITY[this.settings.sensitivity]);
    if(strength===0){this.filtered={x:0,y:0};return {...this.filtered};}
    const target={x:dx/angle*strength,y:dy/angle*strength};
    const reversing=this.filtered.x*target.x+this.filtered.y*target.y<0;
    const alpha=1-Math.exp(-dt/(reversing?.020:.045));
    this.filtered.x+=(target.x-this.filtered.x)*alpha;this.filtered.y+=(target.y-this.filtered.y)*alpha;
    return {...this.filtered};
  }
  clear():void {
    this.keys.clear();this.filtered={x:0,y:0};this.filterAt=performance.now();
    this.releaseJoystick();
  }
  private releaseJoystick():void {
    this.stick={x:0,y:0};
    const id=this.pointer;this.pointer=null;this.touchJoystick=false;
    if(id!==null){try{if(this.surface.hasPointerCapture(id))this.surface.releasePointerCapture(id);}catch{/* pointer was already released */}}
    this.onJoystick?.({active:false,x:this.origin.x,y:this.origin.y,dx:0,dy:0});
  }
  async requestTilt():Promise<boolean> {
    if(this.disposed||typeof DeviceOrientationEvent==='undefined')return false;
    try{
      const ctor=DeviceOrientationEvent as PermissionConstructor;
      if(ctor.requestPermission&&await ctor.requestPermission()!=='granted'){this.permission=false;return false;}
      this.permission=true;
      if(this.tiltAvailable)return true;
      return await new Promise<boolean>(resolve=>{
        let done=false;const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);this.sampleWaiters=this.sampleWaiters.filter(fn=>fn!==finish);resolve(ok);};
        const timer=window.setTimeout(()=>finish(false),1800);this.sampleWaiters.push(finish);
      });
    }catch{this.permission=false;return false;}
  }
  calibrate():boolean {if(!this.tiltAvailable)return false;this.neutral={...this.raw};this.calibrated=true;this.staleReported=false;this.clear();return true;}
  dispose():void {this.disposed=true;this.clear();for(const fn of this.cleanup)fn();this.cleanup=[];for(const fn of [...this.sampleWaiters])fn(false);this.sampleWaiters=[];}
  private interactive(target:EventTarget|null):boolean {return target instanceof Element&&!!target.closest('button,input,select,textarea,a,[role="dialog"],[data-input-ignore]');}
  private keyDown=(e:KeyboardEvent)=>{
    if(!this.enabled||this.interactive(e.target))return;
    if(e.code==='Escape'){e.preventDefault();if(!e.repeat){this.clear();this.onPause();}return;}
    if(['Space','ShiftLeft','ShiftRight'].includes(e.code)){
      e.preventDefault();if(!e.repeat&&!this.keys.has(e.code)){this.keys.add(e.code);this.onDash?.();}return;
    }
    if(KEY_DIRECTIONS[e.code]){e.preventDefault();if(!e.repeat)this.keys.add(e.code);}
  };
  private keyUp=(e:KeyboardEvent)=>{this.keys.delete(e.code);};
  private contextMenu=(e:MouseEvent)=>{
    if(!this.enabled)return;
    if(e.composedPath().includes(this.surface))e.preventDefault();
    // Some mobile browsers report a long press as a MouseEvent without a pointer type.
    if(('pointerType' in e&&e.pointerType==='touch')||(!('pointerType' in e)&&this.touchJoystick))return;
    this.clear();
  };
  // Adding the right button during a left drag delivers pointermove instead of pointerdown.
  private interruptSecondaryPress(e:PointerEvent):boolean {
    if(e.pointerType!=='mouse'||e.button!==2||(e.buttons&2)===0)return false;
    e.preventDefault();this.clear();return true;
  }
  private pointerDown=(e:PointerEvent)=>{
    if(!this.enabled||this.interruptSecondaryPress(e)||this.settings.mode!=='joystick'||this.pointer!==null||this.interactive(e.target)||e.button!==0)return;
    const rect=this.surface.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    if((this.settings.hand==='left'&&x>rect.width*.55)||(this.settings.hand==='right'&&x<rect.width*.45)||y<rect.height*.14)return;
    e.preventDefault();this.pointer=e.pointerId;this.touchJoystick=e.pointerType==='touch';this.origin={x,y};this.stick={x:0,y:0};
    try{this.surface.setPointerCapture(e.pointerId);}catch{/* touch fallback still tracks inside surface */}
    this.onJoystick?.({active:true,x,y,dx:0,dy:0});
  };
  private pointerMove=(e:PointerEvent)=>{
    if(!this.enabled||this.interruptSecondaryPress(e)||e.pointerId!==this.pointer)return;
    if(e.pointerType==='mouse'&&(e.buttons&1)===0){this.releaseJoystick();return;}
    e.preventDefault();
    const rect=this.surface.getBoundingClientRect();
    const radius=RADII[this.settings.joystickSize]*.62;
    const x=e.clientX-rect.left,y=e.clientY-rect.top;
    const dx=x-this.origin.x,dy=y-this.origin.y,n=Math.hypot(dx,dy);
    const limit=Math.max(1,n/radius), knobX=dx/limit, knobY=dy/limit;
    // Let the base follow as soon as the stick is at full throw. Reversing starts locally.
    if(n>radius)this.origin={x:x-knobX,y:y-knobY};
    const dead=1.5;
    const travel=Math.max(0,Math.min(1,(n-dead)/(radius-dead)));
    const strength=travel*travel*(3-2*travel);
    this.stick=n?{x:dx/n*strength,y:dy/n*strength}:{x:0,y:0};
    this.onJoystick?.({active:true,x:this.origin.x,y:this.origin.y,dx:knobX,dy:knobY});
  };
  private pointerEnd=(e:PointerEvent)=>{if(e.pointerId===this.pointer)this.releaseJoystick();};
  private captureLost=(e:PointerEvent)=>{if(e.target===this.surface)this.pointerEnd(e);};
  private pointerLeave=(e:PointerEvent)=>{if(e.pointerId===this.pointer&&!this.surface.hasPointerCapture(e.pointerId))this.releaseJoystick();};
  private loseFocus=()=>{this.clear();if(this.enabled)this.onPause();};
  private visibility=()=>{if(document.hidden)this.loseFocus();};
  private screenChanged=()=>{this.calibrated=false;this.clear();if(this.enabled&&this.settings.mode==='tilt')this.onPause();};
  private orientation=(e:DeviceOrientationEvent)=>{
    if(typeof e.beta!=='number'||typeof e.gamma!=='number'||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
    const angle=(screen.orientation?.angle??(window as unknown as {orientation?:number}).orientation??0)*Math.PI/180;
    this.raw={x:e.gamma*Math.cos(angle)+e.beta*Math.sin(angle),y:e.beta*Math.cos(angle)-e.gamma*Math.sin(angle)};
    this.sampleAt=performance.now();this.staleReported=false;
    if(this.permission)for(const finish of [...this.sampleWaiters])finish(true);
  };
}
