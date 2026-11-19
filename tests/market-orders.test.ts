import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../src/core/config';
import {Game} from '../src/core/game';
import {distanceSquared,segmentDistanceSquared} from '../src/core/geometry';
import type {MarketDemo,MarketStallKind,Vec} from '../src/shared/types';

const still={x:0,y:0},right={x:1,y:0};
function arena(kind:MarketDemo){
  const g=new Game(1);
  g.setupMarketDemo(kind);
  g.state.player.invulnerableUntil=Infinity;
  g.state.weapon.readyAt=Infinity;
  return g;
}
function tick(g:Game,seconds:number,input:Vec=still){
  for(let i=0;i<Math.round(seconds/CONFIG.step);i++)g.update(CONFIG.step,input);
}
function approach(g:Game,kind:MarketStallKind){
  const stall=g.state.market.offer!.stalls.find(q=>q.kind===kind)!;
  Object.assign(g.state.player,{x:stall.x-stall.radius-9,y:stall.y,vx:0,vy:0});
  tick(g,.12,right);
}
function challenge(seed:number,wave:number,time:number){
  const g=new Game(seed),s=g.state;
  s.time=time;s.wave=wave;s.waveStartedAt=wave===1?0:36+(wave-2)*34;
  s.effects.dispatchUntil=Infinity;
  s.player.invulnerableUntil=Infinity;
  return g;
}

