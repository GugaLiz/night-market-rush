import {describe,expect,it} from 'vitest';
import {activateSkill,updateSkills} from '../src/core/skills';
import {CONFIG,WORLD} from '../src/core/config';
import {Game} from '../src/core/game';
import {newMarket} from '../src/core/market-orders';
import {isOnPaperRoute} from '../src/core/geometry';
import {nearestPickupHint} from '../src/render/delivery-skills';
import type {CombatContext} from '../src/core/contracts';
import {ELITE_KINDS,type Enemy,type GameEvent,type GameState,type Pickup,type SkillKind} from '../src/shared/types';

function fixture(){
  const s:GameState={market:newMarket(),time:10,score:0,kills:0,stage:1,ended:false,cause:null,seed:1,practice:true,
    wave:1,waveStartedAt:0,coins:[],collectedCoins:0,combo:0,comboUntil:0,revivesUsed:0,fields:[],
    player:{x:640,y:370,px:640,py:370,vx:0,vy:0,facing:1,radius:10,skateUntil:0,hp:100,maxHp:100,invulnerableUntil:0,hurtAt:0,bubbleUntil:0,heatUntil:0,stampUntil:0,moveDirection:{x:1,y:0}},
    enemies:[],pickups:[],weapon:{kind:'tongs',readyAt:0,equippedAt:0,targetId:null,attack:null},meleeWaves:[],projectiles:[],weaponDrops:[],zones:[],
    effects:{hookUntil:0,dispatchUntil:0,dispatchStartedAt:0,dispatchCooldownUntil:0},lastDamage:null,lastDamageAmount:0};
  let next=1000;const events:GameEvent[]=[];
  const ctx:CombatContext={id:()=>next++,random:()=>.5,emit:e=>events.push(e),active:e=>e.hp>0&&e.spawnAt<=s.time,
    damage:(e,n)=>{const actual=Math.min(n,e.hp);e.hp-=actual;return actual;},
    push:(e,p,n)=>{const dx=e.x-p.x,dy=e.y-p.y,length=Math.hypot(dx,dy)||1;e.x+=dx/length*n;e.y+=dy/length*n;},
    spawnPickup:(kind,position,extra)=>{if(!extra?.groupId&&s.pickups.filter(p=>!p.groupId&&!p.retiringUntil).length>=4)return null;const p={id:next++,kind,...position,radius:15,bornAt:s.time,...extra};s.pickups.push(p);return p;}};
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
    expect(s.enemies[0].hp).toBe(120-CONFIG.skills.fan.damage);expect(s.enemies[0].x).toBe(730);expect(s.enemies[1].hp).toBe(120);
  });
  it('fan catches fast enemies crossing its radius between simulation positions',()=>{
    const {s,activate}=fixture();s.enemies=[{...enemy(1,865),px:410}];activate('fan');expect(s.enemies[0].hp).toBe(120-CONFIG.skills.fan.damage);
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
    expect(s.player.bubbleUntil).toBe(18);expect(s.player.heatUntil).toBe(16);expect(s.player.stampUntil).toBe(23);expect(s.player.hp).toBe(100);
  });
  it('replaces a scatter of five to eight cones and expires all of them after ten seconds',()=>{
    const {s,ctx,activate,step}=fixture();
    ctx.random=()=>0;activate('cones');const previous=s.zones.map(z=>z.id);
    expect(previous).toHaveLength(5);
    step(.30);ctx.random=()=>.999;activate('cones');
    expect(s.zones).toHaveLength(8);expect(s.zones.every(z=>!previous.includes(z.id))).toBe(true);
    expect(s.zones.every(z=>z.expiresAt-z.bornAt===10)).toBe(true);
    step(9.99);expect(s.zones).toHaveLength(8);
    step(.02);expect(s.zones).toHaveLength(0);
  });
  it('breaks the first cone in a swept dash even when it was placed after the farther one',()=>{
    const {s,activate,step}=fixture();activate('cones');
    const base=s.zones[0],near={...base,id:80,x:600,y:370},far={...base,id:81,x:660,y:370};
    s.zones=[far,near];
    const charger={...enemy(1,730,370,'box'),px:500,phase:'dash' as const};
    s.enemies=[charger];step(.02);
    expect(charger.phase).toBe('recover');expect(charger.x).toBeCloseTo(near.x-near.radius-charger.radius,0);
    expect(near.hp).toBe(0);expect(far.hp).toBe(1);
  });
  it('bell delays, interrupts and caps repeated stun with post-stun resistance',()=>{
    const {s,activate,step}=fixture();s.enemies=[{...enemy(1,875,370,'box'),phase:'dash'}];activate('bell');step(.04);expect(s.enemies[0].stunUntil).toBe(0);
    step(.04);const box=s.enemies[0],first=box.stunStartedAt;expect(box.phase).toBe('recover');
    expect(box.bellStunUntil).toBeCloseTo(first+2);
    for(let i=0;i<8;i++){activate('bell');step(.15);}
    expect(box.stunUntil).toBeCloseTo(first+3);
    step(first+3.01-s.time);
    expect(box.bellResistUntil).toBeCloseTo(first+4);activate('bell');step(.09);expect(box.stunUntil).toBe(0);
    step(1);activate('bell');step(.09);expect(box.bellStunUntil).toBeCloseTo(s.time+2);
  });
  it('independent pending bells are retained instead of overwritten',()=>{
    const {s,ctx,activate,step}=fixture();s.enemies=[enemy(1,700),enemy(2,1000)];activate('bell');activateSkill(s,'bell',{x:1000,y:370},ctx);
    step(.09);expect(s.enemies.every(e=>e.stunUntil>s.time)).toBe(true);expect(Object.keys(s.effects).some(k=>k.startsWith('bellAt_'))).toBe(false);
  });
  it('silences airborne soup and flour attacks only for the owners actually stunned',()=>{
    const {s,activate,step}=fixture();
    const bowl=enemy(1),resistant={...enemy(2),bellResistUntil:s.time+5};
    const giant=enemy(3,770,370,'giantBun'),far=enemy(4,1100,370,'giantBun');
    s.enemies=[bowl,resistant,giant,far];
    s.enemyShots=[bowl,resistant].map(e=>({id:e.id+10,ownerId:e.id,x:680,y:370,px:680,py:370,vx:-100,vy:0,radius:5,damage:8,bornAt:s.time,expiresAt:s.time+2}));
    s.giantPulses=[giant,far].map(e=>({id:e.id+20,ownerId:e.id,x:e.x,y:e.y,hop:3,bornAt:s.time,reach:700,gapAngle:0,spent:false}));
    activate('bell');step(.09);
    expect(s.enemyShots.map(shot=>shot.ownerId)).toEqual([resistant.id]);
    expect(s.giantPulses.map(wave=>wave.ownerId)).toEqual([far.id]);
    expect([resistant.bellStunUntil,far.bellStunUntil]).toEqual([undefined,undefined]);
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
  it('hook reels loose, eligible orders and leaves supply choices and other hooks alone',()=>{
    const {s,activate,step}=fixture();s.pickups=[item(1,'fan',700,370,{groupId:8}),item(2,'soda',710,370,{groupId:8}),item(3,'heat'),item(4,'dispatch',700,370,{disabledUntil:20}),item(5,'hook'),item(6,'bubble',700,370,{readyAt:11})];
    activate('hook');expect(s.pickups.filter(p=>p.pulledUntil).map(p=>p.id)).toEqual([3]);
    step(.13);
    expect(s.pickups[2].x).toBeCloseTo(700-.03*CONFIG.skills.hook.speed);
    expect(s.player.heatUntil).toBe(0);
    step(.88);
    expect(s.pickups.filter(p=>p.pulledUntil).map(p=>p.id)).toEqual([3,6]);
    expect(s.pickups).toHaveLength(6);
  });
  it('a free hook line is reused while refreshing the scanner never exceeds three lines',()=>{
    const {s,activate,step}=fixture();
    s.pickups=[1,2,3,4].map((id)=>item(id,'heat',800+id*20));
    activate('hook');
    expect(s.pickups.filter(p=>p.pulledUntil).map(p=>p.id)).toEqual([1,2,3]);
    const firstDeadline=s.pickups[0].pulledUntil;
    step(.05);activate('hook');expect(s.effects.hookUntil-s.time).toBe(4);
    expect(s.pickups[0].pulledUntil).toBe(firstDeadline);
    s.pickups.shift();step(.02);
    expect(s.pickups.filter(p=>p.pulledUntil).map(p=>p.id)).toEqual([2,3,4]);
  });
  it('dispatch continuous pause caps at six seconds, then unlocks two seconds of spawning',()=>{
    const {s,activate,step}=fixture();activate('dispatch');step(3);activate('dispatch');expect(s.effects.dispatchUntil).toBe(16);
    s.pickups=[item(1,'dispatch',700,370,{pulledUntil:20})];step(3.01);expect(s.effects.dispatchCooldownUntil).toBe(18);
    expect(s.pickups[0].disabledUntil).toBe(18);expect(s.pickups[0].pulledUntil).toBeUndefined();activate('dispatch');expect(s.effects.dispatchUntil).toBe(0);
    step(2);activate('dispatch');expect(s.effects.dispatchUntil).toBeCloseTo(22.01);
  });
  it('dispatch clears nearby flying soup once and eases ordinary enemies away without moving the elite',()=>{
    const {s,activate,step,events}=fixture(),tune=CONFIG.skills.dispatch;
    const near=enemy(1,720,370,'box'),far=enemy(2,1120);
    const elites=ELITE_KINDS.map((kind,i)=>enemy(3+i,700,370,kind));
    near.phase='dash';s.enemies=[near,far,...elites];
    const shot=(id:number,x:number)=>({id,ownerId:9,x,px:x,y:370,py:370,vx:-145,vy:0,radius:6,damage:8,bornAt:10,expiresAt:16});
    s.enemyShots=[shot(50,710),shot(51,1040)];
    activate('dispatch');
    expect(s.enemyShots.map(q=>q.id)).toEqual([51]);
    expect(events.filter(e=>e.type==='dispatchClear')).toHaveLength(1);
    expect(near.phase).toBe('recover');expect(near.slowUntil-s.time).toBeCloseTo(tune.slowTime);
    expect(near.x).toBe(720);expect(near.hp).toBe(near.maxHp);
    s.enemyShots.push(shot(52,710));
    step(.08);
    expect(near.x).toBeGreaterThan(720);expect(near.x).toBeLessThan(720+tune.push);
    step(.18);
    expect(near.x).toBeCloseTo(720+tune.push);expect(near.dispatchRecoil).toBeUndefined();
    expect(far.slowUntil).toBe(0);
    expect(elites.every(e=>e.x===700&&e.slowUntil===0)).toBe(true);
    expect(s.enemyShots.map(q=>q.id)).toEqual([51,52]);
  });
  it('redeems a voucher on a full street and refreshes the three marked stands on recast',()=>{
    const {s,activate,step}=fixture();
    s.pickups=Array.from({length:4},(_,i)=>item(i,'heat',900));
    activate('supply');
    const first=s.pickups.filter(p=>p.groupId);
    expect(first.map(p=>p.kind)).toEqual(['fan','bubble','frost']);
    expect(new Set(first.map(p=>p.groupId)).size).toBe(1);
    step(2);activate('supply');
    const fresh=s.pickups.filter(p=>p.groupId);
    expect(fresh).toHaveLength(3);expect(fresh[0].groupId).not.toBe(first[0].groupId);
    expect(s.pickups.filter(p=>!p.groupId).map(p=>p.id)).toEqual([0,1,2,3]);
    expect(fresh.every(p=>p.readyAt===12.35&&p.expiresAt===24.35)).toBe(true);
  });
  it('places three separate reachable choices without overlap or an automatic pick in each corner',()=>{
    for(const x of [90,1190])for(const y of [180,630]){
      const {s,activate}=fixture();Object.assign(s.player,{x,y});activate('supply');
      expect(s.pickups).toHaveLength(3);
      s.pickups.forEach((p,i)=>{
        expect(p.y).toBeGreaterThanOrEqual(180);
        expect(Math.hypot(p.x-x,p.y-y)).toBeGreaterThan(CONFIG.pickup.choiceReach);
        for(const other of s.pickups.slice(i+1))expect(Math.hypot(p.x-other.x,p.y-other.y)).toBeGreaterThan(2*CONFIG.pickup.choiceReach);
      });
    }
  });
});

