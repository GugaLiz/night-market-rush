import type {Enemy,EnemyKind,EpicKind,GameEvent,GameState,GuardCast,GuardMark,GuardShape,Player,Vec} from '../shared/types';
import {isEpic} from '../shared/types';
import {CONFIG,WORLD,enemyMinY} from './config';
import {clamp,distanceSquared,relativeSweep,segmentDistanceSquared,sweepContact} from './geometry';

// Reach is the distance at which a guard plants its feet. Recovery starts after the last strike.
const guards={
  eliteSkewer:{reach:570,recovery:1.6}, eliteLotus:{reach:280,recovery:1.9},
  eliteChili:{reach:315,recovery:1.5}, eliteTofu:{reach:640,recovery:2},
  eliteTanghulu:{reach:720,recovery:2}, eliteRoll:{reach:565,recovery:1.8},
  epicHotpot:{reach:1250,recovery:1.45}, epicDragon:{reach:670,recovery:1.15},
  epicOpera:{reach:575,recovery:1.35}, epicPearl:{reach:1250,recovery:1.5},
  epicSteamer:{reach:690,recovery:1.5},
} as const;
type GuardKind=keyof typeof guards;
export function hasGuardAttacks(kind:EnemyKind):kind is GuardKind{return Object.hasOwn(guards,kind);}

export const GUARD_HELPERS={
  epicHotpot:'siumai',epicDragon:'zongzi',epicOpera:'box',epicPearl:'onigiri',epicSteamer:'bun',
} as const satisfies Record<EpicKind,EnemyKind>;
const MAX_LIVE_HELPERS=4,MAX_TOTAL_HELPERS=9;
const point=(v:Vec):Vec=>({x:v.x,y:v.y});
const towards=(p:Vec,angle:number,length:number):Vec=>({x:p.x+Math.cos(angle)*length,y:p.y+Math.sin(angle)*length});
const interpolate=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const disc=(center:Vec,radius:number):GuardShape=>({kind:'disc',center:point(center),radius,inner:0});
const ring=(center:Vec,inner:number,radius:number):GuardShape=>({kind:'ring',center:point(center),radius,inner});
const lane=(from:Vec,to:Vec,radius:number):GuardShape=>({kind:'lane',from:point(from),to:point(to),radius});
const fan=(center:Vec,angle:number,halfAngle:number,radius:number):GuardShape=>({kind:'fan',center:point(center),angle,halfAngle,radius});

function withinFloor(at:Vec,kind:EnemyKind):Vec{
  const r=CONFIG.enemies[kind].radius,b=WORLD.bounds;
  return {x:clamp(at.x,b.left+r,b.right-r),y:clamp(at.y,enemyMinY(kind,r),b.bottom-r)};
}

function helperSlots(s:GameState,owner:Enemy,cap:number):number{
  const live=s.enemies.filter(e=>e.summonerId===owner.id&&e.hp>0).length;
  return Math.min(MAX_TOTAL_HELPERS-(owner.guardSummoned??0),cap-s.enemies.length,MAX_LIVE_HELPERS-live);
}

function helperSites(s:GameState,owner:Enemy,kind:EnemyKind,cap:number):Vec[]{
  const count=Math.min(3,helperSlots(s,owner,cap));
  const sites:Vec[]=[],r=CONFIG.enemies[kind].radius;
  const start=Math.atan2(s.player.y-owner.y,s.player.x-owner.x)+Math.PI;
  for(let i=0;i<12&&sites.length<count;i++){
    const at=withinFloor(towards(owner,start+i*5*Math.PI/6,132+(i%2)*36),kind);
    if(distanceSquared(s.player,at)<(CONFIG.spawn.safeDistance+s.player.radius+r)**2)continue;
    if(s.enemies.some(e=>distanceSquared(e,at)<(e.radius+r+18)**2))continue;
    if(sites.some(site=>distanceSquared(site,at)<(2*r+18)**2))continue;
    sites.push(at);
  }
  return sites;
}

