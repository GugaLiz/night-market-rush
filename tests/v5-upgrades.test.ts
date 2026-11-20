import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../src/core/config';
import {ELEMENTAL,trayBrineContact} from '../src/core/elemental-skills';
import {Game} from '../src/core/game';
import type {ElementalField,MarketUpgrade,Vec} from '../src/shared/types';

const still={x:0,y:0}, right={x:1,y:0};
function arena(upgrade:MarketUpgrade){
  const game=new Game(65);
  game.reset(65,true);
  game.state.market.upgrade=upgrade;
  game.state.weapon.readyAt=Infinity;
  return game;
}
function advance(game:Game,seconds:number,input:Vec=still){
  for(let i=0;i<Math.round(seconds/CONFIG.step);i++)game.update(CONFIG.step,input);
}
function target(game:Game,x:number,y:number){
  const enemy=game.spawnEnemy('bowl',{x,y});
  enemy.hp=enemy.maxHp=600;
  enemy.stunUntil=100;
  return enemy;
}
function place(game:Game,x:number,y:number){
  Object.assign(game.state.player,{x,y,px:x,py:y});
}

describe('market delivery box upgrades',()=>{
  it('breaks each traversed shell once and sends shards only from the first shell, in travel order',()=>{
    const game=arena('frost'),{x,y}=game.state.player;
    const second=target(game,x+94,y), far=target(game,x+166,y);
    const rear=target(game,x-75,y), side=target(game,x+90,y+62), first=target(game,x+50,y);
    game.triggerSkill('frost');advance(game,.85);
    expect(game.dash(right)).toBe(true);
    advance(game,.25,right);
    const events=game.drainEvents();
    expect(events.filter(e=>e.type==='frostShatter').map(e=>e.x)).toEqual([first.x,second.x]);
    expect(events.filter(e=>e.type==='iceShards')).toEqual([{type:'iceShards',x:first.x,y,angle:0,reach:ELEMENTAL.frost.shardReach}]);
    const {damage,shardDamage}=ELEMENTAL.frost;
    expect([first,second,far,rear,side].map(e=>600-e.hp)).toEqual([damage,damage+shardDamage,shardDamage,0,0]);
    expect(first.frostUntil).toBeUndefined();
    expect(first.stunUntil).toBe(100);
    advance(game,2);
    expect([first,second,far,rear,side].map(e=>600-e.hp)).toEqual([damage,damage+shardDamage,damage+shardDamage,damage,damage]);
    const thaw=game.drainEvents().filter(e=>e.type==='damage'&&e.source==='frost');
    expect(thaw).toHaveLength(3);

    advance(game,1);
    game.triggerSkill('frost');advance(game,.5);game.dash({x:-1,y:0});advance(game,.2,{x:-1,y:0});
    expect(game.drainEvents().filter(e=>e.type==='iceShards')).toHaveLength(1);
  });

  it('does not refreeze a shattered target on the same advancing rim; another cast can freeze it again',()=>{
    const game=arena('frost'),p=game.state.player;
    const e=game.spawnEnemy('bowl',{x:p.x+12,y:p.y});
    e.hp=e.maxHp=400;
    game.triggerSkill('frost');
    expect(e.frostUntil).toBeDefined();
    game.dash();advance(game,.1);
    expect(e.frostUntil).toBeUndefined();expect(e.hp).toBe(400-ELEMENTAL.frost.damage);
    expect(e.stunUntil).toBe(0);
    advance(game,3);
    expect(e.hp).toBe(400-ELEMENTAL.frost.damage);
    game.triggerSkill('frost');advance(game,.5);
    expect(e.frostUntil).toBeDefined();
  });

  it('excludes normal running, cancelled or stationary dashes, unowned upgrades, and icebox short freezes',()=>{
    const game=arena('frost'),p=game.state.player;
    const e=target(game,p.x+12,p.y);
    game.triggerSkill('frost');advance(game,.05,right);
    game.dash(right);advance(game,.05,still);
    expect(e.hp).toBe(600);expect(e.frostUntil).toBeDefined();
    place(game,WORLD.bounds.right-p.radius,p.y);
    const wall=target(game,p.x,p.y);
    game.triggerSkill('frost');p.dashReadyAt=0;game.dash(right);advance(game,.25,right);
    expect(wall.hp).toBe(600);

    game.state.enemies=[];
    advance(game,ELEMENTAL.frost.duration+ELEMENTAL.frost.fade);
    place(game,640,370);
    const cold=target(game,690,370);
    game.triggerSkill('icebox');advance(game,.35);
    expect(cold.chilledUntil).toBeGreaterThan(game.state.time);
    const hp=cold.hp;
    p.dashReadyAt=0;game.dash(right);advance(game,.22,right);
    expect(cold.hp).toBe(hp);
    game.state.market.upgrade=null;game.triggerSkill('frost');advance(game,.65);
    p.dashReadyAt=0;game.dash({x:-1,y:0});advance(game,.22,{x:-1,y:0});
    expect(cold.hp).toBe(hp);
  });

  it('keeps brine on the individual tray through its return and shares the poison tick clock across hits',()=>{
    const game=arena('brine'),s=game.state;
    place(game,530,590);game.triggerSkill('poison');advance(game,.65);
    place(game,285,249);game.setWeapon('tray');s.weapon.readyAt=s.time;
    const before=target(game,354,249), after=target(game,705,249);
    advance(game,.1);s.weapon.readyAt=Infinity;
    const [center,upper,lower]=s.projectiles;
    expect([center,upper,lower].map(q=>q.brined)).toEqual([undefined,undefined,undefined]);
    advance(game,.40);
    expect(before.hp).toBe(600-58);expect(before.poisonUntil).toBeUndefined();
    expect([center,upper,lower].map(q=>q.brined)).toEqual([true,undefined,true]);
    // Follow the central tray; another member of the volley cannot claim a shared return hit first.
    s.projectiles=[center];
    for(let i=0;i<60&&center.phase==='out';i++)game.update(CONFIG.step,still);
    expect(center.phase).toBe('return');
    expect(after.hp).toBe(600-58);
    const firstTick=after.poisonNextAt!, firstTail=after.poisonUntil!;
    game.setWeapon('bag');expect(s.market.upgrade).toBe('brine');
    advance(game,.1);
    expect(after.poisonUntil).toBeGreaterThan(firstTail);
    expect(after.poisonNextAt).toBe(firstTick);
    advance(game,.75);
    expect(s.projectiles).toHaveLength(0);
    expect(before.poisonUntil).toBeDefined();
    advance(game,3.2);
    const tailDamage=ELEMENTAL.poison.linger/ELEMENTAL.poison.interval*ELEMENTAL.poison.damage;
    expect(before.hp).toBe(600-58-44-tailDamage);
    expect(after.hp).toBe(600-58-44-tailDamage);
    expect(before.poisonNextAt).toBeUndefined();
    game.reset(23,true);expect(game.state.market.upgrade).toBeNull();
  });

  it('uses the actual hit order inside a single swept step, including a dry victim before the wet one',()=>{
    const game=arena('brine'),s=game.state;
    place(game,600,370);game.triggerSkill('poison');
    s.elementalFields![0].radius=16;advance(game,.6);
    place(game,390,370);game.setWeapon('tray');s.weapon.readyAt=s.time;
    for(let i=0;i<12&&!s.projectiles.length;i++)game.update(CONFIG.step,still);
    const tray=s.projectiles[0];s.projectiles=[tray];s.weapon.readyAt=Infinity;
    const earlier=target(game,501,370), later=target(game,681,370);
    tray.vx=24000;
    game.update(CONFIG.step,still);
    expect(earlier.hp).toBe(542);expect(earlier.poisonUntil).toBeUndefined();
    expect(later.hp).toBe(542);expect(later.poisonUntil).toBeDefined();
    expect(tray.brined).toBe(true);
  });

  it('can first acquire brine on the return path and carry it beyond the original cloud',()=>{
    const game=arena('brine'),s=game.state;
    place(game,285,370);game.setWeapon('tray');s.weapon.readyAt=s.time;
    for(let i=0;i<12&&!s.projectiles.length;i++)game.update(CONFIG.step,still);
    const center=s.projectiles[0];s.projectiles=[center];s.weapon.readyAt=Infinity;
    for(let i=0;i<60&&center.phase==='out';i++)game.update(CONFIG.step,still);
    expect(center.phase).toBe('return');expect(center.brined).toBeUndefined();
    place(game,620,615);game.triggerSkill('poison');place(game,285,370);
    const victim=target(game,340,370);
    advance(game,.65);
    expect(center.brined).toBe(true);
    expect(victim.hp).toBe(600-44);expect(victim.poisonUntil).toBeDefined();
    expect(s.projectiles).toHaveLength(0);
    advance(game,3.1);
    expect(victim.hp).toBe(600-44-ELEMENTAL.poison.linger/ELEMENTAL.poison.interval*ELEMENTAL.poison.damage);
  });

  it('only coats the portion of a segment which intersects the live growing cloud',()=>{
    const field:ElementalField={id:1,kind:'poison',x:0,y:0,radius:100,bornAt:1,releaseAt:6,expiresAt:6.45,released:false};
    const a={x:-200,y:0},b={x:200,y:0};
    expect(trayBrineContact(field,a,b,0,2,1)).toBeCloseTo(.25);
    expect(trayBrineContact(field,a,b,0,5.8,1)).toBeNull();
    expect(trayBrineContact(field,a,b,0,6,.2)).toBeNull();
    expect(trayBrineContact(field,{x:15,y:0},{x:17,y:0},0,1,.01)).toBeNull();
    expect(trayBrineContact(field,a,b,0,0,.9)).toBeNull();
    expect(trayBrineContact(field,{x:90,y:0},{x:90,y:0},0,1,.55)).toBeCloseTo(1-Math.sqrt(.1));
  });
});
