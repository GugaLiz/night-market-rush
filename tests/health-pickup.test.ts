import {describe,expect,it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import type {Pickup,SkillKind} from '../src/shared/types';

const idle={x:0,y:0},dt=CONFIG.step;
const soup=(game:Game)=>game.state.pickups.find(p=>p.kind==='health');
function place(id:number,kind:SkillKind,x:number,y:number):Pickup{
  return {id,kind,x,y,radius:CONFIG.pickup.radius,bornAt:0,vx:0,vy:0};
}

describe('warm soup delivery',()=>{
  it('responds to an actual hit with a nearby moving order and only heals on contact',()=>{
    const game=new Game(53),s=game.state,p=s.player;
    s.weapon.readyAt=Infinity;
    game.update(.5,idle);
    expect(soup(game)).toBeUndefined();
    const enemy=game.spawnEnemy('bun',p);enemy.spawnAt=-1;
    game.update(dt,idle);
    expect(p.hp).toBe(92);
    s.enemies=[];p.invulnerableUntil=100;
    game.update(dt,idle);
    const order=soup(game)!;
    expect(Math.hypot(order.x-p.x,order.y-p.y)).toBeGreaterThan(CONFIG.pickup.reach);
    expect(Math.hypot(order.x-p.x,order.y-p.y)).toBeLessThan(246);
    const first={x:order.x,y:order.y};
    game.update(.1,idle);
    expect(Math.hypot(order.x-first.x,order.y-first.y)).toBeGreaterThan(8);
    expect(p.hp).toBe(92);
    for(let i=0;soup(game)&&i<90;i++)game.update(dt,{x:order.x-p.x,y:order.y-p.y});
    expect(soup(game)).toBeUndefined();
    expect(p.hp).toBe(p.maxHp);
    expect(game.drainEvents().filter(e=>e.type==='heal')).toMatchObject([{amount:8}]);
  });

  it('can deliver one soup alongside a full street and waits 15 seconds after it is taken',()=>{
    const game=new Game(51),s=game.state,p=s.player;
    s.pickups=[place(100,'fan',130,230),place(101,'bell',180,460),
      place(102,'heat',990,280),place(103,'hook',1050,570)];
    p.hp=30;p.invulnerableUntil=100;
    game.update(dt,idle);
    expect(s.pickups.filter(o=>o.kind!=='health').map(o=>o.id)).toEqual([100,101,102,103]);
    const order=soup(game)!;
    game.update(.1,idle);expect(s.pickups.filter(p=>p.kind==='health')).toHaveLength(1);
    Object.assign(order,{x:p.x,y:p.y});
    game.update(dt,idle);
    expect(p.hp).toBe(55);expect(soup(game)).toBeUndefined();
    for(let t=0;t<CONFIG.skills.health.cooldown-1;t++)game.update(1,idle);
    expect(soup(game)).toBeUndefined();expect(p.hp).toBe(55);
    game.update(1,idle);game.update(dt,idle);
    expect(soup(game)).toBeDefined();
  });

  it('keeps soup on the street at full health, skips it for the hook and retains three supply choices',()=>{
    const game=new Game(29);game.reset(29,true);
    const s=game.state,p=s.player;
    s.pickups=[place(99,'health',p.x,p.y)];
    game.triggerSkill('hook');game.update(dt,idle);
    expect(soup(game)).toBeDefined();expect(soup(game)!.pulledUntil).toBeUndefined();
    game.triggerSkill('supply');
    expect(s.pickups.filter(item=>item.groupId)).toHaveLength(3);
    p.hp=63;game.update(dt,idle);
    expect(p.hp).toBe(88);expect(soup(game)).toBeUndefined();
    game.triggerSkill('health');game.triggerSkill('health');
    expect(p.hp).toBe(100);
    expect(game.drainEvents().filter(e=>e.type==='heal')).toMatchObject([{amount:25},{amount:12}]);
  });

  it('retries a blocked landing without healing the player or displacing the opening pair',()=>{
    const game=new Game(173),s=game.state,p=s.player;
    p.hp=50;p.invulnerableUntil=100;s.weapon.readyAt=Infinity;
    const obstacle=game.spawnEnemy('bowl',{x:900,y:400});
    obstacle.radius=1000;
    game.update(dt,idle);expect(soup(game)).toBeUndefined();
    s.enemies=[];
    game.update(.39,idle);
    expect(s.pickups).toHaveLength(2);
    expect(s.pickups.some(item=>item.kind==='fan')).toBe(true);
    const opening=s.pickups.map(p=>p.id);
    game.update(.15,idle);
    expect(soup(game)).toBeDefined();
    expect(s.pickups.filter(p=>p.kind!=='health').map(p=>p.id)).toEqual(opening);
    expect(p.hp).toBe(50);
  });

  it('clears the previous delivery cooldown on revive and on retry',()=>{
    const game=new Game(19);
    for(const life of ['revive','retry']){
      const s=game.state,p=s.player;
      p.hp=50;s.pickups=[place(190,'health',p.x,p.y)];game.update(dt,idle);
      expect(p.hp).toBe(75);expect(soup(game)).toBeUndefined();
      if(life==='revive'){
        p.hp=0;s.ended=true;expect(game.revive()).toBe(true);
      }else game.reset(19);
      game.update(dt,idle);expect(soup(game)).toBeUndefined();
      game.state.player.hp=92;game.update(dt,idle);
      expect(soup(game)).toBeDefined();
    }
  });
});