/** The warning is the exact swept lane. Once it fires, only the rolling body can hit. */
export function guardShapeAt(mark:GuardMark,time:number):GuardShape{
  if(!mark.rush||mark.shape.kind!=='lane'||time<mark.hitAt)return mark.shape;
  return disc(interpolate(mark.shape.from,mark.shape.to,clamp((time-mark.hitAt)/(mark.endAt-mark.hitAt),0,1)),mark.shape.radius);
}

function makeCast(s:GameState,e:Enemy,kind:GuardKind,cap:number):GuardCast{
  const turn=e.guardTurn??0,marks:GuardMark[]=[];
  const angle=Math.atan2(s.player.y-e.y,s.player.x-e.x),side=turn%2?1:-1;
  const at=point(e),target=point(s.player);
  let name='';
  function strike(shape:GuardShape,warning:number,delay:number,duration:number,damage:number):GuardMark{
    const warnAt=s.time+delay,hitAt=warnAt+warning;
    const mark={shape,warnAt,hitAt,endAt:hitAt+duration,damage};
    marks.push(mark);
    return mark;
  }
  function grill(center:Vec,direction:number,spacing:number,length:number,width:number,damage:number){
    for(const offset of [-spacing,0,spacing]){
      const p=towards(center,direction+Math.PI/2,offset);
      strike(lane(towards(p,direction,-length),towards(p,direction,length),width),.95,0,.52,damage);
    }
  }
  function roll(points:Vec[],windup:number,duration:number,radius:number,damage:number){
    let start=at;
    for(const [i,end] of points.entries()){
      // Show the whole itinerary before the first crossing. Later sections pulse in sequence.
      strike(lane(start,end,radius),windup+i*duration,0,duration,damage).rush=true;
      start=end;
    }
  }
  function pathBend(a:Vec,b:Vec,offset:number,weight:number):Vec{
    const mid=interpolate(a,b,weight),normal=angle+Math.PI/2;
    const plus=withinFloor(towards(mid,normal,offset),kind);
    if(distanceSquared(plus,mid)>offset*offset*.72)return plus;
    return withinFloor(towards(mid,normal,-offset),kind);
  }
  if(isEpic(kind)&&turn%3===2){
    const helper=GUARD_HELPERS[kind];
    for(const site of helperSites(s,e,helper,cap)){
      strike(disc(site,CONFIG.enemies[helper].radius+14),1.05,0,.35,0).summon=helper;
    }
    if(marks.length)name='开摊招伙';
  }
  if(!marks.length)switch(kind){
    case 'eliteSkewer':{
      name='双签穿串';
      strike(lane(at,towards(at,angle,635),17),.77,0,.20,19);
      const flank=towards(at,angle+Math.PI/2,side*61);
      strike(lane(flank,towards(flank,angle,610),18),.80,.32,.20,19);
      break;
    }
    case 'eliteLotus':
      name='藕鼓两响';
      strike(ring(at,66,152),.80,0,.32,18);
      strike(ring(at,177,302),.84,.45,.36,21);
      break;
    case 'eliteChili':
      name='双袖辣风';
      strike(fan(at,angle+side*.32,.66,328),.74,0,.26,19);
      strike(fan(at,angle-side*.80,.62,355),.77,.48,.32,20);
      break;
    case 'eliteTofu':
      name='铁板三烙';grill(target,turn%2?0:Math.PI/2,106,235,21,22);break;
    case 'eliteTanghulu':
      name='糖珠三落';
      for(const [i,offset] of [-76,0,76].entries())
        strike(disc(towards(target,angle,offset),53),.86,.29*i,.35,20);
      break;
    case 'eliteRoll':{
      name='折返海苔卷';
      const end=withinFloor(towards(target,angle,78),kind);
      roll([pathBend(at,end,90*side,.45),end],.92,.35,e.radius+5,25);
      break;
    }
    case 'epicHotpot':
      if(turn%3===1){
        name='沸锅翻浪';
        strike(ring(at,76,223),.88,0,.44,27);
        strike(ring(at,251,403),.9,.48,.46,28);
      }else{
        name='鸳鸯双沸';
        strike(disc(towards(target,angle+Math.PI/2,-68),109),1,0,.78,27);
        strike(disc(towards(target,angle+Math.PI/2,68),109),1,.52,.82,29);
      }
      break;
    case 'epicDragon':
      if(turn%3===1){
        name='糖火龙息';
        for(const spread of [-.41,0,.41])strike(lane(at,towards(at,angle+spread,770),23),.84,0,.48,25);
      }else{
        name='游龙走糖';
        const end=withinFloor(towards(target,angle,74),kind);
        roll([pathBend(at,end,87*side,.32),pathBend(at,end,-76*side,.66),end],1,.29,e.radius+4,28);
      }
      break;
    case 'epicOpera':
      if(turn%3===1){
        name='变脸双扇';
        strike(fan(at,angle+side*.35,.85,385),.85,0,.3,26);
        strike(fan(at,angle-side*.64,.70,450),.87,.52,.35,28);
      }else{
        name='十字削面';
        for(const [i,offset] of [0,Math.PI/2].entries()){
          const axis=angle+offset;
          strike(lane(towards(target,axis,-300),towards(target,axis,300),26),.85,.25*i,.34,27);
        }
      }
      break;
    case 'epicPearl':
      if(turn%3===1){
        name='杯沿回旋';
        strike(ring(target,98,213),.95,0,.52,27);
        strike(disc(target,74),.9,.78,.32,25);
      }else{
        name='黑糖珍珠雨';
        strike(disc(target,61),.92,0,.35,25);
        for(let i=0;i<5;i++)strike(disc(towards(target,angle+i*2*Math.PI/5,111),50),.9,.21+i*.12,.37,24);
      }
      break;
    case 'epicSteamer':
      if(turn%3===1){
        name='笼屉放汽';grill(target,Math.PI/2,135,320,27,28);
      }else{
        name='三屉冲顶';
        for(const [i,inner] of [58,209,360].entries())
          strike(ring(at,inner,inner+93),.94,.42*i,.42,26+i*2);
      }
      break;
  }
  return {name,startsAt:s.time,endsAt:Math.max(...marks.map(m=>m.endAt)),marks};
}

