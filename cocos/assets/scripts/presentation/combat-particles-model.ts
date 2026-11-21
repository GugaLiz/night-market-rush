import {WEAPONS} from '../domain/core/weapons';
import {ULTIMATE_KINDS,type GameEvent,type Settings} from '../domain/shared/types';

interface Burst {x:number;y:number;at:number;count:number;color:string;seed:number}
interface Particle {x:number;y:number;vx:number;vy:number;at:number;duration:number;size:number;color:string}
export interface ParticleVisual {x:number;y:number;radius:number;alpha:number;color:string}
const snackKinds=new Set(['bun','onigiri','siumai','zongzi','box','bowl']);

/** Bounded, presentation-only version of the Web renderer's event bursts. */
export class CombatParticlesModel {
  private readonly pending:Burst[]=[];
  private particles:Particle[]=[];
  private recent:Array<{x:number;y:number;time:number}>=[];
  private sequence=0;

  events(events:readonly GameEvent[],time:number):void {
    const defeats=events.filter((e):e is Extract<GameEvent,{type:'kill'}>=>e.type==='kill');
    if(defeats.length){
      this.recent=this.recent.filter(item=>item.time>=time-.15&&item.time<=time);
      for(const e of defeats)this.recent.push({x:e.x,y:e.y,time});
      if(this.recent.length>256)this.recent.splice(0,this.recent.length-256);
    }
    const first=defeats[0],group=first?this.recent.filter(item=>Math.hypot(item.x-first.x,item.y-first.y)<300):[];
    const crowd=group.length>=3;
    const center=crowd?{x:group.reduce((n,item)=>n+item.x,0)/group.length,y:group.reduce((n,item)=>n+item.y,0)/group.length}:{x:0,y:0};
    const add=(x:number,y:number,color:string,count:number)=>{
      const seed=(Math.imul(++this.sequence,0x9e3779b1)^Math.round(x*17)^Math.round(y*31)^Math.round(time*1000))>>>0;
      this.pending.push({x,y,at:time,color,count,seed:seed||1});
    };
    for(const event of events){
      if(event.type==='coin')add(event.x,event.y-8,'#ffe49a',5);
      else if(event.type==='kill'){
        if(event.source==='vortex')continue;
        const ultimate=ULTIMATE_KINDS.some(kind=>kind===event.source);
        const launched=ultimate||crowd&&Math.hypot(center.x-event.x,center.y-event.y)<260;
        add(event.x,event.y-16,launched?'#ffdb86':'#ffe6a0',launched?5:4);
      }else if(event.type==='damage'){
        if((event.burstIndex??1)!==1)continue;
        if(event.victimId===0){
          const kind=event.source==='dash'?'box':event.source;
          add(event.x,event.y-25,'#ff907e',snackKinds.has(kind)?4:10);
        }else if(Object.prototype.hasOwnProperty.call(WEAPONS,event.source)||event.source==='fan'||event.source==='frost'||event.source==='vortex')continue;
        else if(event.source==='poison')add(event.x,event.y-18,'#c9f17d',3);
        else add(event.x,event.y-25,'#fff1bd',4);
      }else if(event.type==='dash')add(event.x,event.y-6,'#bff4e3',10);
      else if(event.type==='weapon')add(event.x,event.y-25,'#ffe1a3',12);
      else if(event.type==='fail')add(event.x,event.y-20,'#ffb079',22);
    }
    if(this.pending.length>160)this.pending.splice(0,this.pending.length-160);
  }

  update(time:number,settings:Pick<Settings,'quality'|'reduceMotion'>):ParticleVisual[] {
    for(let i=0;i<this.pending.length;){
      const burst=this.pending[i];if(time<burst.at){i++;continue;}
      this.pending.splice(i,1);
      if(settings.reduceMotion||time-burst.at>=.7)continue;
      const count=settings.quality==='simple'?Math.ceil(burst.count/3):burst.count;
      let seed=burst.seed;
      const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/0x100000000;};
      for(let j=0;j<count;j++){
        const angle=j*Math.PI*2/count,speed=30+random()*80;
        this.particles.push({x:burst.x,y:burst.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30,
          at:burst.at,duration:.35+random()*.35,size:1.5+random()*2.5,color:burst.color});
      }
    }
    if(this.particles.length>160)this.particles.splice(0,this.particles.length-160);
    this.particles=this.particles.filter(p=>time<p.at||time-p.at<p.duration);
    if(settings.reduceMotion)return [];
    return this.particles.filter(p=>time>=p.at).map(p=>{
      const age=time-p.at,progress=age/p.duration;
      return {x:p.x+p.vx*age,y:p.y+p.vy*age+35*age*age,radius:p.size*(1-.4*progress),alpha:1-progress,color:p.color};
    });
  }
  reset():void {this.pending.length=0;this.particles=[];this.recent=[];this.sequence=0;}
}
