import type {Player, Vec} from '../shared/types';
import {CONFIG} from '../core/config';

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const smooth=(t:number)=>t*t*(3-2*t);
const follow=(a:number,b:number,dt:number,seconds:number)=>a+(b-a)*(1-Math.exp(-dt/seconds));
type Side=1|-1;
interface Foot extends Vec {lift:number; pitch:number}
interface Swing {side:Side; start:Vec; end:Vec; age:number; duration:number; height:number}
const sole=(x:number,y:number):Foot=>({x,y,lift:0,pitch:0});

/** Shoes are tracked in world space. A supporting shoe remains planted while the pelvis travels past it. */
export class CourierGait {
  right=sole(0,0);
  left=sole(0,0);
  drive=0;
  weight=0;
  rise=0;
  velocity:Vec={x:0,y:0};
  private last:Vec|null=null;
  private swing:Swing|null=null;
  private next:Side=1;
  private coast=0;

  reset():void {
    this.last=null;this.swing=null;this.next=1;this.drive=0;this.weight=0;this.rise=0;
    this.velocity={x:0,y:0};this.coast=0;
  }

  update(p:Player,dt:number,scale:number,dash:boolean):void {
    const rightHome={x:p.x+5.5*scale,y:p.y+1.2*scale};
    const leftHome={x:p.x-5.5*scale,y:p.y-1.2*scale};
    if(!this.last||Math.hypot(p.x-this.last.x,p.y-this.last.y)>80*scale){
      this.reset();this.right=sole(rightHome.x,rightHome.y);this.left=sole(leftHome.x,leftHome.y);
      this.last={x:p.x,y:p.y};
    }
    if(dt<=0)return;
    const travel={x:p.x-this.last.x,y:p.y-this.last.y};
    this.last={x:p.x,y:p.y};
    const speed=Math.hypot(p.vx,p.vy),running=clamp(speed/CONFIG.player.speed,0,1);
    this.drive=follow(this.drive,running,dt,running>this.drive?.05:.10);
    this.velocity.x=follow(this.velocity.x,p.vx,dt,.047);
    this.velocity.y=follow(this.velocity.y,p.vy,dt,.047);

    if(dash){
      // Both feet leave the ground during the impulse. Carry the trailing legs with the body.
      this.swing=null;this.next=-1;
      const direction=p.dashDirection??p.moveDirection;
      for(const side of [1,-1] as const){
        const foot=side===1?this.right:this.left,home=side===1?rightHome:leftHome;
        const trail=(side===1?4:14)*scale;
        foot.x=follow(foot.x+travel.x,home.x-direction.x*trail,dt,.04);
        foot.y=follow(foot.y+travel.y,home.y-direction.y*trail,dt,.04);
        foot.lift=follow(foot.lift,side===1?10:5,dt,.035);
        foot.pitch=follow(foot.pitch,side===1?-.15:.33,dt,.04);
      }
      this.weight=follow(this.weight,0,dt,.045);this.rise=follow(this.rise,3.4,dt,.04);
      this.coast=0;
      return;
    }

    this.coast+=dt;
    if(!this.swing){
      const rightError=Math.hypot(this.right.x-rightHome.x,this.right.y-rightHome.y);
      const leftError=Math.hypot(this.left.x-leftHome.x,this.left.y-leftHome.y);
      // At low speed, take shorter, less frequent steps. At rest complete the landing
      // of each foot in turn instead of pinning the knees in the last running pose.
      if(speed>4?Math.max(rightError,leftError)>2.2*scale&&this.coast>.024:Math.max(rightError,leftError)>.8*scale){
        const side=speed>4?this.next:rightError>=leftError?1:-1;
        const foot=side===1?this.right:this.left;
        // A shorter stride toward the near/far edges keeps a planted ankle in reach in this projection.
        const depth=speed>4?Math.abs(p.vy)/speed:0;
        const duration=speed>4?clamp(scale*(10+16*running)*(1-.28*depth)/speed,.072,.25):.15;
        this.swing={side,start:{x:foot.x,y:foot.y},end:{x:foot.x,y:foot.y},age:0,duration,
          height:speed>4?2.4+10*running:Math.min(5,Math.max(leftError,rightError)/scale*.3)};
        this.next=side===1?-1:1;
      }
    }
    const swing=this.swing;
    if(!swing){
      for(const foot of [this.right,this.left]){
        foot.lift=follow(foot.lift,0,dt,.03);foot.pitch=follow(foot.pitch,0,dt,.04);
      }
      this.weight=follow(this.weight,0,dt,.09);this.rise=follow(this.rise,0,dt,.08);
      return;
    }
    const foot=swing.side===1?this.right:this.left,stance=swing.side===1?this.left:this.right;
    const home=swing.side===1?rightHome:leftHome;
    // If a turn or the first step leaves the support foot behind, land the swinging
    // foot earlier. Its partner can then take off without stretching the rear leg.
    const stanceHome=swing.side===1?leftHome:rightHome;
    const offsetX=(stance.x-stanceHome.x)/scale,offsetY=(stance.y-stanceHome.y)/scale;
    const receding=offsetX*p.vx+offsetY*p.vy<0;
    const extension=Math.hypot(offsetX/17,offsetY/(offsetY>0?9:15));
    swing.age+=dt*(receding?1+clamp((extension-.55)*2.3,0,2.5):1);
    const t=clamp(swing.age/swing.duration,0,1);
    const weight=smooth(t);
    // Aim for the middle of the following support phase. Only the airborne foot replans a turn.
    const prediction=Math.min(1,speed/(Math.hypot(this.velocity.x,this.velocity.y)||1));
    const lead=speed>4?swing.duration*(1.5-t)*prediction:0;
    swing.end={x:home.x+this.velocity.x*lead,y:home.y+this.velocity.y*lead};
    foot.x=swing.start.x+(swing.end.x-swing.start.x)*weight;
    foot.y=swing.start.y+(swing.end.y-swing.start.y)*weight;
    const arc=Math.sin(Math.PI*t);
    foot.lift=arc*swing.height*(1+.22*Math.cos(Math.PI*t));
    foot.pitch=Math.sin(Math.PI*2*t)*(.13+.37*this.drive);
    stance.lift=follow(stance.lift,0,dt,.028);stance.pitch=follow(stance.pitch,0,dt,.035);
    this.weight=follow(this.weight,-swing.side*arc*this.drive,dt,.035);
    this.rise=follow(this.rise,(2.3-5.2*arc)*this.drive,dt,.027);
    if(t===1){this.swing=null;this.coast=0;}
  }
}
