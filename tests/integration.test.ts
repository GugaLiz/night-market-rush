import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,WORLD,difficultyAt} from '../src/core/config';
import type {GameEvent,WeaponKind} from '../src/shared/types';
const zero={x:0,y:0};
function tick(g:Game,seconds:number,input=zero){for(let i=0;i<Math.ceil(seconds*60);i++)g.update(1/60,input);}
function lab(kind:WeaponKind){const g=new Game(12);g.reset(12,true);g.setWeapon(kind);g.state.weapon.readyAt=0;g.state.player.invulnerableUntil=1e6;g.drainEvents();return g;}
function target(g:Game,x:number,y=370){const e=g.spawnEnemy('bowl',{x,y});e.stunUntil=1e6;return e;}
function fire(g:Game){for(let i=0;i<90;i++){g.update(1/60,zero);if(g.state.weapon.attack?.phase==='active'){g.state.weapon.readyAt=Infinity;return;}}throw Error('weapon never released');}
const damage=(events:GameEvent[],source:WeaponKind)=>events.filter(e=>e.type==='damage'&&e.source===source);

describe('V3 weapon damage through the real Game context',()=>{
  it.each([['tongs',30],['bag',24],['chopsticks',42],['spirit',40],['knife',32],['sword',65],['talisman',40],['umbrella',36]] as const)('%s applies its total %s through five real HP decrements', (kind,total)=>{
    const g=lab(kind);const e=target(g,730);fire(g);tick(g,.65);
    expect(120-e.hp).toBe(total);
    const hits=damage(g.drainEvents(),kind).filter(v=>v.type==='damage'&&v.victimId===e.id);
    expect(hits).toHaveLength(5);expect(hits.map(v=>v.type==='damage'?v.burstIndex:0)).toEqual([1,2,3,4,5]);
    expect(hits.reduce((sum,v)=>sum+(v.type==='damage'?v.amount:0),0)).toBe(total);
  });
  it('tray keeps separate five-part outward and return hits on the same enemy',()=>{
    const g=lab('tray'),e=target(g,720);fire(g);tick(g,1.8);expect(e.hp).toBe(62);
    const hits=damage(g.drainEvents(),'tray');expect(hits).toHaveLength(10);expect(hits.reduce((sum,v)=>sum+(v.type==='damage'?v.amount:0),0)).toBe(58);
  });
  it('lunchbox lands at fixed forward range after delay, never retargets to a closer cluster',()=>{
    const g=lab('lunchbox'),near=target(g,760),far=target(g,940);fire(g);tick(g,.5);expect(far.hp).toBe(120);tick(g,.2);expect(far.hp).toBe(60);expect(near.hp).toBe(120);expect(damage(g.drainEvents(),'lunchbox')).toHaveLength(5);
  });
});
describe('weapon integration and bounded sessions',()=>{
  it('low HP stops the five-part burst immediately and awards a single kill',()=>{const g=lab('knife'),e=g.spawnEnemy('bun',{x:690,y:370});e.hp=9;e.stunUntil=1e6;fire(g);tick(g,.2);expect(g.state.kills).toBe(1);expect(damage(g.drainEvents(),'knife').map(e=>e.type==='damage'?e.amount:0)).toEqual([7,2]);});
  it('heat does not reset an existing cooldown, switching retains it and old projectiles',()=>{const g=lab('chopsticks');target(g,820);fire(g);g.state.weapon.readyAt=g.state.time+2;const ready=g.state.weapon.readyAt;const ids=g.state.projectiles.map(p=>p.id);g.triggerSkill('heat');expect(g.state.weapon.readyAt).toBe(ready);g.setWeapon('bag');expect(g.state.weapon.readyAt).toBe(ready);expect(g.state.projectiles.map(p=>p.id)).toEqual(ids);});
  it('a return package is locked for two seconds and requires leaving before reentry',()=>{const g=lab('tongs');g.state.weaponDrops=[{id:100,kind:'knife',x:640,y:370,radius:12,bornAt:0,expiresAt:20,readyAt:0,returnDrop:false,leftPickupCircle:true}];g.update(1/60,zero);expect(g.state.weapon.kind).toBe('knife');tick(g,2.1);expect(g.state.weapon.kind).toBe('knife');tick(g,.3,{x:1,y:0});tick(g,.45,{x:-1,y:0});expect(g.state.weapon.kind).toBe('tongs');expect(g.state.weaponDrops.filter(d=>d.returnDrop)).toHaveLength(1);});
  it('removing enemies does not cancel a directional windup or invent a replacement target',()=>{const g=lab('sword');target(g,730);g.update(1/60,zero);g.state.enemies=[];tick(g,.35);expect(g.state.weapon.attack?.targetId).toBe(-1);expect(g.state.weapon.attack?.angle).toBe(0);expect(g.drainEvents().filter(e=>e.type==='attack')).toHaveLength(1);});
  it('irregular host frames preserve fixed-step outcomes and event order',()=>{const a=new Game(223),b=new Game(223);const ea:GameEvent[]=[],eb:GameEvent[]=[];for(let i=0;i<300;i++){const n=[1,2,5,3][i%4],input={x:Math.cos(i/17),y:Math.sin(i/17)};a.update(n/60,input);for(let j=0;j<n;j++)b.update(1/60,input);ea.push(...a.drainEvents());eb.push(...b.drainEvents());}expect(a.state.score).toBe(b.state.score);expect(a.state.player.hp).toBe(b.state.player.hp);expect(a.state.time).toBeCloseTo(b.state.time,9);expect(ea.map(e=>e.type)).toEqual(eb.map(e=>e.type));});
  it('ten-minute scheduler retains capped enemy counts, unique entities and finite positions',()=>{const g=new Game(1811);g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=1e6;const stages=new Set<number>();for(let frame=0;frame<36001;frame++){for(const e of g.state.enemies){e.x=120;e.y=150;e.stunUntil=1e6;}g.update(1/60,zero);stages.add(g.state.stage);if(frame%60===0){expect(g.state.enemies.length).toBeLessThanOrEqual(difficultyAt(g.state.time).cap);expect(g.state.pickups.length).toBeLessThanOrEqual(CONFIG.pickup.cap);expect(g.state.weaponDrops.length).toBeLessThanOrEqual(3);expect(g.state.projectiles.length).toBeLessThanOrEqual(24);for(const e of g.state.enemies)expect(Number.isFinite(e.x)&&Number.isFinite(e.y)).toBe(true);}}expect(stages).toEqual(new Set([1,2,3,4]));expect(g.state.time).toBeGreaterThan(600);expect(g.drainEvents().length).toBeLessThanOrEqual(1024);},15000);
});