describe('skill and battle integration',()=>{
  const practice=()=>{const game=new Game(7);game.reset(7,true);return game;};
  it('keeps random cone footprints separated and inside the field at all four corners',()=>{
    const game=practice(),s=game.state,{left,right,bottom}=WORLD.bounds;
    const counts=new Set<number>();
    for(const x of [left+s.player.radius,right-s.player.radius])for(const y of [CONFIG.player.minY,bottom-s.player.radius]){
      Object.assign(s.player,{x,y,moveDirection:{x:x<640?-1:1,y:y<370?-1:1}});
      const layouts=new Set<string>();
      for(let i=0;i<8;i++){
        game.triggerSkill('cones');counts.add(s.zones.length);
        layouts.add(JSON.stringify(s.zones.map(z=>[z.x,z.y])));
        for(const [j,z] of s.zones.entries()){
          expect(z.x-z.radius).toBeGreaterThanOrEqual(left);expect(z.x+z.radius).toBeLessThanOrEqual(right);
          expect(z.y).toBeGreaterThanOrEqual(CONFIG.player.minY);expect(z.y+z.radius).toBeLessThanOrEqual(bottom);
          for(const other of s.zones.slice(j+1))expect(Math.hypot(other.x-z.x,other.y-z.y)).toBeGreaterThan(2*z.radius);
        }
      }
      expect(layouts.size).toBe(8);
    }
    expect([...counts].sort()).toEqual([5,6,7,8]);
  });
  it('a rider crosses a cone at full running pace while a walking enemy skirts it',()=>{
    const game=practice(),control=practice(),s=game.state;
    game.triggerSkill('cones');
    const cone={...s.zones[0],x:690,y:370};s.zones=[cone];
    game.update(.36,{x:1,y:0});control.update(.36,{x:1,y:0});
    expect(s.player.x).toBeGreaterThan(cone.x+cone.radius);
    expect(s.player.x).toBe(control.state.player.x);
    s.player.x=1100;s.player.y=580;s.weapon.readyAt=Infinity;
    const bun=game.spawnEnemy('bun',{x:cone.x-60,y:cone.y});bun.spawnAt=-2;bun.march={x:1,y:0,until:8};
    let deflection=0;
    for(let i=0;i<300;i++){
      game.update(CONFIG.step,{x:0,y:0});
      deflection=Math.max(deflection,Math.abs(bun.y-cone.y));
      expect(Math.hypot(bun.x-cone.x,bun.y-cone.y)).toBeGreaterThanOrEqual(cone.radius+bun.radius-1e-6);
    }
    expect(deflection).toBeGreaterThan(cone.radius);
    expect(bun.x).toBeGreaterThan(cone.x+cone.radius+bun.radius);expect(cone.hp).toBe(1);
  });
  it('clearing the street keeps worn equipment timers, and resetting a run removes every timer and tether',()=>{
    const game=practice(),s=game.state,p=s.player;
    game.spawnEnemy('bun',{x:p.x+80,y:p.y}).spawnAt=-1;
    s.pickups.push(item(99,'heat',p.x+190,p.y));
    game.triggerSkill('hook');game.triggerSkill('stamp');game.triggerSkill('dispatch');
    expect(s.pickups[0].pulledUntil).toBeGreaterThan(s.time);expect(s.enemies[0].dispatchRecoil).toBeDefined();
    game.clearArena();
    expect(s.enemies).toEqual([]);expect(s.pickups).toEqual([]);
    expect([p.stampUntil,s.effects.hookUntil,s.effects.dispatchUntil]).toEqual([12,4,4]);
    for(let i=0;i<5;i++)game.update(1,{x:0,y:0});
    expect(s.effects.dispatchCooldownUntil).toBeGreaterThan(s.time);
    game.reset(70,true);
    expect(game.state.pickups).toEqual([]);expect(game.state.enemies).toEqual([]);
    expect([game.state.player.stampUntil,game.state.effects.hookUntil,game.state.effects.dispatchUntil,game.state.effects.dispatchCooldownUntil]).toEqual([0,0,0,0]);
  });
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
  it('a stamp protects against contact from pickup until expiry without spending the bubble',()=>{
    const game=practice(),s=game.state,p=s.player,still={x:0,y:0};
    s.weapon.readyAt=Infinity;
    game.spawnEnemy('bun',p).stunUntil=100;
    game.triggerSkill('bubble');
    const bubbleUntil=p.bubbleUntil;
    s.pickups=[item(50,'stamp',p.x,p.y)];
    game.update(CONFIG.step,still);
    expect(p.hp).toBe(p.maxHp);
    expect(p.bubbleUntil).toBe(bubbleUntil);
    expect(p.stampUntil-s.time).toBeCloseTo(12);

    for(let i=0;i<11;i++)game.update(1,still);
    game.update(.99,still);
    expect(p.hp).toBe(p.maxHp);
    expect(game.drainEvents().some(e=>e.type==='defend'||(e.type==='damage'&&e.victimId===0))).toBe(false);
    game.update(CONFIG.step,still);
    expect(p.hp).toBe(p.maxHp-CONFIG.enemies.bun.damage);
  });
  it('soup crossing the umbrella and a giant landing are spent harmlessly during a stamp',()=>{
    const game=practice(),s=game.state,p=s.player;
    game.setWeapon('umbrella');
    s.weapon.readyAt=Infinity;
    s.weapon.attack={id:97,kind:'umbrella',phase:'active',startedAt:0,releaseAt:0,endsAt:1,angle:0,targetId:1,hitIds:[],blocked:false};
    game.triggerSkill('stamp');
    s.enemyShots=[{id:98,ownerId:10,x:p.x+60,y:p.y,px:p.x+60,py:p.y,vx:-3600,vy:0,radius:6,damage:8,bornAt:0,expiresAt:1}];
    game.update(CONFIG.step,{x:0,y:0});
    expect(s.weapon.attack?.blocked).toBe(false);
    expect(s.enemyShots).toHaveLength(0);
    expect(p.hp).toBe(p.maxHp);

    s.giantPulses=[{id:99,ownerId:7,hop:3,x:p.x,y:p.y,bornAt:s.time,reach:600,gapAngle:0,spent:false}];
    game.update(CONFIG.step,{x:0,y:0});
    expect(s.giantPulses[0].spent).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(game.drainEvents().some(e=>e.type==='defend'||(e.type==='damage'&&e.victimId===0))).toBe(false);
  });
  it('a newly collected skate applies real damage in its activation step',()=>{
    const game=practice();const target=game.spawnEnemy('bowl',{x:700,y:370});game.state.pickups=[item(50,'skate',640,370)];game.update(1/60,{x:0,y:0});
    expect(target.hp).toBe(100);expect(game.drainEvents().filter(e=>e.type==='damage'&&e.source==='skate')).toHaveLength(1);
  });
  it('keeps the offered supplies in place for twelve seconds then clears them',()=>{
    const game=practice(),s=game.state;game.triggerSkill('supply');
    const sites=s.pickups.map(p=>[p.id,p.x,p.y]);
    for(let i=0;i<12;i++)game.update(1,{x:0,y:0});
    expect(s.pickups.map(p=>[p.id,p.x,p.y])).toEqual(sites);
    game.update(.36,{x:0,y:0});expect(s.pickups).toHaveLength(0);expect(s.zones).toHaveLength(0);
  });
  it('hook leaves supply choices available for the rider to pick in person',()=>{
    const game=practice(),s=game.state;
    game.triggerSkill('supply');game.update(.36,{x:0,y:0});game.triggerSkill('hook');
    expect(s.pickups.filter(p=>p.pulledUntil)).toHaveLength(0);
    const chosen=s.pickups[1];
    const dx=chosen.x-s.player.x,dy=chosen.y-s.player.y,dist=Math.hypot(dx,dy);
    game.update(.3,{x:dx/dist,y:dy/dist});
    expect(game.drainEvents().filter(e=>e.type==='pickup').map(e=>e.kind)).toEqual([chosen.kind]);
    expect(s.pickups.every(p=>p.retiringUntil&&!p.pulledUntil)).toBe(true);
  });
  it('a waiting hook finds new orders, collects coins and finishes its last reel after the search ends',()=>{
    const game=practice(),s=game.state,p=s.player,still={x:0,y:0};
    game.triggerSkill('hook');
    s.coins=[{id:81,x:p.x+490,y:p.y,value:3,bornAt:-1},{id:82,x:p.x+540,y:p.y,value:5,bornAt:-1}];
    game.update(.12,still);
    expect(s.collectedCoins).toBe(0);
    expect(s.coins[0].x).toBeLessThan(p.x+490);
    expect(s.coins[1].attracted).toBeUndefined();
    for(let i=0;i<3;i++)game.update(1,still);
    expect(s.collectedCoins).toBe(3);
    game.update(.78,still);
    const late=item(83,'bubble',p.x+510,p.y,{vx:0,vy:0});
    s.pickups.push(late);
    game.update(.14,still);
    expect(s.time).toBeGreaterThan(s.effects.hookUntil);
    expect(late.pulledUntil).toBeGreaterThan(s.time);
    const expired=item(84,'heat',p.x-450,p.y,{vx:0,vy:0});
    s.pickups.push(expired);
    game.update(.55,still);
    expect(s.player.bubbleUntil).toBeGreaterThan(s.time);
    expect(expired.pulledUntil).toBeUndefined();
    expect(s.coins.map(c=>c.id)).toEqual([82]);
  });
  it('dispatch crossing a difficulty boundary waits one batch interval before reinforcements',()=>{
    const game=new Game(17);
    Object.assign(game.state,{time:89,stage:2,wave:3,waveStartedAt:70});
    game.state.weapon.readyAt=Infinity;game.state.player.invulnerableUntil=Infinity;game.triggerSkill('dispatch');
    for(let i=0;i<244;i++)game.update(1/60,{x:0,y:0});
    expect(game.state.stage).toBe(3);expect(game.state.enemies).toHaveLength(0);expect(game.state.effects.dispatchCooldownUntil).toBeCloseTo(95);
    // At stage 3 one batch interval is about 0.8 s. Time spent holding orders earns no backlog.
    game.update(.68,{x:0,y:0});expect(game.state.enemies).toHaveLength(0);
    game.update(.12,{x:0,y:0});expect(game.state.enemies).toHaveLength(16);
    game.update(.5,{x:0,y:0});expect(game.state.enemies).toHaveLength(16);
    expect(game.drainEvents().some(event=>event.type==='wave')).toBe(false);
  });
  it('bell expiry leaves a box in recovery before it resumes an ordinary chase',()=>{
    const game=practice();game.state.weapon.readyAt=Infinity;const box=game.spawnEnemy('box',{x:760,y:370});box.phase='dash';box.phaseUntil=10;box.dashX=-1;box.dashY=0;
    game.triggerSkill('bell');game.update(.12,{x:0,y:0});expect(box.stunUntil).toBeGreaterThan(game.state.time);expect(box.phase).toBe('recover');
    const stop=box.x;game.update(1,{x:0,y:0});game.update(1,{x:0,y:0});expect(box.phase).toBe('recover');expect(box.x).toBe(stop);expect(box.bellResistUntil).toBeGreaterThan(game.state.time);
    game.update(.41,{x:0,y:0});expect(box.phase).toBe('chase');expect(box.phaseUntil).toBeGreaterThan(game.state.time);expect(box.x).toBeLessThan(stop);
  });
  it('allows crossing a stunned charger while nearby unaffected enemies can still hurt the courier',()=>{
    const game=practice(),s=game.state,p=s.player,still={x:0,y:0};
    s.weapon.readyAt=Infinity;
    const box=game.spawnEnemy('box',{x:p.x+90,y:p.y});
    box.phase='dash';box.phaseUntil=2;box.dashX=-1;box.dashY=0;
    game.triggerSkill('bell');game.update(.1,still);
    p.x=box.x;p.y=box.y;
    game.update(1,still);game.update(.85,still);
    expect(box.bellStunUntil).toBeGreaterThan(s.time);
    expect(p.hp).toBe(p.maxHp);expect(p.invulnerableUntil).toBe(0);
    game.spawnEnemy('bun',{x:p.x,y:p.y});game.update(CONFIG.step,still);
    expect(s.lastDamage).toBe('bun');expect(p.hp).toBe(p.maxHp-CONFIG.enemies.bun.damage);
  });
});