type SpawnEnemy=(kind:EnemyKind,at:Vec)=>Enemy;
/** Returns true while the guard is planted or following its locked movement pattern. */
export function updateGuard(s:GameState,e:Enemy,kind:GuardKind,pursuing:boolean,distance:number,dt:number,cap:number,spawn:SpawnEnemy,emit:(event:GameEvent)=>void):boolean{
  let cast=e.guardCast;
  if(!cast){
    if(!pursuing||distance>guards[kind].reach||s.time<(e.shotReadyAt??0))return false;
    cast=e.guardCast=makeCast(s,e,kind,cap);
    e.guardTurn=(e.guardTurn??0)+1;
    if(e.x!==s.player.x)e.facing=e.x<s.player.x?1:-1;
    emit({type:'warn',x:e.x,y:e.y});
  }
  for(const mark of cast.marks){
    if(s.time<mark.hitAt)continue;
    if(mark.rush&&mark.shape.kind==='lane'&&s.time-dt<mark.endAt){
      const body=guardShapeAt(mark,s.time);
      if(body.kind==='disc'){
        if(Math.abs(body.center.x-e.x)>.01)e.facing=body.center.x>e.x?1:-1;
        e.x=body.center.x;e.y=body.center.y;
      }
    }
    if(mark.summon&&!mark.spent&&mark.shape.kind==='disc'){
      mark.spent=true;
      const kind=mark.summon,at=mark.shape.center,r=CONFIG.enemies[kind].radius;
      if(helperSlots(s,e,cap)>0&&distanceSquared(s.player,at)>(s.player.radius+r+32)**2&&
         !s.enemies.some(other=>distanceSquared(other,at)<(other.radius+r+4)**2)){
        const ally=spawn(kind,at);
        ally.summonerId=e.id;ally.spawnAt=s.time;
        const d=Math.hypot(s.player.x-at.x,s.player.y-at.y);
        ally.march={x:(s.player.x-at.x)/d,y:(s.player.y-at.y)/d,until:s.time+CONFIG.spawn.warning+1.8};
        e.guardSummoned=(e.guardSummoned??0)+1;
        emit({type:'spawn',...at});
        if(isEpic(e.kind)&&!cast.beatSent){
          cast.beatSent=true;
          emit({type:'guardBeat',kind:e.kind,beat:'summon',...at});
        }
      }
    }
  }
  if(s.time-dt>=cast.endsAt){
    delete e.guardCast;e.shotReadyAt=s.time+guards[kind].recovery;
    e.contactSuppressedUntil=Math.max(e.contactSuppressedUntil,s.time+.35);
  }
  return true;
}

