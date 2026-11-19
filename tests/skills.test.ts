import {describe,expect,it} from 'vitest';
import {activateSkill,updateSkills} from '../src/core/skills';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import {newMarket} from '../src/core/market-orders';
import {isOnPaperRoute} from '../src/core/geometry';
import {nearestPickupHint} from '../src/render/delivery-skills';
import type {CombatContext} from '../src/core/contracts';
import type {Enemy,GameEvent,GameState,Pickup,SkillKind} from '../src/shared/types';

function fixture(){
  const s:GameState={market:newMarket(),time:10,score:0,kills:0,stage:1,ended:false,cause:null,seed:1,practice:true,
    wave:1,waveStartedAt:0,coins:[],collectedCoins:0,combo:0,comboUntil:0,revivesUsed:0,fields:[],
    player:{x:640,y:370,px:640,py:370,vx:0,vy:0,facing:1,radius:10,skateUntil:0,hp:100,maxHp:100,invulnerableUntil:0,hurtAt:0,bubbleUntil:0,heatUntil:0,stampUntil:0,moveDirection:{x:1,y:0}},
    enemies:[],pickups:[],weapon:{kind:'tongs',readyAt:0,equippedAt:0,targetId:null,attack:null},meleeWaves:[],projectiles:[],weaponDrops:[],zones:[],
    effects:{dispatchUntil:0,dispatchStartedAt:0,dispatchCooldownUntil:0,pendingSupplyAt:0,pendingSupplyUntil:0,supplyGroupId:0},lastDamage:null,lastDamageAmount:0};
  let next=1000;const events:GameEvent[]=[];
  const ctx:CombatContext={id:()=>next++,random:()=>.5,emit:e=>events.push(e),active:e=>e.hp>0&&e.spawnAt<=s.time,
    damage:(e,n)=>{const actual=Math.min(n,e.hp);e.hp-=actual;return actual;},
    push:(e,p,n)=>{const dx=e.x-p.x,dy=e.y-p.y,length=Math.hypot(dx,dy)||1;e.x+=dx/length*n;e.y+=dy/length*n;},
    spawnPickup:(kind,position,extra)=>{if(s.pickups.filter(p=>!p.retiringUntil).length>=4)return null;const p={id:next++,kind,...position,radius:15,bornAt:s.time,...extra};s.pickups.push(p);return p;}};
  const activate=(kind:SkillKind)=>activateSkill(s,kind,s.player,ctx);
  const step=(dt:number)=>{s.time+=dt;updateSkills(s,dt,ctx);};
  return {s,ctx,events,activate,step};
}
function enemy(id:number,x=700,y=370,kind:Enemy['kind']='bowl'):Enemy {
  return {id,kind,x,y,px:x,py:y,radius:CONFIG.enemies[kind].radius,spawnAt:0,slowUntil:0,phase:'chase',phaseUntil:0,dashX:1,dashY:0,facing:-1,hp:CONFIG.enemies[kind].hp,maxHp:CONFIG.enemies[kind].hp,hurtAt:0,stunUntil:0,stunStartedAt:0,bellResistUntil:0,contactSuppressedUntil:0,skateHitAt:-Infinity};
}
const item=(id:number,kind:SkillKind,x=700,y=370,extra:Partial<Pickup>={}):Pickup=>({id,kind,x,y,radius:15,bornAt:0,...extra});

