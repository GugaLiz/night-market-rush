import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../src/core/config';
import {Game} from '../src/core/game';
import {driftPickup,launchPickup,pickupPositionAt,skillContact} from '../src/core/pickup-motion';
import {sampleBattleFrame} from '../src/render/battle-frame';
import type {Pickup} from '../src/shared/types';

const dt=1/60;
const still={x:0,y:0};
function skill(overrides:Partial<Pickup>={}):Pickup {
  return {id:11,kind:'bubble',x:500,y:300,bornAt:0,radius:CONFIG.pickup.radius,...overrides};
}

describe('floating skill orders',()=>{
  it('generates repeatable, varied flight paths from the run seed and id',()=>{
    const headings=new Set<string>();
    for(let id=1;id<=32;id++){
      const first=skill({id}),replay=skill({id});
      launchPickup(first,17);launchPickup(replay,17);
      expect(replay).toEqual(first);
      expect(Math.hypot(first.vx!,first.vy!)).toBeGreaterThanOrEqual(CONFIG.pickup.driftMin-1e-9);
      expect(Math.hypot(first.vx!,first.vy!)).toBeLessThanOrEqual(CONFIG.pickup.driftMax+1e-9);
      headings.add(`${Math.sign(first.vx!)},${Math.sign(first.vy!)}`);
    }
    expect(headings.size).toBe(4);
  });

  it('reflects both velocity components at a corner and finishes the rest of the step',()=>{
    const right=WORLD.bounds.right-CONFIG.pickup.radius,top=CONFIG.player.minY;
    const p=skill({x:right-1,y:top+1,vx:100,vy:-100});
    driftPickup(p,17,dt,dt);
    expect(p.vx).toBe(-100);expect(p.vy).toBe(100);
    expect(p.x).toBeCloseTo(right-2/3);expect(p.y).toBeCloseTo(top+2/3);
    const corner=pickupPositionAt(p,.6);
    expect(corner.x).toBeCloseTo(right);expect(corner.y).toBeCloseTo(top);
    driftPickup(p,17,2*dt,dt);
    expect(p.x).toBeCloseTo(right-7/3);expect(p.y).toBeCloseTo(top+7/3);
    expect(p.turns).toBeUndefined();
  });

  it('crosses the playable floor along both axes and always stays within reach of the rider',()=>{
    const p=skill();
    const b=WORLD.bounds,left=b.left+p.radius,right=b.right-p.radius;
    const top=CONFIG.player.minY,bottom=b.bottom-p.radius;
    let minX=p.x,maxX=p.x,minY=p.y,maxY=p.y;
    for(let frame=1;frame<=60*80;frame++){
      driftPickup(p,17,frame*dt,dt);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
    expect(minX).toBeGreaterThanOrEqual(left);expect(minX).toBeLessThan(left+2);
    expect(maxX).toBeLessThanOrEqual(right);expect(maxX).toBeGreaterThan(right-2);
    expect(minY).toBeGreaterThanOrEqual(top);expect(minY).toBeLessThan(top+2);
    expect(maxY).toBeLessThanOrEqual(bottom);expect(maxY).toBeGreaterThan(bottom-2);
  });

  it('draws the approach, corner and rebound between physics ticks without moving weapon stations',()=>{
    const s=new Game(17).state;
    const right=WORLD.bounds.right-CONFIG.pickup.radius,top=CONFIG.player.minY;
    const p=skill({x:right-1,y:top+1,vx:100,vy:-100}),legacy=skill({id:12});
    driftPickup(p,17,dt,dt);s.pickups=[p,legacy];
    s.weaponDrops=[{id:90,kind:'spirit',x:600,y:300,radius:22,bornAt:0,expiresAt:30,
      readyAt:0,returnDrop:false,leftPickupCircle:true}];
    const before=sampleBattleFrame(s,.3),at=sampleBattleFrame(s,.6),after=sampleBattleFrame(s,.9);
    expect(before.pickups[0]).toMatchObject({x:right-.5,y:top+.5,vx:100,vy:-100});
    expect(at.pickups[0].x).toBeCloseTo(right);expect(at.pickups[0].y).toBeCloseTo(top);
    expect(after.pickups[0]).toMatchObject({x:right-.5,y:top+.5,vx:-100,vy:100});
    expect(s.pickups[0]).toBe(p);expect(s.pickups[0].x).toBeCloseTo(right-2/3);
    for(const sample of [before,at,after]){
      expect(sample.weaponDrops).toBe(s.weaponDrops);
      expect(sample.pickups[1]).toBe(legacy);
    }
  });

  it('catches two crossing trajectories between frames at the instant of contact',()=>{
    const p=skill({px:400,py:300,x:200,y:300});
    const riderStart={x:200,y:300},riderEnd={x:400,y:300};
    const hit=skillContact(p,riderStart,riderEnd,dt,dt);
    const fraction=(200-CONFIG.pickup.reach)/400;
    expect(hit?.time).toBeCloseTo(fraction);
    expect(hit?.at.x).toBeCloseTo(400-200*fraction);
    expect(hit?.at.y).toBe(300);
    p.disabledUntil=dt*.8;
    expect(skillContact(p,riderStart,riderEnd,dt,dt)).toBeNull();
  });

  it('waits for a supply order to become ready partway through a step',()=>{
    const p=skill({vx:100,vy:20,readyAt:.75*dt,groupId:5});
    const original={x:p.x,y:p.y};
    driftPickup(p,17,dt,dt);
    expect(pickupPositionAt(p,.5)).toEqual(original);
    expect(p.x).toBeCloseTo(original.x+100*dt*.25);
    expect(p.y).toBeCloseTo(original.y+20*dt*.25);
    expect(skillContact(p,original,original,dt,dt)?.time).toBeCloseTo(.75);
  });

  it('lets a stationary rider intercept a passing skill while the nearby weapon stays on its stand',()=>{
    const game=new Game(17);game.reset(17,true);
    const s=game.state,origin={x:s.player.x,y:s.player.y};
    const weapon={id:9,kind:'knife' as const,x:origin.x+84,y:origin.y,radius:CONFIG.weapons.dropRadius,
      bornAt:0,expiresAt:10,readyAt:0,returnDrop:false,leftPickupCircle:true};
    s.weaponDrops.push({...weapon});
    s.pickups.push(skill({x:origin.x+85,y:origin.y,vx:-94,vy:0}));
    game.update(.2,still);
    expect(s.pickups).toHaveLength(1);
    game.update(.2,still);
    expect(s.player.bubbleUntil).toBeGreaterThan(s.time);
    expect(s.weaponDrops).toEqual([weapon]);
    const cast=game.drainEvents().find(e=>e.type==='skill');
    expect(cast?.pickupFrom?.x).toBeCloseTo(origin.x+CONFIG.pickup.reach);
    expect(cast?.pickupFrom?.y).toBeCloseTo(origin.y);
  });

  it('gives the pickup hook exclusive movement while it reels in an order',()=>{
    const game=new Game(17);game.reset(17,true);
    const s=game.state,origin={x:s.player.x,y:s.player.y};
    const p=skill({x:origin.x+120,y:origin.y,vx:0,vy:110});
    s.pickups.push(p);
    game.triggerSkill('hook');
    game.update(dt,still);
    expect(p.x).toBeCloseTo(origin.x+120-CONFIG.skills.hook.speed*dt);
    expect(p.y).toBe(origin.y);
    expect(p.px).toBe(origin.x+120);
    expect(p.vy).toBe(110);
  });
});