// Earliest contact with the two round ends or the straight part of a capsule.
function capsuleContact(start:Vec,end:Vec,from:Vec,to:Vec,radius:number):number|null{
  if(segmentDistanceSquared(from,to,start)<=radius*radius)return 0;
  const length=Math.hypot(to.x-from.x,to.y-from.y);
  let first=Math.min(sweepContact(start,end,from,radius)??Infinity,sweepContact(start,end,to,radius)??Infinity);
  if(length>1e-9){
    const ux=(to.x-from.x)/length,uy=(to.y-from.y)/length;
    const normal=(p:Vec)=>(p.y-from.y)*ux-(p.x-from.x)*uy;
    const a=normal(start),delta=normal(end)-a;
    if(Math.abs(delta)>1e-9)for(const edge of [-radius,radius]){
      const t=(edge-a)/delta;
      if(t<0||t>1||t>=first)continue;
      const p=interpolate(start,end,t),along=(p.x-from.x)*ux+(p.y-from.y)*uy;
      if(along>=0&&along<=length)first=t;
    }
  }
  return Number.isFinite(first)?first:null;
}

function shapeContact(shape:GuardShape,start:Vec,end:Vec,r:number):number|null{
  if(shape.kind==='lane')return capsuleContact(start,end,shape.from,shape.to,shape.radius+r);
  const t=sweepContact(start,end,shape.center,shape.radius+r);
  if(t===null)return null;
  if(shape.kind==='fan'){
    const p=interpolate(start,end,t),dx=p.x-shape.center.x,dy=p.y-shape.center.y;
    if(dx*Math.cos(shape.angle)+dy*Math.sin(shape.angle)>=Math.hypot(dx,dy)*Math.cos(shape.halfAngle))return t;
    const left=towards(shape.center,shape.angle-shape.halfAngle,shape.radius);
    const right=towards(shape.center,shape.angle+shape.halfAngle,shape.radius);
    const edge=Math.min(capsuleContact(start,end,shape.center,left,r)??Infinity,capsuleContact(start,end,shape.center,right,r)??Infinity);
    return Number.isFinite(edge)?edge:null;
  }
  const inside=Math.max(0,shape.inner-r);
  if(shape.kind==='disc'||distanceSquared(start,shape.center)>=inside**2)return t;
  if(distanceSquared(end,shape.center)<inside**2)return null;
  // Start is in the hole. Tracing backwards finds the exact time it crosses the inner rim.
  return 1-(sweepContact(end,start,shape.center,inside)??0);
}

export function guardMarkContact(mark:GuardMark,p:Player,time:number,dt:number):number|null{
  if(mark.spent||mark.damage===0||time<mark.hitAt||time-dt>=mark.endAt)return null;
  const low=clamp((mark.hitAt-(time-dt))/dt,0,1),high=clamp((mark.endAt-(time-dt))/dt,0,1);
  const prev={x:p.px,y:p.py},start=interpolate(prev,p,low),end=interpolate(prev,p,high);
  let touch:number|null;
  if(mark.rush&&mark.shape.kind==='lane'){
    const shape=mark.shape;
    const center=(fraction:number)=>interpolate(shape.from,shape.to,clamp((time-dt+dt*fraction-mark.hitAt)/(mark.endAt-mark.hitAt),0,1));
    touch=relativeSweep(start,end,center(low),center(high),p.radius+shape.radius);
  }else touch=shapeContact(mark.shape,start,end,p.radius);
  return touch===null?null:low+touch*(high-low);
}