describe('V2 skill mechanics',()=>{
  it('fan damages a durable enemy, pushes survivors and excludes spawning enemies',()=>{
    const {s,activate}=fixture();s.enemies=[enemy(1),{...enemy(2),spawnAt:12}];activate('fan');
    expect(s.enemies[0].hp).toBe(30);expect(s.enemies[0].x).toBe(730);expect(s.enemies[1].hp).toBe(120);
  });
  it('fan catches fast enemies crossing its radius between simulation positions',()=>{
    const {s,activate}=fixture();s.enemies=[{...enemy(1,800),px:500}];activate('fan');expect(s.enemies[0].hp).toBe(30);
  });
  it('skate shares a per-enemy debounce and keeps the center dangerous',()=>{
    const {s,activate,step}=fixture();s.enemies=[enemy(1,775),enemy(2,640,370,'bun')];activate('skate');
    expect(s.enemies.map(e=>e.hp)).toEqual([100,30]);step(.01);expect(s.enemies.map(e=>e.hp)).toEqual([100,30]);step(.1);expect(s.enemies[0].hp).toBe(100);
    step(.4);expect(s.enemies[0].hp).toBe(80);
  });
  it('skate detects an enemy crossing its annulus between frames',()=>{
    const {s,activate,step}=fixture();s.enemies=[{...enemy(1,640),px:820}];activate('skate');step(.01);expect(s.enemies[0].hp).toBe(100);
  });
  it('the initial soda splash affects present enemies and never deals damage or heals',()=>{
    const {s,activate}=fixture();s.player.hp=51;s.enemies=[enemy(1)];activate('soda');s.enemies.push(enemy(2));
    expect(s.enemies[0].slowUntil).toBe(13);expect(s.enemies[1].slowUntil).toBe(0);expect(s.player.hp).toBe(51);expect(s.enemies[0].hp).toBe(120);
  });
  it('lure selects ten and never interrupts an already locked charge',()=>{
    const {s,activate,step}=fixture();s.enemies=Array.from({length:13},(_,i)=>enemy(i,795+i*2));s.enemies[0].phase='dash';activate('lure');
    expect(s.enemies.filter(e=>e.lureX!==undefined)).toHaveLength(10);expect(s.enemies[0].lureX).toBeUndefined();
    step(4.01);expect(s.enemies.every(e=>e.lureX===undefined)).toBe(true);
  });
  it('buff pickups refresh durations rather than multiplying power',()=>{
    const {s,activate,step}=fixture();activate('bubble');activate('heat');activate('stamp');step(1);activate('bubble');activate('heat');activate('stamp');
    expect(s.player.bubbleUntil).toBe(18);expect(s.player.heatUntil).toBe(16);expect(s.player.stampUntil).toBe(17);expect(s.player.hp).toBe(100);
  });
  it('cones replace the old row and stop a swept box dash',()=>{
    const {s,activate,step}=fixture();activate('cones');expect(s.zones).toHaveLength(3);activate('cones');expect(s.zones).toHaveLength(3);
    const cone=s.zones[1];s.enemies=[{...enemy(1,cone.x+80,cone.y,'box'),px:cone.x-80,phase:'dash'}];step(.02);
    expect(s.enemies[0].phase).toBe('recover');expect(s.zones.filter(z=>z.hp===0)).toHaveLength(1);
  });
  it('bell delays, interrupts and caps repeated stun with post-stun resistance',()=>{
    const {s,activate,step}=fixture();s.enemies=[{...enemy(1,875,370,'box'),phase:'dash'}];activate('bell');step(.04);expect(s.enemies[0].stunUntil).toBe(0);
    step(.04);const first=s.enemies[0].stunStartedAt;expect(s.enemies[0].phase).toBe('recover');
    for(let i=0;i<5;i++){activate('bell');step(.15);}
    expect(s.enemies[0].stunUntil).toBeLessThanOrEqual(first+1.2);step(.6);const resistance=s.enemies[0].bellResistUntil;
    expect(resistance).toBeGreaterThan(s.time);activate('bell');step(.09);expect(s.enemies[0].stunUntil).toBe(0);
  });
  it('independent pending bells are retained instead of overwritten',()=>{
    const {s,ctx,activate,step}=fixture();s.enemies=[enemy(1,700),enemy(2,1000)];activate('bell');activateSkill(s,'bell',{x:1000,y:370},ctx);
    step(.09);expect(s.enemies.every(e=>e.stunUntil>s.time)).toBe(true);expect(Object.keys(s.effects).some(k=>k.startsWith('bellAt_'))).toBe(false);
  });
  it('route follows movement direction, clips its endpoint and replaces itself',()=>{
    const {s,activate}=fixture();s.player.x=1180;activate('route');expect(s.zones[0].length).toBe(20);
    s.player.moveDirection={x:0,y:1};activate('route');expect(s.zones).toHaveLength(1);expect(s.zones[0].angle).toBeCloseTo(Math.PI/2);
  });
  it('the route includes its paper edges and drops the boost immediately at expiry',()=>{
    const {s,activate}=fixture();
    s.player.moveDirection={x:1,y:1};
    activate('route');
    const route=s.zones[0],cos=Math.cos(route.angle),sin=Math.sin(route.angle);
    const point=(along:number,side:number)=>({x:route.x+cos*along-sin*side,y:route.y+sin*along+cos*side});
    expect(isOnPaperRoute(route,route,s.time)).toBe(true);
    expect(isOnPaperRoute(point(100,route.width/2-.001),route,s.time)).toBe(true);
    expect(isOnPaperRoute(point(100,route.width/2+.001),route,s.time)).toBe(false);
    expect(isOnPaperRoute(point(-1,0),route,s.time)).toBe(false);
    expect(isOnPaperRoute(point(route.length+1,0),route,s.time)).toBe(false);
    expect(isOnPaperRoute(route,route,route.expiresAt)).toBe(false);
  });
  it('prompts for one nearby skill and ignores locked, retired and distant drops',()=>{
    const player={x:640,y:370};
    const available=item(1,'fan',735),nearer=item(2,'skate',710),distant=item(3,'route',950);
    const gated=[item(4,'heat',700,370,{readyAt:12}),item(5,'heat',700,370,{disabledUntil:12}),
      item(6,'heat',700,370,{retiringUntil:12}),item(7,'heat',700,370,{expiresAt:10})];
    expect(nearestPickupHint([...gated,available,distant,nearer],player,10)).toBe(nearer);
    expect(nearestPickupHint([...gated,distant],player,10)).toBeUndefined();
  });
  it('hook selects one group member, skips gated items and moves rather than remotely activates',()=>{
    const {s,activate,step}=fixture();s.pickups=[item(1,'fan',700,370,{groupId:8}),item(2,'soda',710,370,{groupId:8}),item(3,'heat'),item(4,'dispatch',700,370,{disabledUntil:20}),item(5,'hook'),item(6,'bubble',700,370,{readyAt:11})];
    activate('hook');expect(s.pickups.filter(p=>p.pulledUntil)).toHaveLength(2);step(.05);expect(s.pickups[0].x).toBe(663);expect(s.player.heatUntil).toBe(0);
    step(.61);expect(s.pickups.every(p=>!p.pulledUntil)).toBe(true);expect(s.pickups).toHaveLength(6);
  });
  it('dispatch continuous pause caps at six seconds, then unlocks two seconds of spawning',()=>{
    const {s,activate,step}=fixture();activate('dispatch');step(3);activate('dispatch');expect(s.effects.dispatchUntil).toBe(16);
    s.pickups=[item(1,'dispatch',700,370,{pulledUntil:20})];step(3.01);expect(s.effects.dispatchCooldownUntil).toBe(18);
    expect(s.pickups[0].disabledUntil).toBe(18);expect(s.pickups[0].pulledUntil).toBeUndefined();activate('dispatch');expect(s.effects.dispatchUntil).toBe(0);
    step(2);activate('dispatch');expect(s.effects.dispatchUntil).toBeCloseTo(22.01);
  });
  it('supply reserves at most three slots and makes one shared delayed group',()=>{
    const {s,activate}=fixture();s.pickups=[item(1,'heat',900)];activate('supply');expect(s.pickups).toHaveLength(4);
    const drops=s.pickups.filter(p=>p.groupId);expect(new Set(drops.map(p=>p.kind)).size).toBe(3);expect(new Set(drops.map(p=>p.groupId)).size).toBe(1);
    expect(drops.every(p=>p.readyAt===10.35&&p.expiresAt===16.35)).toBe(true);activate('hook');expect(drops.some(p=>p.pulledUntil)).toBe(false);
  });
  it('supply pending does not extend on duplicates and expires visibly',()=>{
    const {s,activate,step,events}=fixture();s.pickups=Array.from({length:4},(_,i)=>item(i,'heat',900));activate('supply');step(2);activate('supply');
    expect(s.effects.pendingSupplyUntil).toBe(14);step(2.01);expect(s.effects.pendingSupplyUntil).toBe(0);
    expect(events.some(e=>e.type==='notice'&&e.message==='补给暂无法投递')).toBe(true);
  });
  it('pending supply delivers once room opens without exceeding the pickup cap',()=>{
    const {s,activate,step}=fixture();s.pickups=Array.from({length:4},(_,i)=>item(i,'heat',900));activate('supply');s.pickups.pop();step(.1);
    expect(s.pickups).toHaveLength(4);expect(s.pickups.filter(p=>p.groupId)).toHaveLength(1);expect(s.effects.pendingSupplyUntil).toBe(0);
  });
});

