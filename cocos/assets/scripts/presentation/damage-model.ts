import {CONFIG, WORLD} from '../domain/core/config';
import {clamp} from '../domain/core/geometry';
import {giantJumpHeight} from '../domain/core/giant-bun';
import {TOSS_DURATION} from '../domain/core/ultimates';
import {isElite, isEpic, isGuard, type DamageSource, type EnemyKind, type GameEvent, type GameState} from '../domain/shared/types';

/** Renderer-independent measurements shared by Web and Cocos. */
const heights={bun:55,onigiri:52,siumai:51,zongzi:58,box:65,bowl:75};
export const enemyHeight=(kind:EnemyKind)=>isEpic(kind)?177:isElite(kind)?152:heights[kind as keyof typeof heights];
export const PLAYER_LABEL_WIDTH=104,PLAYER_LABEL_HEIGHT=30,PLAYER_LABEL_LIFETIME=1.05;
export interface VitalsRect {x:number;y:number;w:number;h:number}
export interface EnemyVitals extends VitalsRect {id:number;hp:number;maxHp:number;alpha:number}
export interface FallenEnemy {id:number;x:number;y:number;kind:EnemyKind;maxHp:number;age:number}
export interface PlayerLabel {amount:number;source:DamageSource|null;at:number;x:number;y:number;heal:boolean}
interface PlayerHit {amount:number;source:DamageSource|null;at:number}

const near=(a:VitalsRect,b:VitalsRect)=>
  a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;

/** Place plaques around existing occupied rectangles, mutating occupied as the original Web layout does. */
export function layoutEnemyVitals(state:GameState,reduced:boolean,fallen:readonly FallenEnemy[],occupied:VitalsRect[]):EnemyVitals[] {
  const {player:p,time}=state;
  const live=state.enemies.filter(e=>e.hp>0&&time-e.spawnAt>=CONFIG.spawn.warning);
  const distance=(e:{x:number;y:number})=>(e.x-p.x)**2+(e.y-p.y)**2;
  let nearest:number|null=null,nearestDistance=165**2;
  for(const e of live){const d=distance(e);if(d<nearestDistance){nearestDistance=d;nearest=e.id;}}
  const selected=live.filter(e=>e.hp<e.maxHp||isGuard(e.kind)||e.id===nearest||e.id===state.weapon.targetId);
  selected.sort((a,b)=>Number(isGuard(b.kind))-Number(isGuard(a.kind))||
    Number(b.hp<b.maxHp)-Number(a.hp<a.maxHp)||b.hurtAt-a.hurtAt||distance(a)-distance(b));
  const panels:EnemyVitals[]=[];
  function place(id:number,x:number,head:number,feet:number,hp:number,maxHp:number,giant:boolean,alpha:number):boolean {
    const width=giant?106:84,height=giant?25:22,gap=5;
    const below=giant&&head-height-gap<77,anchor=below?feet+gap:head-height-gap;
    for(const [dy,w,h] of [[0,width,height],[-height-3,width,height],[-2*(height+3),width,height],[10,36,8]]){
      if(hp===0&&h<10)continue;
      const panel={id,x:clamp(x-w/2,12,WORLD.width-w-12),y:clamp(anchor+(below?Math.abs(dy):dy),77,WORLD.height-100),w,h,hp,maxHp,alpha};
      if(occupied.some(box=>near(box,panel)))continue;
      panels.push(panel);occupied.push(panel);return true;
    }
    return false;
  }
  for(const e of selected){
    const age=time-(e.tossAt??-Infinity);
    const toss=!reduced&&age>=0&&age<TOSS_DURATION?Math.sin(Math.PI*age/TOSS_DURATION)*(e.tossHeight??0):0;
    const lift=giantJumpHeight(e,time)*(reduced?.38:1);
    const markers=(e.bellStunUntil??0)>time?21:e.stunUntil>time&&!(e.chilledUntil&&e.chilledUntil>time)?15:0;
    place(e.id,e.x,e.y-enemyHeight(e.kind)-lift-toss-markers,e.y,e.hp,e.maxHp,isGuard(e.kind),1);
  }
  const recent=fallen.filter(e=>e.age<.72).sort((a,b)=>a.age-b.age||distance(a)-distance(b));
  for(const e of recent){
    if(place(e.id,e.x,e.y-enemyHeight(e.kind),e.y,0,e.maxHp,isGuard(e.kind),clamp((.72-e.age)/.22,0,1)))break;
  }
  return panels;
}

