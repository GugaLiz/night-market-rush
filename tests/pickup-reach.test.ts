import {describe,expect,it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import type {GameState,SkillKind} from '../src/shared/types';

const still={x:0,y:0},right={x:1,y:0};
function arena() {
  const game=new Game(61);
  game.reset(61,true);
  game.state.weapon.readyAt=Infinity;
  return game;
}
function drop(s:GameState,id:number,kind:SkillKind,dx:number,dy:number,groupId?:number) {
  s.pickups.push({id,kind,x:s.player.x+dx,y:s.player.y+dy,radius:CONFIG.pickup.radius,bornAt:0,groupId});
}

describe('collecting from the edge of a route',()=>{
  it('reaches a skill from the side during a dash and leaves one beyond reach alone',()=>{
    const g=arena(),s=g.state;
    drop(s,101,'bubble',80,CONFIG.pickup.reach-1);
    drop(s,102,'heat',80,CONFIG.pickup.reach+1);
    g.dash(right);
    g.update(.18,right);
    expect(s.player.bubbleUntil).toBeGreaterThan(s.time);
    expect(s.player.heatUntil).toBe(0);
    expect(s.pickups.map(p=>p.id)).toEqual([102]);
  });

  it('chooses the nearest supply when two become ready around a stationary rider',()=>{
    const g=arena(),s=g.state;
    drop(s,101,'bubble',-34,0,7);
    drop(s,102,'heat',24,0,7);
    for(const p of s.pickups)p.readyAt=.35;
    g.update(.3,still);
    expect(g.drainEvents().filter(e=>e.type==='pickup')).toHaveLength(0);
    g.update(.1,still);
    expect(g.drainEvents().filter(e=>e.type==='pickup').map(e=>e.kind)).toEqual(['heat']);
    expect(s.pickups[0].retiringUntil).toBeGreaterThan(s.time);
  });

  it('grabs a weapon beside the path and only takes the return package on reentry',()=>{
    const g=arena(),s=g.state,p=s.player;
    s.weaponDrops.push({id:103,kind:'knife',x:p.x,y:p.y+40,radius:CONFIG.weapons.dropRadius,bornAt:0,
      expiresAt:10,readyAt:0,returnDrop:false,leftPickupCircle:true});
    g.update(1/60,still);
    expect(s.weapon.kind).toBe('knife');
    g.update(1,still);g.update(1,still);
    g.dash(right);g.update(.18,right);
    expect(s.weapon.kind).toBe('knife');
    expect(s.weaponDrops[0].leftPickupCircle).toBe(true);
    g.update(.6,{x:-1,y:0});
    expect(s.weapon.kind).toBe('tongs');
  });

  it('carries attracted coins home even when a dash briefly outruns them',()=>{
    const g=arena(),s=g.state,p=s.player;
    s.coins.push({id:104,value:3,bornAt:-1,x:p.x-108,y:p.y});
    g.dash(right);g.update(.18,right);
    expect(s.coins[0].attracted).toBe(true);
    expect(p.x-s.coins[0].x).toBeGreaterThan(CONFIG.rewards.attractionRadius);
    g.update(.6,still);
    expect(s.collectedCoins).toBe(3);
    expect(s.coins).toHaveLength(0);
  });
});