describe('V5 signed market orders',()=>{
  it('lights both options together at wave two and four with reachable, separated, reproducible sites',()=>{
    function run(){
      const g=challenge(81,1,36-CONFIG.step*2),s=g.state;
      Object.assign(s.player,{x:WORLD.bounds.left+s.player.radius,y:CONFIG.player.minY});
      g.update(CONFIG.step,still);
      expect(s.market.offer).toBeNull();
      g.update(CONFIG.step,still);
      const food=s.market.offer!;
      expect(food.group).toBe('food');expect(food.expiresAt!-food.openedAt).toBeCloseTo(15);
      const [a,b]=food.stalls;
      expect(distanceSquared(s.player,a)).toBeLessThan(distanceSquared(s.player,b));
      expect(distanceSquared(a,b)).toBeGreaterThan(170**2);
      for(const q of food.stalls){
        expect(q.y-q.radius).toBeGreaterThanOrEqual(CONFIG.player.minY);
        expect(q.x-q.radius).toBeGreaterThanOrEqual(WORLD.bounds.left+s.player.radius);
      }
      expect(g.drainEvents().filter(e=>e.type==='market'||e.type==='wave').map(e=>e.type)).toEqual(['wave','market']);
      tick(g,15);
      expect(s.market.offer).toBeNull();expect(s.market.expired?.stalls).toEqual(food.stalls);
      s.time=104-CONFIG.step;s.wave=3;s.waveStartedAt=70;
      g.update(CONFIG.step,still);
      expect(s.market.offer?.group).toBe('upgrade');
      return [food.stalls,s.market.offer!.stalls];
    }
    expect(run()).toEqual(run());
  });

  it('delays both signs whenever the floor is saturated and gives the full 15 seconds once clear',()=>{
    const g=challenge(31,2,40),s=g.state;
    for(let x=100;x<1200;x+=70)for(let y=180;y<640;y+=70){
      s.weaponDrops.push({id:x*1000+y,x,y,kind:'tongs',radius:12,bornAt:0,expiresAt:1000,readyAt:1000,returnDrop:false,leftPickupCircle:true});
    }
    g.update(CONFIG.step,still);
    expect(s.market.offer).toBeNull();expect(s.market.opened).toEqual([]);
    s.weaponDrops=[];
    const e=g.spawnEnemy('bowl',{x:250,y:350});
    e.spawnAt=0;e.shotWarnUntil=s.time+4;e.shotAngle=0;e.shotReadyAt=s.time+10;
    tick(g,.6);
    const offer=s.market.offer!;
    expect(offer.openedAt).toBeGreaterThan(40.45);expect(offer.expiresAt!-offer.openedAt).toBeCloseTo(15);
    for(const q of offer.stalls){
      expect(segmentDistanceSquared(e,{x:e.x+CONFIG.ranged.speed*CONFIG.ranged.lifetime,y:e.y},q))
        .toBeGreaterThan((q.radius+CONFIG.ranged.radius)**2);
    }
  });

  it.each([[21,46,0],[94,100,0],[100,100,5]])('signs the displayed soup reward at %i HP once', (start,hp,coins)=>{
    const g=arena('marketFood'),s=g.state;s.player.hp=start;
    const other=s.market.offer!.stalls[1];
    approach(g,'soup');
    expect(s.player.hp).toBe(hp);expect(s.collectedCoins).toBe(coins);
    expect(s.market.receipt?.soupCoins).toBe(coins>0);
    Object.assign(s.player,{x:other.x,y:other.y});
    tick(g,.4);
    expect(s.market.completed).toBe(1);expect(s.market.offer).toBeNull();
    expect(g.drainEvents().filter(e=>e.type==='market'&&e.action==='sign')).toHaveLength(1);
  });

  it('takes the first circle crossed by the rider even when a dash crosses two in one step',()=>{
    const g=arena('marketFood'),s=g.state,p=s.player;
    const [soup,vortex]=s.market.offer!.stalls;
    Object.assign(soup,{x:p.x+9,y:p.y,radius:1});Object.assign(vortex,{x:p.x+4,y:p.y,radius:1});
    expect(g.dash(right)).toBe(true);
    g.update(CONFIG.step,right);
    expect(s.market.receipt?.stall.kind).toBe('vortex');
    expect(s.elementalFields?.filter(f=>f.kind==='vortex')).toHaveLength(1);
    expect(s.player.hp).toBe(75);
  });

  it('does not sign when express crosses a sign without the rider',()=>{
    const g=arena('marketFood'),s=g.state;
    g.triggerSkill('express');tick(g,.5);
    const cast=s.ultimates!.find(c=>c.kind==='express')!;
    expect(distanceSquared(cast,s.player)).toBeGreaterThan(60**2);
    Object.assign(s.market.offer!.stalls[0],{x:cast.x,y:cast.y});
    tick(g,.4);
    expect(s.market.completed).toBe(0);
    expect(s.market.offer?.group).toBe('food');
  });

  it.each(['frost','brine'] as const)('installs %s for the run and supplies its skill immediately',kind=>{
    const g=arena('marketUpgrade'),s=g.state;
    approach(g,kind);
    expect(s.market.upgrade).toBe(kind);
    expect(s.elementalFields?.at(-1)?.kind).toBe(kind==='frost'?'frost':'poison');
    expect(s.weapon.kind).toBe('tongs');
    if(kind==='brine'){
      const tray=s.weaponDrops.find(d=>d.kind==='tray')!,stall=s.market.receipt!.stall;
      expect(distanceSquared(tray,stall)).toBeGreaterThan((stall.radius+CONFIG.weapons.pickupReach)**2);
      Object.assign(s.player,{x:tray.x,y:tray.y});tick(g,CONFIG.step);
      expect(s.weapon.kind).toBe('tray');
    }
    g.setWeapon('knife');expect(s.market.upgrade).toBe(kind);
    g.reset(1);expect(g.state.market.upgrade).toBeNull();expect(g.state.market.completed).toBe(0);
  });

  it('keeps an existing tray without issuing a second one',()=>{
    const g=arena('marketUpgrade');g.setWeapon('tray');approach(g,'brine');
    expect(g.state.weaponDrops.filter(d=>d.kind==='tray')).toHaveLength(0);
  });

  it.each([true,false])('lets a rider shatter a live practice target one second in, holding right = %s',hold=>{
    const g=new Game(1);g.setupMarketDemo('marketUpgrade');
    for(let i=0;i<60;i++)g.update(CONFIG.step,hold||!g.state.market.upgrade?right:still);
    expect(g.state.market.upgrade).toBe('frost');
    expect(g.dash(right)).toBe(true);tick(g,.22,right);
    expect(g.drainEvents().some(e=>e.type==='frostShatter')).toBe(true);
  });

  it('can reach the optional tray and coat it in the practice cloud using movement alone',()=>{
    const g=new Game(1);g.setupMarketDemo('marketUpgrade');
    const s=g.state,left={x:-1,y:0};
    tick(g,.6,left);expect(s.market.upgrade).toBe('brine');
    const tray=s.weaponDrops.find(d=>d.kind==='tray')!;
    let coated=false;
    for(let i=0;i<150;i++){
      const dx=tray.x-s.player.x,dy=tray.y-s.player.y,length=Math.hypot(dx,dy)||1;
      const input=s.weapon.kind!=='tray'?{x:dx/length,y:dy/length}:s.time<105.3?left:still;
      g.update(CONFIG.step,input);
      coated ||= s.projectiles.some(q=>q.kind==='tray'&&q.brined);
    }
    expect(s.weapon.kind).toBe('tray');expect(coated).toBe(true);
  });

  it('uses combat time in wave nine, reuses the elite, and leaves the final open for a player who keeps running',()=>{
    const g=challenge(51,9,300-CONFIG.step*2),s=g.state;
    const guard=g.spawnEnemy('giantBun',{x:290,y:492});
    s.market.opened=['food','upgrade'];
    g.update(CONFIG.step,still);expect(s.market.offer).toBeNull();
    g.update(CONFIG.step,still);
    expect(s.market.offer).toMatchObject({group:'final',guardianId:guard.id,ready:false,expiresAt:null});
    expect(s.enemies.filter(e=>e.kind==='giantBun')).toHaveLength(1);
    tick(g,19);
    expect(s.market.offer?.ready).toBe(true);expect(s.market.closing).toBe('open');
    expect(s.market.completed).toBe(0);expect(s.ended).toBe(false);
    expect(g.drainEvents().filter(e=>e.type==='market'&&e.group==='final'&&e.action==='open')).toHaveLength(1);
  });

  it.each(['settle','night'] as const)('opens once on the third landing then freezes until %s is chosen',choice=>{
    const g=arena('marketFinal'),s=g.state,p=s.player;
    for(let i=0;i<480&&!s.market.offer!.ready;i++)g.update(CONFIG.step,still);
    expect(s.enemies[0].jump).toMatchObject({hop:3,phase:'rest'});
    const stall=s.market.offer!.stalls[0];
    Object.assign(p,{x:stall.x-stall.radius-3,y:stall.y});
    g.update(.8,right);
    expect(s.market.closing).toBe('choice');expect(s.market.completed).toBe(1);
    const snapshot={hp:p.hp,weapon:s.weapon.kind,time:s.time,x:p.x};
    g.update(1,right);expect(s.time).toBe(snapshot.time);expect(p.x).toBe(snapshot.x);expect(g.dash()).toBe(false);
    expect(g.resolveClosing(choice)).toBe(true);expect(g.resolveClosing(choice)).toBe(false);
    expect(s.ended).toBe(choice==='settle');expect(g.revive()).toBe(false);
    expect(s.player.hp).toBe(snapshot.hp);expect(s.weapon.kind).toBe(snapshot.weapon);
    g.update(.2,still);
    expect(s.time>snapshot.time).toBe(choice==='night');expect(s.market.completed).toBe(1);
  });

  it('opens when the guardian is defeated and gives a simultaneous lethal hit precedence until live reentry',()=>{
    const g=arena('marketFinal'),s=g.state,p=s.player;
    const guard=s.enemies[0];guard.hp=1;
    Object.assign(p,{x:guard.x,y:guard.y});
    g.triggerSkill('fan');
    expect(s.enemies.some(e=>e.id===guard.id)).toBe(false);
    g.update(CONFIG.step,still);expect(s.market.offer?.ready).toBe(true);
    const stall=s.market.offer!.stalls[0];
    Object.assign(p,{x:stall.x,y:stall.y,hp:1,invulnerableUntil:0});
    g.spawnEnemy('bun',stall);g.setPractice(false);s.effects.dispatchUntil=Infinity;
    g.update(CONFIG.step,still);
    expect(s.ended).toBe(true);expect(s.market.completed).toBe(0);expect(s.market.closing).toBe('open');
    expect(g.revive()).toBe(true);
    tick(g,.1);expect(s.market.completed).toBe(0);
    approach(g,'final');expect(s.market.completed).toBe(1);expect(s.market.closing).toBe('choice');
  });

  it('slows reinforcements once after a mid-game elite defeat',()=>{
    const g=challenge(71,5,150),s=g.state;s.effects.dispatchUntil=0;
    const elite=g.spawnEnemy('giantBun',s.player);elite.hp=1;elite.spawnAt=140;
    g.triggerSkill('fan');expect(s.market.reprieveUntil).toBe(156);
    tick(g,5);expect(s.enemies).toHaveLength(0);
    tick(g,1.1);expect(s.enemies.length).toBeGreaterThan(0);
  });
});