/** Owns display-time deduplication and layout only; never mutates simulation state. */
export class DamageLabelModel {
  clock=0;
  visible:PlayerLabel[]=[];
  vitals:EnemyVitals[]=[];
  private damage:PlayerHit|null=null;
  private heal:PlayerHit|null=null;
  private fallen:(Omit<FallenEnemy,'age'>&{at:number})[]=[];
  private seen=new Float64Array(4096).fill(-1);
  private highestId=-1;

  reset():void {
    this.clock=0;this.damage=this.heal=null;this.visible=[];this.fallen=[];this.vitals=[];
    this.seen.fill(-1);this.highestId=-1;
  }

  add(event:GameEvent):void {
    if(event.type==='kill'){
      if(event.victimId!==undefined&&!this.fallen.some(e=>e.id===event.victimId)){
        this.fallen.push({id:event.victimId,x:event.x,y:event.y,kind:event.kind,maxHp:event.maxHp??CONFIG.enemies[event.kind].hp,at:this.clock});
      }
      return;
    }
    if(event.type!=='heal'&&!(event.type==='damage'&&event.victimId===0))return;
    if(!Number.isFinite(event.amount)||event.amount<=0||!Number.isSafeInteger(event.id)||event.id<0)return;
    const slot=event.id%this.seen.length;
    if(event.id<=this.highestId-this.seen.length||this.seen[slot]===event.id)return;
    this.seen[slot]=event.id;this.highestId=Math.max(this.highestId,event.id);
    const hit={amount:event.amount,source:event.type==='damage'?event.source:null,at:this.clock};
    if(event.type==='heal')this.heal=hit;else this.damage=hit;
  }

  update(dt:number,state:GameState,reduceMotion=false):void {
    this.clock+=Number.isFinite(dt)?Math.max(0,dt):0;
    if(this.damage&&this.clock-this.damage.at>=PLAYER_LABEL_LIFETIME)this.damage=null;
    if(this.heal&&this.clock-this.heal.at>=PLAYER_LABEL_LIFETIME)this.heal=null;
    this.visible=[];
    const p=state.player,top=84,bottom=Math.min(WORLD.bounds.bottom,WORLD.height-110),occupied:VitalsRect[]=[];
    for(const [hit,heal] of [[this.damage,false],[this.heal,true]] as const){
      if(!hit)continue;
      const x=clamp(p.x+(heal?-95:95),16+PLAYER_LABEL_WIDTH/2,WORLD.width-16-PLAYER_LABEL_WIDTH/2);
      let y=clamp(p.y-112+(heal?PLAYER_LABEL_HEIGHT+8:0),top,bottom-PLAYER_LABEL_HEIGHT);
      const other=this.visible[0];
      if(other&&Math.abs(x-other.x)<PLAYER_LABEL_WIDTH+6&&Math.abs(y-other.y)<PLAYER_LABEL_HEIGHT+6){
        y=other.y+2*PLAYER_LABEL_HEIGHT+8<=bottom?other.y+PLAYER_LABEL_HEIGHT+8:other.y-PLAYER_LABEL_HEIGHT-8;
      }
      this.visible.push({...hit,x,y,heal});
      occupied.push({x:x-PLAYER_LABEL_WIDTH/2,y,w:PLAYER_LABEL_WIDTH,h:PLAYER_LABEL_HEIGHT});
    }
    occupied.push({x:p.x-39,y:p.y-122,w:78,h:130});
    this.fallen=this.fallen.filter(e=>this.clock-e.at<.72);
    this.vitals=layoutEnemyVitals(state,reduceMotion,this.fallen.map(e=>({...e,age:this.clock-e.at})),occupied);
  }
}
