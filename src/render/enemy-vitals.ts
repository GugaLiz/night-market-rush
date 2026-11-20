import {CONFIG, WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import {giantJumpHeight} from '../core/giant-bun';
import {TOSS_DURATION} from '../core/ultimates';
import {isElite,isEpic,isGuard,type EnemyKind,type GameState} from '../shared/types';

const eliteHeight=152;
const heights={bun:55,onigiri:52,siumai:51,zongzi:58,box:65,bowl:75};
export const enemyHeight = (kind:EnemyKind) => isEpic(kind)?177:isElite(kind)?eliteHeight:heights[kind];

export interface VitalsRect {x:number; y:number; w:number; h:number}
export interface EnemyVitals extends VitalsRect {
  id:number; hp:number; maxHp:number; alpha:number;
}
export interface FallenEnemy {
  id:number; x:number; y:number; kind:EnemyKind; maxHp:number; age:number;
}
const near = (a:VitalsRect,b:VitalsRect) =>
  a.x < b.x+b.w+3 && a.x+a.w+3 > b.x && a.y < b.y+b.h+3 && a.y+a.h+3 > b.y;

export function layoutEnemyVitals(state:GameState, reduced:boolean, fallen:readonly FallenEnemy[], occupied:VitalsRect[]):EnemyVitals[] {
  const {player:p,time}=state;
  const live=state.enemies.filter(e=>e.hp>0 && time-e.spawnAt>=CONFIG.spawn.warning);
  const distance=(e:{x:number;y:number})=>(e.x-p.x)**2+(e.y-p.y)**2;
  // Preview one nearby opponent. Damaged opponents keep their own readouts after leaving combat.
  let nearest:number|null=null, nearestDistance=165**2;
  for(const e of live){
    const d=distance(e);
    if(d<nearestDistance){nearestDistance=d;nearest=e.id;}
  }
  const selected=live.filter(e=>e.hp<e.maxHp || isGuard(e.kind) || e.id===nearest || e.id===state.weapon.targetId);
  selected.sort((a,b)=>Number(isGuard(b.kind))-Number(isGuard(a.kind)) ||
    Number(b.hp<b.maxHp)-Number(a.hp<a.maxHp) || b.hurtAt-a.hurtAt || distance(a)-distance(b));
  const panels:EnemyVitals[]=[];
  function place(id:number,x:number,head:number,feet:number,hp:number,maxHp:number,giant:boolean,alpha:number) {
    const width=giant?106:84, height=giant?25:22, gap=5;
    // At the top of the street there is no room between a tall head and the HUD.
    const below=giant&&head-height-gap<77;
    const anchor=below?feet+gap:head-height-gap;
    // Keep the plaque close to its owner. Compact crowded gauges only when full plaques would overlap.
    for(const [dy,w,h] of [[0,width,height],[-height-3,width,height],[-2*(height+3),width,height],[10,36,8]]){
      if(hp===0 && h<10)continue;
      const panel={id,x:clamp(x-w/2,12,WORLD.width-w-12),y:clamp(anchor+(below?Math.abs(dy):dy),77,WORLD.height-100),w,h,hp,maxHp,alpha};
      if(occupied.some(box=>near(box,panel)))continue;
      panels.push(panel);occupied.push(panel);return true;
    }
    return false;
  }
  for(const e of selected){
    const age=time-(e.tossAt??-Infinity);
    const toss=!reduced && age>=0 && age<TOSS_DURATION ? Math.sin(Math.PI*age/TOSS_DURATION)*(e.tossHeight??0) : 0;
    const lift=giantJumpHeight(e,time)*(reduced?.38:1);
    const markers=(e.bellStunUntil??0)>time?21:e.stunUntil>time && !(e.chilledUntil && e.chilledUntil>time)?15:0;
    place(e.id,e.x,e.y-enemyHeight(e.kind)-lift-toss-markers,e.y,e.hp,e.maxHp,isGuard(e.kind),1);
  }
  // A big sweep can remove an entire pack in one step. Keep the nearest fresh empty plaque.
  const recent=fallen.filter(e=>e.age<.72).sort((a,b)=>a.age-b.age || distance(a)-distance(b));
  for(const e of recent){
    if(place(e.id,e.x,e.y-enemyHeight(e.kind),e.y,0,e.maxHp,isGuard(e.kind),clamp((.72-e.age)/.22,0,1)))break;
  }
  return panels;
}

export function drawEnemyVitals(c:CanvasRenderingContext2D,panels:readonly EnemyVitals[]):void {
  if(!panels.length)return;
  c.save();c.textAlign='right';c.textBaseline='middle';c.lineJoin='round';
  for(const {x,y,w,h,hp,maxHp,alpha} of panels){
    const numbered=h>10,pad=numbered?2.8:1.6,innerW=w-pad*2,innerH=h-pad*2;
    function pill(left:number,top:number,width:number,height:number,radius:number,color:string){
      c.fillStyle=color;c.beginPath();c.roundRect(left,top,width,height,radius);c.fill();
    }
    c.globalAlpha=alpha;
    pill(x,y+1.8,w,h,h/2,'#553327');
    pill(x,y,w,h,h/2,'#edc594');
    pill(x+.65,y+.45,w-1.3,h-2.6,(h-2.6)/2,'#ffe7be');
    pill(x+pad,y+pad,innerW,innerH,innerH/2,'#4a2e25');
    if(hp>0){
      const fill=innerW*clamp(hp/maxHp,0,1);
      c.save();c.clip();
      pill(x+pad,y+pad,fill,innerH,Math.min(fill/2,3.6),'#d65035');
      pill(x+pad,y+pad,fill,innerH-1.8,Math.min(fill/2,3.6),'#ff8254');
      c.restore();
    }
    if(numbered){
      const value=Math.ceil(hp)+'/'+maxHp;
      const tx=x+w-8,ty=y+h*.51;
      c.font='900 '+(h>22?16:14)+'px system-ui,sans-serif';
      c.strokeStyle='#543327';c.lineWidth=2.4;c.strokeText(value,tx,ty);
      c.fillStyle='#fff0cf';c.fillText(value,tx,ty);
    }
  }
  c.restore();
}