describe('defense, cooldown and source budgets',()=>{
  it('umbrella forward attack clears a fragile threat without spending bubble',()=>{const g=lab('umbrella');g.state.player.invulnerableUntil=0;g.triggerSkill('bubble');g.spawnEnemy('bun',{x:730,y:370});tick(g,.4);expect(g.state.kills).toBe(1);expect(g.state.player.bubbleUntil).toBeGreaterThan(g.state.time);expect(g.state.player.hp).toBe(100);});
  it('umbrella never blocks the rear and existing global protection consumes neither defense',()=>{
    const g=lab('umbrella');g.state.player.invulnerableUntil=0;
    g.state.weapon.attack={id:99,kind:'umbrella',phase:'active',startedAt:0,releaseAt:0,endsAt:1,angle:0,targetId:1,hitIds:[],blocked:false};g.state.weapon.readyAt=5;
    g.spawnEnemy('bun',{x:625,y:370});g.update(1/60,zero);expect(g.state.player.hp).toBe(92);expect(g.state.weapon.attack?.blocked).toBe(false);
    g.triggerSkill('bubble');tick(g,.2);expect(g.state.player.bubbleUntil).toBeGreaterThan(g.state.time);expect(g.state.weapon.attack?.blocked).toBe(false);
  });
  it('heat shortens only the next new release cooldown by 0.8',()=>{
    const g=lab('tongs');target(g,700);g.triggerSkill('heat');
    for(let i=0;i<20;i++){g.update(1/60,zero);if(g.state.weapon.attack?.phase==='active')break;}
    expect(g.state.weapon.readyAt-g.state.time).toBeCloseTo(.55*.8,8);
    const cooldown=g.state.weapon.readyAt;g.triggerSkill('heat');expect(g.state.weapon.readyAt).toBe(cooldown);
  });
  it('old projectiles share the hard budget with a newly equipped bag',()=>{
    const g=lab('chopsticks');target(g,820);fire(g);const template=g.state.projectiles[0];expect(template).toBeTruthy();
    g.state.projectiles=Array.from({length:23},(_,i)=>({...template,id:1000+i,vx:0,vy:0,hitIds:[],phaseHitIds:[],expiresAt:100}));
    g.setWeapon('bag');g.state.weapon.readyAt=0;tick(g,.5);expect(g.state.projectiles.length).toBe(23);expect(g.state.weapon.attack).toBeNull();
  });
  it('same-step skate pickup can finish an injured contact threat before player damage',()=>{
    const g=lab('tongs');g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=0;
    // Bowl overlaps the attack ring with its large radius while touching the player.
    const e=g.spawnEnemy('bowl',{x:670,y:370});e.hp=6;e.stunUntil=100;
    g.state.pickups=[{id:100,kind:'skate',x:640,y:370,radius:14,bornAt:0}];g.update(1/60,zero);
    expect(g.state.kills).toBe(1);expect(g.state.player.hp).toBe(100);
  });
});

