import {ULTIMATE_KINDS,WEAPON_KINDS,isGuard,type DamageSource,type Enemy,type EnemyKind,type GameEvent,type WeaponKind} from '../domain/shared/types';

export interface EnemyContact {id:number;at:number;angle:number;source:DamageSource}
export interface EnemyFall {id:number;x:number;y:number;kind:EnemyKind;facing:number;at:number;duration:number;angle:number;distance:number;source?:DamageSource;clear:boolean}
type Snapshot=Pick<Enemy,'id'|'x'|'y'|'kind'|'facing'>;
const pressTime=.042;

/** Event-driven presentation state; does not retain or mutate simulation objects. */
export class EnemyFeedbackModel {
  private readonly contacts=new Map<number,EnemyContact>();
  private falls:EnemyFall[]=[];
  private previous=new Map<number,Snapshot>();
  private killed=new Set<number>();
  private recentDefeats:Array<{x:number;y:number;time:number}>=[];

  events(events:readonly GameEvent[],time:number):void {
    const defeated=events.filter((event):event is Extract<GameEvent,{type:'kill'}>=>event.type==='kill');
    if(defeated.length){
      this.recentDefeats=this.recentDefeats.filter(item=>item.time>=time-.15&&item.time<=time);
      for(const event of defeated)this.recentDefeats.push({x:event.x,y:event.y,time});
    }
    const first=defeated[0],group=first?this.recentDefeats.filter(item=>Math.hypot(item.x-first.x,item.y-first.y)<300):[];
    const crowd=group.length>=3;
    const origin=crowd?{x:group.reduce((sum,item)=>sum+item.x,0)/group.length,y:group.reduce((sum,item)=>sum+item.y,0)/group.length}:{x:0,y:0};
    for(const event of events){
      if(event.type==='damage'&&event.victimId!==0&&(event.burstIndex??1)===1){
        this.contacts.set(event.victimId,{id:event.victimId,at:time,angle:event.impactAngle??0,source:event.source});
      }else if(event.type==='kill'){
        const id=event.victimId??-(this.falls.length+1),seed=event.victimId??Math.round(event.x),ultimate=ULTIMATE_KINDS.some(k=>k===event.source);
        const reaction=event.source==='tongs'||event.source==='chopsticks'||event.source==='fan'?event.source:undefined;
        const hit=this.contacts.get(id);
        // The Web renderer records directional contacts only for weapons and
        // fan hits; other damage should use the group-centre launch direction.
        const previous=hit&&(hit.source==='fan'||WEAPON_KINDS.includes(hit.source as WeaponKind))?hit:undefined;
        const launched=ultimate||crowd&&Math.hypot(origin.x-event.x,origin.y-event.y)<260;
        const singleDistance=reaction==='fan'?50:reaction==='tongs'?40:reaction==='chopsticks'?30:previous?22:12;
        const distance=ultimate?(event.source==='berry'?65:48)+seed%23:launched?Math.max(singleDistance,42+seed%29):singleDistance;
        const angle=event.impactAngle??previous?.angle??(launched?Math.atan2(event.y-origin.y,event.x-origin.x)+Math.sin(seed)*.24:seed*2.4);
        this.falls.push({id,x:event.x,y:event.y,kind:event.kind,facing:event.facing??1,at:time,
          duration:event.source==='vortex'?.27:ultimate?.46:launched?.41:reaction==='tongs'?.35:.25,
          angle,distance,source:event.source,clear:false});
        this.killed.add(id);this.contacts.delete(id);
      }
    }
    if(this.falls.length>64)this.falls=this.falls.slice(-64);
  }
  /** Detect removals without kill events, such as helper cleanup or arena clear. */
  sync(enemies:readonly Enemy[],time:number):readonly EnemyFall[] {
    const next=new Map<number,Snapshot>();
    for(const e of enemies)next.set(e.id,{id:e.id,x:e.x,y:e.y,kind:e.kind,facing:e.facing});
    for(const [id,e] of this.previous){
      if(!next.has(id)&&!this.killed.has(id))this.falls.push({...e,at:time,duration:.25,angle:0,distance:0,clear:true});
    }
    this.previous=next;this.killed.clear();
    this.falls=this.falls.filter(e=>time>=e.at&&time-e.at<e.duration).slice(-64);
    for(const [id,c] of this.contacts)if(time<c.at||time-c.at>=.27)this.contacts.delete(id);
    return this.falls;
  }
  contact(id:number,time:number):EnemyContact|undefined {
    const hit=this.contacts.get(id);return hit&&time>=hit.at&&time-hit.at<.27?hit:undefined;
  }
  reset():void {this.contacts.clear();this.falls=[];this.previous.clear();this.killed.clear();this.recentDefeats=[];}
}

export function enemyRecoil(hit:EnemyContact|undefined,time:number,reduced:boolean):{x:number;y:number;squash:number;tilt:number} {
  if(!hit||reduced)return {x:0,y:0,squash:0,tilt:0};
  const age=Math.max(0,time-hit.at-(hit.source==='tongs'?pressTime:0)),t=Math.min(1,age/.21);
  const impulse=Math.sin(Math.PI*t)*(1-t);
  return {x:Math.cos(hit.angle)*impulse*13,y:Math.sin(hit.angle)*impulse*9,squash:impulse*.08,tilt:Math.cos(hit.angle)*impulse*.18};
}

export function enemyFallPose(fall:EnemyFall,time:number,reduced:boolean):{x:number;y:number;groundY:number;ghostY:number;scale:number;angle:number;alpha:number;ghost:boolean;ghostAlpha:number} {
  const age=Math.max(0,time-fall.at),progress=Math.min(1,age/fall.duration),delay=fall.source==='tongs'?pressTime:0;
  const motion=reduced||fall.clear?0:Math.min(1,Math.max(0,(age-delay)/(fall.duration-delay)));
  const vortex=fall.source==='vortex',push=vortex?0:1-(1-motion)**2;
  const hop=vortex?0:Math.sin(motion*Math.PI)*fall.distance*(fall.source==='chopsticks'?.35:.82);
  const groundY=fall.y+Math.sin(fall.angle)*fall.distance*push*.6;
  return {x:fall.x+Math.cos(fall.angle)*fall.distance*push,
    y:groundY-hop,groundY,ghostY:groundY-hop*.70,
    scale:fall.source==='vortex'&&!reduced?.45*(1-progress):1+Math.sin(motion*Math.PI)*.08-motion*.34,
    angle:reduced?0:fall.source==='vortex'?(fall.id%2===0?.45:-.45)*(1+progress):Math.cos(fall.angle)*motion*(fall.distance>35?1.25:.45),
    alpha:reduced||fall.clear||vortex?1-progress:(1-motion)*.96,ghost:!vortex&&!reduced&&!fall.clear&&fall.distance>35&&motion>0,ghostAlpha:(1-progress)*.25};
}

export function fallenSprite(kind:EnemyKind,source?:DamageSource):string {
  return source==='vortex'||isGuard(kind)&&kind!=='giantBun'?kind:kind+(kind==='box'||kind==='bowl'?'Low':'Hurt');
}
