import type {Player, Vec} from '../shared/types';
import {CONFIG} from '../core/config';

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const smooth=(t:number)=>t*t*(3-2*t);
const follow=(a:number,b:number,dt:number,seconds:number)=>a+(b-a)*(1-Math.exp(-dt/seconds));
// Ease off the planted toe and onto the heel, with room for a steady transfer in between.
function swingTravel(t:number):number {
  const ramp=.25;
  if(t>=ramp && t<=1-ramp) return (t-ramp/2)/(1-ramp);
  const edge=Math.min(t,1-t);
  const travelled=(edge-ramp/Math.PI*Math.sin(Math.PI*edge/ramp))/(2*(1-ramp));
  return t<.5?travelled:1-travelled;
}
// Time before the fixed support shoe leaves the pelvis's reachable stride ellipse.
function supportTime(foot:Vec,home:Vec,p:Player,scale:number):number {
  const horizontal=21*scale,vertical=(p.vy<0?9:19)*scale;
  const x=(foot.x-home.x)/horizontal,y=(foot.y-home.y)/vertical;
  const vx=-p.vx/horizontal,vy=-p.vy/vertical,speed=vx*vx+vy*vy;
  if(speed<1e-6)return Infinity;
  const projection=x*vx+y*vy;
  return Math.max(0,(-projection+Math.sqrt(Math.max(0,projection*projection+speed*(1-x*x-y*y))))/speed);
}
type Side=1|-1;
interface Foot extends Vec {lift:number; pitch:number}
interface Swing {side:Side; start:Foot; end:Vec; heading:Vec; age:number; duration:number; height:number}
const sole=(x:number,y:number):Foot=>({x,y,lift:0,pitch:0});
const idleWeight=-.22;

/** Shoes are tracked in world space. A supporting shoe remains planted while the pelvis travels past it. */
export class CourierGait {
  right=sole(0,0);
  left=sole(0,0);
  drive=0;
  weight=idleWeight;
  rise=0;
  velocity:Vec={x:0,y:0};
  private last:Vec|null=null;
  private swing:Swing|null=null;
  private next:Side=1;
  private carry=0;

  reset():void {
    this.last=null;this.swing=null;this.next=1;this.drive=0;this.weight=idleWeight;this.rise=0;
    this.velocity={x:0,y:0};this.carry=0;
  }

  update(p:Player,dt:number,scale:number,dash:boolean):void {
    const rightHome={x:p.x+8*scale,y:p.y+2*scale};
    const leftHome={x:p.x-8*scale,y:p.y-2*scale};
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
      this.carry=0;
      return;
    }

    const walking=speed>4;
    const depth=walking?Math.abs(p.vy)/speed:0;
    // A depth step appears shorter in the overhead view. Shift its centre slightly
    // up-screen, keeping the near-side knee clear of full extension at touchdown.
    const depthOffset=depth*running*5.2*scale;
    rightHome.y-=depthOffset;leftHome.y-=depthOffset;
    // Reverse from the airborne shoe's current position and finish a short pivot
    // step. Landing at the old forward target would strand both legs behind the turn.
    const heading=this.swing?.heading;
    const movingSwing=heading && (heading.x!==0 || heading.y!==0);
    const pivot=movingSwing && walking && heading.x*p.vx+heading.y*p.vy < .48*speed;
    const stopping=movingSwing && !walking;
    if((pivot||stopping) && this.swing){
      this.next=this.swing.side;this.swing=null;this.carry=0;
    }
    if(!this.swing){
      const rightError=Math.hypot(this.right.x-rightHome.x,this.right.y-rightHome.y);
      const leftError=Math.hypot(this.left.x-leftHome.x,this.left.y-leftHome.y);
      const error=Math.max(rightError,leftError);
      const threshold=walking?(4.4-2.5*running)*scale:.45*scale;
      if(pivot || stopping || error>threshold){
        let side=walking||stopping?this.next:rightError>=leftError?1:-1;
        if(walking && !pivot){
          const rightRoom=supportTime(this.right,rightHome,p,scale),leftRoom=supportTime(this.left,leftHome,p,scale);
          if(Math.abs(rightRoom-leftRoom)>.045)side=rightRoom<leftRoom?1:-1;
        }
        const foot=side===1?this.right:this.left;
        const home=side===1?rightHome:leftHome;
        const support=side===1?this.left:this.right,supportHome=side===1?leftHome:rightHome;
        const duration=walking?Math.min(pivot?.064:clamp(scale*(10+20*running)*(1-.16*depth)/speed,.075,.29),
          Math.max(.047,supportTime(support,supportHome,p,scale)+dt)):.14;
        // The game position is already at the end of this frame. Predict a
        // world-space touchdown half a support phase ahead of the body.
        const age=Math.min(this.carry,duration*.16);
        const lead=walking?Math.max(0,1.5*duration-age-dt):0;
        this.swing={side,start:{...foot},end:{x:home.x+p.vx*lead,y:home.y+p.vy*lead},age,duration,
          heading:walking?{x:p.vx/speed,y:p.vy/speed}:{x:0,y:0},
          height:pivot?3.5:walking?2.3+9.5*Math.sqrt(running):Math.min(4.6,error/scale*.32)};
        this.next=side===1?-1:1;
      }else this.carry=0;
    }
    const swing=this.swing;
    if(!swing){
      for(const foot of [this.right,this.left]){
        foot.lift=follow(foot.lift,0,dt,.03);foot.pitch=follow(foot.pitch,0,dt,.04);
      }
      this.weight=follow(this.weight,idleWeight,dt,.11);this.rise=follow(this.rise,0,dt,.08);
      return;
    }
    const foot=swing.side===1?this.right:this.left,stance=swing.side===1?this.left:this.right;
    const home=swing.side===1?rightHome:leftHome;
    // An accelerating first step or a sharp corner can exhaust the stance shoe's
    // reach before the planned touchdown. Bring the airborne heel down in time.
    const stanceHome=swing.side===1?leftHome:rightHome;
    const remaining=swing.duration-swing.age;
    swing.age+=dt*clamp(remaining/(dt+supportTime(stance,stanceHome,p,scale)),1,1.5);
    const t=clamp(swing.age/swing.duration,0,1);
    // A toe may redirect early in the swing, but its world landing is committed
    // before the heel comes down. A changing input cannot drag a landing shoe.
    if(t<.72){
      const lead=walking?swing.duration*(1.5-t):0;
      const turn=1-Math.exp(-dt*22*(1-smooth(t/.72)));
      swing.end.x+=(home.x+p.vx*lead-swing.end.x)*turn;
      swing.end.y+=(home.y+p.vy*lead-swing.end.y)*turn;
    }
    const step=swingTravel(t);
    foot.x=swing.start.x+(swing.end.x-swing.start.x)*step;
    foot.y=swing.start.y+(swing.end.y-swing.start.y)*step;
    const arc=Math.sin(Math.PI*t);
    foot.lift=(1-step)*swing.start.lift+arc**1.35*swing.height*(1+.16*Math.cos(Math.PI*t));
    foot.pitch=(1-step)*swing.start.pitch+Math.sin(Math.PI*2*t)*arc*(.16+.36*this.drive);
    stance.lift=follow(stance.lift,0,dt,.028);stance.pitch=follow(stance.pitch,0,dt,.035);
    this.weight=follow(this.weight,-swing.side*arc*Math.max(.32,this.drive),dt,.043);
    this.rise=follow(this.rise,(1.8-4.3*arc)*this.drive,dt,.035);
    if(t===1){this.swing=null;this.carry=Math.min(dt,swing.age-swing.duration);}
  }
}
