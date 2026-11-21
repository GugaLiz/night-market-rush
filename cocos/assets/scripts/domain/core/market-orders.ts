import {isElite,type Enemy,type GameState,type MarketGroup,type MarketOffer,type MarketStall,type MarketState,type Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD} from './config';
import {distanceSquared,segmentDistanceSquared,sweepContact} from './geometry';
import {activateSkill,restorePlayerHealth} from './skills';
import {epicForWave} from './waves';

const radius=29;
const finalTime=300;
const openDuration=15;
const directions=24;
type SpawnGuardian=(position:Vec)=>Enemy;

export function newMarket():MarketState {
  return {upgrade:null,completed:0,closing:'open',offer:null,receipt:null,expired:null,
    opened:[],retryAt:0,reprieveUntil:0};
}

function reachable(point:Vec,margin:number):boolean {
  const b=WORLD.bounds,p=CONFIG.player;
  return point.x>=b.left+p.radius+margin && point.x<=b.right-p.radius-margin &&
    point.y>=p.minY+margin && point.y<=b.bottom-p.radius-margin;
}

function safeSite(s:GameState,point:Vec,margin:number):boolean {
  if(s.weaponDrops.some(d=>d.expiresAt>s.time && distanceSquared(d,point)<(CONFIG.weapons.pickupReach+margin+6)**2)) return false;
  return s.enemies.every(e=>{
    if(e.hp<=0)return true;
    if(distanceSquared(e,point)<(e.radius+margin+8)**2)return false;
    if(e.jump && e.jump.phase!=='rest' && distanceSquared(e.jump.target,point)<(CONFIG.giant.stompRadius+margin)**2)return false;
    if(e.kind==='box' && (e.phase==='warn'||e.phase==='dash')){
      const len=CONFIG.dash.speed*CONFIG.dash.duration;
      return segmentDistanceSquared(e,{x:e.x+len*e.dashX,y:e.y+len*e.dashY},point)>(margin+e.radius)**2;
    }
    if(e.kind==='bowl' && (e.shotWarnUntil??0)>s.time){
      const angle=e.shotAngle??0,len=CONFIG.ranged.speed*CONFIG.ranged.lifetime;
      return segmentDistanceSquared(e,{x:e.x+Math.cos(angle)*len,y:e.y+Math.sin(angle)*len},point)>(margin+CONFIG.ranged.radius)**2;
    }
    return true;
  });
}

function siteCandidates(s:GameState,distances:number[],phase:number):Vec[] {
  const points:Vec[]=[];
  for(const length of distances){
    for(let i=0;i<directions;i++){
      const angle=phase+i*Math.PI*2/directions;
      const point={x:s.player.x+length*Math.cos(angle),y:s.player.y+length*Math.sin(angle)};
      if(reachable(point,radius)&&safeSite(s,point,radius))points.push(point);
    }
  }
  return points;
}

function routeCrowd(s:GameState,point:Vec):number {
  return s.enemies.filter(e=>e.hp>0 && segmentDistanceSquared(s.player,point,e)<(e.radius+30)**2).length;
}

function chooseStalls(s:GameState,group:MarketGroup,phase:number):MarketStall[]|null {
  if(group==='final'){
    const sites=siteCandidates(s,[252,212,296],phase);
    const b=WORLD.bounds,margin=(b.right-b.left)*.24;
    const point=sites.find(q=>q.x>b.left+margin && q.x<b.right-margin)??sites[0];
    return point?[{...point,kind:'final',radius}]:null;
  }
  const ranked=(points:Vec[],preferCrowd:boolean)=>points
    .map(point=>({point,crowd:routeCrowd(s,point)}))
    .sort((a,b)=>preferCrowd?b.crowd-a.crowd:a.crowd-b.crowd);
  const near=ranked(siteCandidates(s,[144,180],phase),false);
  const far=ranked(siteCandidates(s,[280,320],phase+Math.PI),group==='food');
  for(const a of near){
    const b=far.find(({point})=>{
      const first={x:a.point.x-s.player.x,y:a.point.y-s.player.y};
      const other={x:point.x-s.player.x,y:point.y-s.player.y};
      return first.x*other.x+first.y*other.y < .72*Math.hypot(first.x,first.y)*Math.hypot(other.x,other.y) &&
        distanceSquared(a.point,point)>170**2;
    });
    if(b)return [{...a.point,kind:group==='food'?'soup':'frost',radius},
      {...b.point,kind:group==='food'?'vortex':'brine',radius}];
  }
  return null;
}

/** Both signs light on the same simulation step. Failed placement never starts the timer. */
export function openMarket(s:GameState,group:MarketGroup,ctx:CombatContext,spawn:SpawnGuardian):boolean {
  const m=s.market;
  if(m.offer || m.opened.includes(group))return false;
  // A final delivery can add its own giant. Keep that fight off a boss floor.
  if(group==='final' && epicForWave(s.wave))return false;
  // Keep street layout draws independent of the weapon, enemy and skill-drop sequences.
  let roll=(s.seed^Math.imul(Math.round(m.retryAt/CONFIG.step),0x9e3779b1))>>>0;
  roll^=roll<<13;roll^=roll>>>17;roll^=roll<<5;
  const phase=((roll>>>0)/0x100000000+m.opened.length*.382)*Math.PI*2;
  const stalls=chooseStalls(s,group,phase);
  if(!stalls){m.retryAt=s.time+.5;return false;}
  let guardian:Enemy|undefined;
  if(group==='final'){
    guardian=s.enemies.find(e=>e.hp>0 && e.kind==='giantBun');
    if(!guardian){
      if(s.enemies.filter(e=>e.hp>0&&isElite(e.kind)).length>=2){m.retryAt=s.time+.5;return false;}
      const [site]=siteCandidates(s,[370,420,324],phase+Math.PI)
        .filter(point=>distanceSquared(stalls[0],point)>135**2);
      if(!site){m.retryAt=s.time+.5;return false;}
      guardian=spawn(site);
    }
  }
  m.offer={group,stalls,openedAt:s.time,expiresAt:group==='final'?null:s.time+openDuration,
    ready:!guardian || (guardian.jump?.hop===3 && guardian.jump.phase==='rest'),guardianId:guardian?.id??null,mustReenter:false};
  m.opened.push(group);
  ctx.emit({type:'market',action:'open',group,kind:null,x:stalls[0].x,y:stalls[0].y});
  return true;
}

