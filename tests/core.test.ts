import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,WORLD,difficultyAt} from '../src/core/config';
import {relativeSweep,sweepContact} from '../src/core/geometry';
import {spawnMarketEnemies} from '../src/core/waves';
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
  it('skips failed random placements and observes the population cap, including warnings',()=>{
    const g=new Game(4),s=g.state,events:GameEvent[]=[];
    const ctx={random:()=>0,emit:(e:GameEvent)=>{events.push(e);}};
    const spawn=(kind:EnemyKind,p:{x:number;y:number})=>g.spawnEnemy(kind,p);
    const difficulty={...difficultyAt(0),cap:3};
    spawnMarketEnemies(s,difficulty,7,spawn,ctx);
    expect(s.enemies).toHaveLength(1);expect(events).toHaveLength(1);
    // Every draw above picked the same occupied corner. The next free draw can still enter.
    ctx.random=()=>.90;
    spawnMarketEnemies(s,difficulty,7,spawn,ctx);
    expect(s.enemies).toHaveLength(2);
    s.player.x=WORLD.bounds.left+s.enemies[0].radius;s.player.y=CONFIG.player.minY;
    s.enemies.shift();ctx.random=()=>0;
    spawnMarketEnemies(s,difficulty,1,spawn,ctx);
    expect(s.enemies).toHaveLength(1);expect(events).toHaveLength(2);
    // With no space under the cap the spawner does not even draw a candidate.
    ctx.random=()=>{throw new Error('over-cap spawn');};
    spawnMarketEnemies(s,{...difficulty,cap:1},6,spawn,ctx);
    expect(s.enemies).toHaveLength(1);
  });
  it('uses the interior and all quadrants for reinforcements before and after a normal wave transition',()=>{
    for(const seed of [7,29,81,1907]){
      const g=new Game(seed),s=g.state;
      s.player.invulnerableUntil=1000;s.weapon.readyAt=Infinity;
      const quadrants=[new Set<number>(),new Set<number>()],interior=[0,0];
      const kinds=[new Set<EnemyKind>(),new Set<EnemyKind>()];
      tick(g,.4);s.enemies=[];
      for(let frame=0;frame<60*46;frame++){
        const previous=s.enemies.map(e=>({x:e.x,y:e.y,r:e.radius}));
        g.update(1/60,zero);
        const born=s.enemies.filter(e=>e.spawnAt===s.time);
        if(!born.length)continue;
        const wave=Math.min(s.wave,2)-1;
        for(const e of born){
          expect(e.march).toBeUndefined();
          expect(Math.hypot(e.x-s.player.x,e.y-s.player.y)-e.radius-s.player.radius).toBeGreaterThanOrEqual(CONFIG.spawn.safeDistance);
          expect(previous.every(q=>Math.hypot(e.x-q.x,e.y-q.y)-e.radius-q.r>=CONFIG.spawn.gap)).toBe(true);
          previous.push({x:e.x,y:e.y,r:e.radius});
          quadrants[wave].add(Number(e.x>640)+2*Number(e.y>410));
          kinds[wave].add(e.kind);
          if(e.x>340&&e.x<940&&e.y>288&&e.y<535)interior[wave]++;
        }
        // Leave these bodies on the floor for the next arrival, and make vacancies for subsequent sets.
        s.enemies=born;
      }
      expect(quadrants.map(q=>q.size)).toEqual([4,4]);
      for(const waveKinds of kinds)for(const snack of ['bun','onigiri','siumai','zongzi'] as const)expect(waveKinds.has(snack)).toBe(true);
      expect(interior.every(count=>count>=2)).toBe(true);
    }
  });
  it('skips a saturated late-game floor below its cap, then fills only genuinely cleared space',()=>{
    const g=new Game(284),s=g.state;
    Object.assign(s,{time:200,wave:6,waveStartedAt:198});
    s.player.invulnerableUntil=1000;s.weapon.readyAt=Infinity;
    for(let column=0;column<14;column++)for(let row=0;row<6;row++){
      const e=g.spawnEnemy('bun',{x:118+column*80,y:215+row*76});
      e.stunUntil=1000;
    }
    const count=s.enemies.length;
    expect(count).toBeLessThan(difficultyAt(s.time).cap);
    tick(g,1.5);
    expect(s.enemies).toHaveLength(count);
    expect(g.drainEvents().filter(e=>e.type==='spawn')).toHaveLength(0);
    s.enemies=s.enemies.filter(e=>e.x>=500||e.y>=460);
    const retained=s.enemies.slice();
    tick(g,1.3);
    const spawned=g.drainEvents().filter(e=>e.type==='spawn');
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every(e=>e.x<500 && e.y<460)).toBe(true);
    expect(spawned.every(e=>retained.every(q=>Math.hypot(e.x-q.x,e.y-q.y)>=CONFIG.spawn.gap+q.radius+CONFIG.enemies.bun.radius))).toBe(true);
  });
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
