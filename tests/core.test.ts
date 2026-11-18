import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,WORLD,difficultyAt} from '../src/core/config';
import {relativeSweep,sweepContact} from '../src/core/geometry';
import type {EnemyKind,GameEvent,WeaponKind} from '../src/shared/types';
const zero={x:0,y:0};
function lab(kind:WeaponKind='tongs'){const g=new Game(77);g.reset(77,true);g.setWeapon(kind);g.state.weapon.readyAt=Infinity;g.drainEvents();return g;}
function tick(g:Game,seconds:number,input=zero){for(let i=0;i<Math.ceil(seconds*60);i++)g.update(1/60,input);}
function threat(g:Game,kind:EnemyKind,x=g.state.player.x,y=g.state.player.y){const e=g.spawnEnemy(kind,{x,y});e.phaseUntil=1000;return e;}

describe('HP and damage events',()=>{
  it.each([['bun',8],['box',12],['bowl',18]] as const)('%s contact removes exactly %s HP without failing', (kind,amount)=>{
    const g=lab();threat(g,kind);g.update(1/60,zero);
    expect(g.state.player.hp).toBe(100-amount);expect(g.state.ended).toBe(false);
    expect(g.drainEvents().filter(e=>e.type==='damage')).toMatchObject([{victimId:0,amount,source:kind}]);
  });
  it('dash damage is 20 rather than normal plus dash',()=>{const g=lab();const e=threat(g,'box');e.phase='dash';e.phaseUntil=10;g.update(1/60,zero);expect(g.state.player.hp).toBe(80);expect(g.state.lastDamage).toBe('dash');});
  it('ties choose higher damage independent of array order and preserve earliest contact priority',()=>{
    for(const reverse of [false,true]){const g=lab();threat(g,'bun');threat(g,'bowl');if(reverse)g.state.enemies.reverse();g.update(1/60,zero);expect(g.state.player.hp).toBe(82);}
    const g=lab();threat(g,'bun');const e=threat(g,'box',610,370);e.phase='dash';e.phaseUntil=10;e.dashX=10;g.update(1/60,zero);expect(g.state.player.hp).toBe(92);
  });
  it('global 0.75s protection prevents per-frame and multiple-enemy damage then expires',()=>{
    const g=lab();threat(g,'bun');threat(g,'box');g.update(1/60,zero);const hp=g.state.player.hp;
    tick(g,.7);expect(g.state.player.hp).toBe(hp);tick(g,.1);expect(g.state.player.hp).toBe(hp-12);
  });
  it('actual overkill is clamped; HP zero freezes state and emits exactly one failure',()=>{
    const g=lab();g.state.player.hp=5;threat(g,'bowl');g.update(1/60,zero);
    const events=g.drainEvents();expect(events.filter(e=>e.type==='damage')).toMatchObject([{amount:5,nominal:18}]);expect(events.filter(e=>e.type==='fail')).toHaveLength(1);
    const before=structuredClone(g.state);g.update(1,zero);g.healPlayer();g.triggerSkill('fan');expect(g.state).toEqual(before);expect(g.drainEvents()).toEqual([]);
  });
  it('a surviving enemy stays dangerous after an attack, while fan damage is real and bounded',()=>{
    const g=lab();const e=threat(g,'bowl');g.triggerSkill('fan');expect(e.hp).toBe(30);expect(g.state.kills).toBe(0);
    e.x=g.state.player.x;e.y=g.state.player.y;g.update(1/60,zero);expect(g.state.player.hp).toBe(82);
    g.triggerSkill('fan');expect(g.state.enemies).toHaveLength(0);expect(g.state.kills).toBe(1);
  });
  it('fan picked up on contact removes a bun before its damage, soda never heals or damages',()=>{
    const g=lab();threat(g,'bun');g.state.pickups=[{id:999,kind:'fan',x:640,y:370,radius:14,bornAt:0}];g.update(1/60,zero);expect(g.state.player.hp).toBe(100);expect(g.state.kills).toBe(1);
    const h=lab();threat(h,'box');h.triggerSkill('soda');h.update(1/60,zero);expect(h.state.player.hp).toBe(88);expect(h.state.enemies[0].hp).toBe(60);
  });
  it('bubble resists one event and is not consumed during existing global protection',()=>{
    const g=lab();threat(g,'bowl');g.triggerSkill('bubble');g.update(1/60,zero);expect(g.state.player.hp).toBe(100);expect(g.state.player.bubbleUntil).toBe(0);
    g.triggerSkill('bubble');tick(g,.3);expect(g.state.player.bubbleUntil).toBeGreaterThan(g.state.time);expect(g.state.player.hp).toBe(100);
  });
  it('practice healing clamps to actual missing HP and resetting restores default rules',()=>{
    const g=lab('knife');g.state.player.hp=90;g.healPlayer();g.healPlayer();expect(g.drainEvents().filter(e=>e.type==='heal')).toMatchObject([{amount:10}]);
    g.reset(77);expect(g.state.player.hp).toBe(100);expect(g.state.weapon.kind).toBe('tongs');expect(g.state.practice).toBe(false);
  });
});