describe('skill and battle integration',()=>{
  const practice=()=>{const game=new Game(7);game.reset(7,true);return game;};
  it('supply selection atomically retires simultaneous siblings',()=>{
    const game=practice();game.state.pickups=[item(1,'soda',640,370,{groupId:50}),item(2,'fan',640,370,{groupId:50}),item(3,'skate',640,370,{groupId:50})];
    game.update(1/60,{x:0,y:0});
    expect(game.drainEvents().filter(e=>e.type==='pickup')).toHaveLength(1);
    expect(game.state.pickups).toHaveLength(2);expect(game.state.pickups.every(p=>(p.retiringUntil??0)>game.state.time)).toBe(true);
    game.update(.5,{x:0,y:0});expect(game.state.pickups).toHaveLength(0);
  });
  it('a newly collected bubble protects before overlapping enemies deal damage',()=>{
    const game=practice();game.spawnEnemy('bowl',{x:640,y:370});game.state.pickups=[item(50,'bubble',640,370)];game.update(1/60,{x:0,y:0});
    expect(game.state.player.hp).toBe(100);expect(game.state.player.bubbleUntil).toBe(0);expect(game.state.player.invulnerableUntil).toBeGreaterThan(game.state.time);
    expect(game.drainEvents().filter(e=>e.type==='defend')).toHaveLength(1);
  });
  it('a newly collected skate applies real damage in its activation step',()=>{
    const game=practice();const target=game.spawnEnemy('bowl',{x:700,y:370});game.state.pickups=[item(50,'skate',640,370)];game.update(1/60,{x:0,y:0});
    expect(target.hp).toBe(100);expect(game.drainEvents().filter(e=>e.type==='damage'&&e.source==='skate')).toHaveLength(1);
  });
  it('supply delivery reserves capacity through the actual Game context',()=>{
    const game=practice();game.triggerSkill('supply');expect(game.state.pickups).toHaveLength(3);
    expect(game.state.pickups.every(p=>(p.readyAt??0)>game.state.time)).toBe(true);
    game.triggerSkill('supply');expect(game.state.pickups).toHaveLength(3);expect(game.state.effects.pendingSupplyUntil).toBe(4);
  });
  it('hook brings only one supply choice into a real pickup and retires the siblings',()=>{
    const game=practice();game.triggerSkill('supply');game.update(.36,{x:0,y:0});game.triggerSkill('hook');
    expect(game.state.pickups.filter(p=>(p.pulledUntil??0)>game.state.time)).toHaveLength(1);
    game.update(.2,{x:0,y:0});const pickups=game.drainEvents().filter(e=>e.type==='pickup');
    expect(pickups).toHaveLength(1);expect(game.state.pickups).toHaveLength(2);expect(game.state.pickups.every(p=>p.retiringUntil&&!p.pulledUntil)).toBe(true);
  });
  it('dispatch crossing a difficulty boundary waits one batch interval before reinforcements',()=>{
    const game=new Game(17);
    Object.assign(game.state,{time:89,stage:2,wave:3,waveStartedAt:70});
    game.state.weapon.readyAt=Infinity;game.state.player.invulnerableUntil=Infinity;game.triggerSkill('dispatch');
    for(let i=0;i<244;i++)game.update(1/60,{x:0,y:0});
    expect(game.state.stage).toBe(3);expect(game.state.enemies).toHaveLength(0);expect(game.state.effects.dispatchCooldownUntil).toBeCloseTo(95);
    game.update(1,{x:0,y:0});expect(game.state.enemies).toHaveLength(0);
    game.update(.65,{x:0,y:0});expect(game.state.enemies).toHaveLength(8);
    game.update(.5,{x:0,y:0});expect(game.state.enemies).toHaveLength(8);
    expect(game.drainEvents().some(event=>event.type==='wave')).toBe(false);
  });
  it('bell expiry leaves a box in recovery before it resumes an ordinary chase',()=>{
    const game=practice();game.state.weapon.readyAt=Infinity;const box=game.spawnEnemy('box',{x:760,y:370});box.phase='dash';box.phaseUntil=10;box.dashX=-1;box.dashY=0;
    game.triggerSkill('bell');game.update(.12,{x:0,y:0});expect(box.stunUntil).toBeGreaterThan(game.state.time);expect(box.phase).toBe('recover');
    const stop=box.x;game.update(.65,{x:0,y:0});expect(box.phase).toBe('recover');expect(box.x).toBe(stop);expect(box.bellResistUntil).toBeGreaterThan(game.state.time);
    game.update(.41,{x:0,y:0});expect(box.phase).toBe('chase');expect(box.phaseUntil).toBeGreaterThan(game.state.time);expect(box.x).toBeLessThan(stop);
  });
});