function offerTray(s:GameState,stall:MarketStall,ctx:CombatContext):void {
  if(s.weapon.kind==='tray')return;
  const candidates:Vec[]=[];
  const heading=Math.atan2(s.player.y-stall.y,s.player.x-stall.x)+Math.PI/2;
  for(let i=0;i<directions;i++){
    const angle=heading+i*Math.PI*2/directions;
    const point={x:stall.x+100*Math.cos(angle),y:stall.y+100*Math.sin(angle)};
    if(reachable(point,CONFIG.weapons.dropRadius) && distanceSquared(point,s.player)>(CONFIG.weapons.pickupReach+10)**2)
      candidates.push(point);
  }
  // Always deliver the requested box, even if a crowd moved in after the stall opened.
  const at=candidates.find(q=>safeSite(s,q,CONFIG.weapons.pickupReach))??candidates[0];
  if(at)s.weaponDrops.push({...at,id:ctx.id(),kind:'tray',radius:CONFIG.weapons.dropRadius,bornAt:s.time,
    expiresAt:s.time+25,readyAt:s.time,returnDrop:false,leftPickupCircle:true});
}

function sign(s:GameState,offer:MarketOffer,stall:MarketStall,at:Vec,ctx:CombatContext):void {
  const m=s.market,soupCoins=stall.kind==='soup' && s.player.hp>=s.player.maxHp;
  m.offer=null;
  m.completed++;
  const soupHeal=stall.kind==='soup'&&!soupCoins?Math.min(25,s.player.maxHp-s.player.hp):undefined;
  m.receipt={stall,stalls:offer.stalls,signedAt:s.time,soupCoins,soupHeal};
  ctx.emit({type:'market',action:'sign',group:offer.group,kind:stall.kind,x:stall.x,y:stall.y});
  switch(stall.kind){
    case 'soup':
      if(soupCoins){s.collectedCoins+=5;ctx.emit({type:'coin',amount:5,...at});}
      else restorePlayerHealth(s,25,at,ctx);
      break;
    case 'vortex':activateSkill(s,'vortex',at,ctx);break;
    case 'frost':case 'brine':
      m.upgrade=stall.kind;
      activateSkill(s,stall.kind==='frost'?'frost':'poison',at,ctx);
      if(stall.kind==='brine')offerTray(s,stall,ctx);
      break;
    case 'final':
      m.closing='choice';
      ctx.emit({type:'market',action:'closing',group:offer.group,kind:stall.kind,x:stall.x,y:stall.y});
      break;
  }
}

function checkOffer(s:GameState,offer:MarketOffer,dt:number,ctx:CombatContext):void {
  const p=s.player,start={x:p.px,y:p.py};
  if(offer.group==='final'){
    const stall=offer.stalls[0];
    const inside=distanceSquared(stall,p)<=stall.radius**2;
    if(epicForWave(s.wave)){
      offer.ready=false;
      offer.mustReenter=inside;
      return;
    }
    if(s.ended){if(inside)offer.mustReenter=true;return;}
    if(!offer.ready){
      const guardian=s.enemies.find(e=>e.id===offer.guardianId && e.hp>0);
      offer.ready=!guardian || (guardian.jump?.hop===3 && guardian.jump.phase==='rest');
      if(!offer.ready){offer.mustReenter=inside;return;}
    }
    if(offer.mustReenter){
      if(distanceSquared(stall,start)<=stall.radius**2){offer.mustReenter=inside;return;}
      offer.mustReenter=false;
    }
  }
  if(s.ended)return;
  let first:MarketStall|undefined,time=Infinity;
  for(const stall of offer.stalls){
    const t=sweepContact(start,p,stall,stall.radius);
    if(t!==null && t<time){first=stall;time=t;}
  }
  if(first && (offer.expiresAt===null || s.time-dt+time*dt < offer.expiresAt-1e-9)){
    sign(s,offer,first,{x:start.x+(p.x-start.x)*time,y:start.y+(p.y-start.y)*time},ctx);
  }else if(offer.expiresAt!==null && s.time+1e-9>=offer.expiresAt){
    s.market.expired={at:s.time,stalls:offer.stalls};
    s.market.offer=null;
  }
}

export function updateMarket(s:GameState,dt:number,ctx:CombatContext,spawn:SpawnGuardian):void {
  const m=s.market;
  if(m.offer){checkOffer(s,m.offer,dt,ctx);return;}
  if(s.ended || s.practice || m.closing!=='open' || s.time<m.retryAt)return;
  const group=s.wave>=9&&s.time+1e-9>=finalTime?'final':s.wave>=4?'upgrade':s.wave>=2?'food':null;
  if(group && !m.opened.includes(group))openMarket(s,group,ctx,spawn);
}