describe('movement and seeded simulation',()=>{
  it('uses continuous sweeps even for a fast crossing',()=>{expect(sweepContact({x:0,y:0},{x:100,y:0},{x:50,y:0},10)).toBeCloseTo(.4);expect(relativeSweep({x:0,y:0},{x:100,y:0},{x:100,y:0},{x:0,y:0},10)).toBeCloseTo(.45);const g=lab();const e=threat(g,'box',540,370);e.phase='dash';e.phaseUntil=10;e.dashX=40;g.update(1/60,zero);expect(g.state.player.hp).toBe(80);});
  it('normalizes diagonals, brakes smoothly and slides on boundaries',()=>{const a=lab(),b=lab();tick(a,.5,{x:1,y:0});tick(b,.5,{x:1,y:1});expect(Math.hypot(a.state.player.x-640,a.state.player.y-370)).toBeCloseTo(Math.hypot(b.state.player.x-640,b.state.player.y-370));tick(a,.1);expect(a.state.player.vx).toBeCloseTo(0);a.state.player.x=WORLD.bounds.right-a.state.player.radius;const y=a.state.player.y;tick(a,.2,{x:1,y:1});expect(a.state.player.x).toBe(WORLD.bounds.right-a.state.player.radius);expect(a.state.player.y).toBeGreaterThan(y);});
  it('invalid input/time and huge dt stay finite and bounded',()=>{const g=lab();g.update(NaN,zero);g.update(Infinity,zero);g.update(-1,zero);expect(g.state.time).toBe(0);g.update(Number.MAX_VALUE,{x:NaN,y:Infinity});expect(g.state.time).toBeCloseTo(1);expect(g.state.player.x).toBe(640);});
  it('spawn grace protects both sides until a live ground fire can intercept the enemy',()=>{
    const g=new Game(31);
    const e=g.spawnEnemy('bun',g.state.player);
    g.triggerSkill('fan');
    tick(g,.3);
    expect(e.hp).toBe(30);
    expect(g.state.player.hp).toBe(100);
    tick(g,.4);
    expect(e.hp).toBe(0);
    expect(g.state.player.hp).toBe(100);
  });
  it('phase parameters stay capped without inflating enemy HP or damage',()=>{expect(difficultyAt(30).stage).toBe(2);expect(difficultyAt(90).stage).toBe(3);expect(difficultyAt(180).stage).toBe(4);expect(difficultyAt(1e9)).toEqual(difficultyAt(300));expect(CONFIG.enemies.bowl.hp).toBe(120);});
  it('same seed and inputs reproduce state plus damage event IDs',()=>{const a=new Game(4488),b=new Game(4488);const ea:GameEvent[]=[],eb:GameEvent[]=[];for(let i=0;i<1200;i++){const input={x:Math.cos(i*.01),y:Math.sin(i*.01)};a.update(1/60,input);b.update(1/60,input);ea.push(...a.drainEvents());eb.push(...b.drainEvents());}expect(a.state).toEqual(b.state);expect(ea).toEqual(eb);});
});
