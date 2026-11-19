import {describe, expect, it} from 'vitest';
import {CONFIG, WORLD} from '../src/core/config';
import {ELEMENTAL} from '../src/core/elemental-skills';
import {Game} from '../src/core/game';
import {ELEMENTAL_KINDS, type Vec} from '../src/shared/types';

const still={x:0,y:0};
function practice(){
  const game=new Game(2611);
  game.reset(2611,true);
  game.state.weapon.readyAt=Infinity;
  return game;
}
function ticks(game:Game,frames:number,input:Vec=still){
  for(let frame=0;frame<frames;frame++) game.update(CONFIG.step,input);
}
function toughBowl(game:Game,at:Vec){
  const enemy=game.spawnEnemy('bowl',at);
  enemy.hp=enemy.maxHp=400;
  enemy.stunUntil=20;
  return enemy;
}

describe('elemental delivery skills',()=>{
  it('pulls grounded enemies from both ends of the street without hurting or moving the rider, then scores one implosion',()=>{
    const game=practice(),s=game.state,p=s.player;
    const positions=[{x:110,y:195},{x:1160,y:600},{x:p.x,y:p.y}];
    const targets=positions.map(at=>toughBowl(game,at));
    game.triggerSkill('vortex');
    const pot=s.elementalFields![0],p0={x:p.x,y:p.y};
    const separation=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y);
    expect(separation(p,pot)).toBeCloseTo(ELEMENTAL.vortex.offset);
    ticks(game,60);
    targets.forEach((e,i)=>{
      expect(separation(e,pot)).toBeLessThan(separation(positions[i],pot)*.45);
      expect(e.hp).toBe(400);
    });
    expect(p.hp).toBe(100);expect({x:p.x,y:p.y}).toEqual(p0);
    ticks(game,90,{x:-1,y:0});
    expect(p.x).toBeLessThan(p0.x-200);
    expect(targets.every(e=>separation(e,pot)>=21&&separation(e,pot)<76)).toBe(true);
    expect(separation(targets[0],targets[1])).toBeGreaterThan(12);
    ticks(game,39);
    expect(targets.every(e=>separation(e,pot)<16)).toBe(true);
    ticks(game,60);
    const events=game.drainEvents();
    expect(events.filter(e=>e.type==='elementalBurst'&&e.kind==='vortex')).toHaveLength(1);
    expect(events.filter(e=>e.type==='damage'&&e.source==='vortex')).toHaveLength(3);
    expect(targets.map(e=>e.hp)).toEqual(positions.map(()=>400-ELEMENTAL.vortex.damage));
    expect(s.elementalFields).toEqual([]);
  });

  it('places the vortex inside the arena at a wall and waits for airborne or arriving enemies to become tangible',()=>{
    const game=practice(),s=game.state,p=s.player;
    p.x=WORLD.bounds.right-p.radius;p.moveDirection={x:1,y:0};
    const target={x:238,y:240};
    const giant=game.spawnEnemy('giantBun',target);
    giant.jump={phase:'flight',hop:1,startedAt:0,until:.45,from:target,target,gapAngle:0};
    const arrival=game.spawnEnemy('bun',{x:118,y:580});
    arrival.spawnAt=0;
    game.triggerSkill('vortex');
    const pot=s.elementalFields![0];
    expect(p.x-pot.x).toBeCloseTo(ELEMENTAL.vortex.offset);
    ticks(game,18);expect(giant.x).toBe(target.x);expect(arrival.x).toBe(118);
    ticks(game,60);expect(giant.x).toBeGreaterThan(target.x+100);expect(arrival.x).toBeGreaterThan(218);
    ticks(game,140);expect(s.kills).toBe(1);expect(giant.hp).toBe(giant.maxHp-ELEMENTAL.vortex.damage);
  });

  it('lets poison linger when a target leaves and ticks on one clock across overlapping casts',()=>{
    const game=practice(),s=game.state,p=s.player;
    const enemy=toughBowl(game,{x:p.x+70,y:p.y});
    const outside=toughBowl(game,{x:p.x+330,y:p.y});
    game.triggerSkill('poison');
    ticks(game,40);expect(enemy.hp).toBe(400-ELEMENTAL.poison.damage);
    const next=enemy.poisonNextAt!;
    game.triggerSkill('poison');
    ticks(game,6);expect(enemy.poisonNextAt).toBe(next);
    const tail=enemy.poisonUntil!;
    enemy.x=enemy.px=p.x-400;
    ticks(game,180);
    const expected=1+Math.floor((tail-next+1e-9)/ELEMENTAL.poison.interval)+1;
    expect(enemy.hp).toBe(400-expected*ELEMENTAL.poison.damage);
    expect(enemy.poisonUntil).toBeUndefined();expect(enemy.poisonNextAt).toBeUndefined();
    const hp=enemy.hp;ticks(game,180);expect(enemy.hp).toBe(hp);expect(outside.hp).toBe(400);
    expect(s.elementalFields).toEqual([]);
  });

  it('stops charging and aiming as the frost rim reaches each side, then shatters the captured enemies just once',()=>{
    const game=practice(),s=game.state,p=s.player;
    const near=game.spawnEnemy('box',{x:p.x-82,y:p.y});
    near.hp=near.maxHp=225;near.phase='dash';near.phaseUntil=2;near.dashX=1;
    const far=game.spawnEnemy('bowl',{x:p.x+325,y:p.y});
    far.shotWarnUntil=2;far.volleyRemaining=0;
    const outside=toughBowl(game,{x:p.x-455,y:p.y});
    game.triggerSkill('frost');
    ticks(game,7);expect(near.frostUntil).toBe(ELEMENTAL.frost.duration);
    expect(near.phase).toBe('recover');expect(far.frostUntil).toBeUndefined();
    ticks(game,54);expect(far.frostUntil).toBe(ELEMENTAL.frost.duration);expect(far.shotWarnUntil).toBe(0);
    const before=[near.x,far.x];
    ticks(game,100);expect([near.x,far.x]).toEqual(before);expect(near.hp).toBe(225);expect(far.hp).toBe(120);
    // A late arrival standing in the old circle did not cross the ice front.
    const late=game.spawnEnemy('bun',{x:p.x,y:p.y+80});
    ticks(game,71);expect(near.hp).toBe(225-ELEMENTAL.frost.damage);expect(far.hp).toBe(120-ELEMENTAL.frost.damage);
    expect(s.enemyShots).toHaveLength(0);expect(near.frostUntil).toBeUndefined();
    expect(late.hp).toBe(late.maxHp);expect(outside.hp).toBe(400);
    const events=game.drainEvents();
    expect(events.filter(e=>e.type==='elementalBurst'&&e.kind==='frost')).toHaveLength(1);
    const hit=events.find(e=>e.type==='damage'&&e.source==='frost'&&e.victimId===near.id);
    expect(hit?.type==='damage'&&hit.time).toBeCloseTo(3);
  });

  it('settles an old freeze after recasting at a distant spot, and clears all three effects on a practice reset',()=>{
    const game=practice(),s=game.state;
    const frozen=toughBowl(game,{x:400,y:370});
    game.triggerSkill('frost');ticks(game,60);
    s.player.x=s.player.px=1110;
    game.triggerSkill('frost');ticks(game,121);
    expect(frozen.hp).toBe(400-ELEMENTAL.frost.damage);
    for(let i=0;i<6;i++)for(const kind of ELEMENTAL_KINDS)game.triggerSkill(kind);
    expect(s.elementalFields).toHaveLength(3);
    game.clearArena();ticks(game,1);expect(s.elementalFields).toEqual([]);
    game.triggerSkill('poison');game.reset(7,true);
    expect(game.state.elementalFields??[]).toEqual([]);
  });

  it('credits one kill when an enemy shatters on its next poison tick',()=>{
    const game=practice(),s=game.state,p=s.player;
    const enemy=game.spawnEnemy('bowl',{x:p.x+60,y:p.y});
    game.triggerSkill('frost');game.triggerSkill('poison');ticks(game,179);
    enemy.hp=5;enemy.poisonNextAt=enemy.frostUntil;
    ticks(game,1);
    const kills=game.drainEvents().filter(e=>e.type==='kill');
    expect(kills).toHaveLength(1);expect(kills[0]).toMatchObject({victimId:enemy.id,source:'frost'});
    expect(s.kills).toBe(1);expect(s.enemies).toHaveLength(0);
  });
});
