import {describe, expect, it} from 'vitest';
import {CONFIG, WORLD} from '../src/core/config';
import {Game} from '../src/core/game';
import {dropCoins} from '../src/core/rewards';
import type {CombatContext} from '../src/core/contracts';

const still = {x:0, y:0};
function run(game:Game, seconds:number, input=still) {
  for(let i=0;i<Math.round(seconds*60);i++)game.update(1/60,input);
}

describe('V4 continuous play', () => {
  it('shows a row and scatter groups, offers two reachable skills, and leaves an open side', () => {
    const game=new Game(24);
    run(game,1);
    const {enemies,pickups,player}=game.state;
    const row=enemies.filter(e=>e.march?.x===1);
    expect(row.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...row.map(e=>e.y))-Math.min(...row.map(e=>e.y))).toBeLessThan(4);
    expect(enemies.filter(e=>e.march?.x===-1).length).toBeGreaterThanOrEqual(5);
    expect(enemies.filter(e=>!e.march).length).toBeGreaterThanOrEqual(4);
    expect(enemies.every(e=>e.y<575)).toBe(true);
    expect(pickups).toHaveLength(2);
    expect(pickups.some(p=>p.kind==='fan')).toBe(true);
    expect(pickups.every(p=>p.y>=CONFIG.player.minY&&p.y<WORLD.bounds.bottom)).toBe(true);
    expect(player.hp).toBe(100);
  });

  it('rewards steering into the opening fan with a real group clear and leaves enemies beyond it', () => {
    for(const seed of [1,2,3,4,0x9e3779b9,0x3c6ef362,0x13bbcdcb,0xda3a356c]){
      const game=new Game(seed),s=game.state;
      run(game,.4);
      const fan=s.pickups.find(p=>p.kind==='fan')!;
      const other=s.pickups.find(p=>p.kind!=='fan')!;
      expect(game.drainEvents().some(e=>e.type==='pickup')).toBe(false);
      let fanAt=0;
      const fanKills=new Set<number>();
      for(let frame=0;frame<180;frame++){
        const dx=fan.x-s.player.x,dy=fan.y-s.player.y,n=Math.hypot(dx,dy);
        game.update(1/60,fanAt||!n?still:{x:dx/n,y:dy/n});
        const events=game.drainEvents();
        if(events.some(e=>e.type==='pickup'&&e.kind==='fan'))fanAt=s.time;
        for(const e of events){
          if(e.type==='damage'&&e.source==='fan'&&!s.enemies.some(enemy=>enemy.id===e.victimId))fanKills.add(e.victimId);
        }
        if(fanAt&&s.time-fanAt>=.8)break;
      }
      expect(fanAt).toBeGreaterThan(.4);
      expect(fanAt).toBeLessThan(1.8);
      expect(fanKills.size).toBeGreaterThanOrEqual(12);
      expect(s.coins.length+s.collectedCoins).toBeGreaterThanOrEqual(12);
      expect(s.enemies.length).toBeGreaterThanOrEqual(3);
      expect(s.pickups.some(p=>p.id===other.id)).toBe(true);
    }
  });

  it('reverses in the first step and carries speed through a gradual turn while retaining analog movement', () => {
    const game=new Game(82);
    game.reset(82,true);
    const p=game.state.player;
    p.x=1000;p.y=500;
    run(game,.2,{x:.3,y:0});
    expect(p.vx).toBeGreaterThan(74);
    expect(p.vx).toBeLessThan(80);
    run(game,.2,{x:1,y:0});
    const before=p.x;
    game.update(1/60,{x:-1,y:0});
    expect(p.vx).toBeLessThan(0);
    expect(p.x).toBeLessThan(before);
    for(let frame=0;frame<150;frame++){
      const angle=Math.PI-.5+frame*.009;
      game.update(1/60,{x:Math.cos(angle),y:Math.sin(angle)});
    }
    expect(p.sprintMultiplier).toBeCloseTo(CONFIG.player.sprintMax);
    const heading=Math.atan2(p.moveDirection.y,p.moveDirection.x);
    for(const offset of [.7,1.4])game.update(1/60,{x:Math.cos(heading+offset),y:Math.sin(heading+offset)});
    expect(p.sprintMultiplier).toBe(1);
    game.update(1/60,still);
    expect(p.sprintTime).toBe(0);
  });

  it('preserves speed through a moving corner, stops precisely and keeps aim on a tiny trim',()=>{
    const game=new Game(402),p=game.state.player;
    run(game,.15,{x:1,y:0});
    const cornerX=p.x;
    for(let frame=0;frame<3;frame++){
      game.update(1/60,{x:0,y:1});
      expect(Math.hypot(p.vx,p.vy)).toBeCloseTo(CONFIG.player.speed);
    }
    expect(p.vx).toBeCloseTo(0);
    expect(p.x-cornerX).toBeLessThan(5);
    const releaseY=p.y;
    run(game,.1);
    expect(p.y-releaseY).toBeLessThan(2.1);
    const before=p.x;
    game.update(1/60,{x:-.04,y:0});
    expect(p.x).toBeLessThan(before);
    expect(p.moveDirection).toEqual({x:0,y:1});
  });

  it('gets a full throw to running speed in two frames while preserving a fine adjustment',()=>{
    const game=new Game(411);game.reset(411,true);
    const p=game.state.player,step=1/60;
    game.update(step,{x:.04,y:0});
    expect(p.vx).toBeGreaterThan(9);expect(p.vx).toBeLessThan(11);
    game.update(step,still);
    game.update(step,{x:1,y:0});
    expect(p.vx).toBeGreaterThan(175);
    game.update(step,{x:1,y:0});
    expect(p.vx).toBeGreaterThanOrEqual(345);expect(p.vx).toBeLessThanOrEqual(350);
    const fullSpeed=p.vx,corner=p.x;
    for(let i=0;i<2;i++){
      game.update(step,{x:0,y:1});
      expect(Math.hypot(p.vx,p.vy)).toBeCloseTo(fullSpeed);
    }
    expect(p.vx).toBeCloseTo(0);
    expect(p.x-corner).toBeLessThan(4);
    const letGo=p.y;
    run(game,2*step);
    expect(p.vy).toBe(0);expect(p.y-letGo).toBeLessThan(1.7);
  });

  it('takes current intent for a same-frame dash and blends into the held exit or a stop',()=>{
    const game=new Game(403),p=game.state.player;
    run(game,.1,{x:1,y:0});
    expect(game.dash({x:0,y:1})).toBe(true);
    const start={x:p.x,y:p.y};
    run(game,.1,{x:-1,y:0});
    expect(p.x).toBe(start.x);
    expect(p.y).toBeGreaterThan(start.y+60);
    run(game,5/60,{x:-1,y:0});
    expect(p.vx).toBeLessThan(-CONFIG.player.speed*.95);
    expect(p.vy).toBeLessThan(CONFIG.player.speed*.1);

    game.reset(404);
    const stopped=game.state.player;
    game.dash(still);
    run(game,11/60);
    const endX=stopped.x;
    expect(endX-WORLD.start.x).toBeGreaterThan(105);
    expect(endX-WORLD.start.x).toBeLessThan(125);
    run(game,.2);
    expect(stopped.x-endX).toBeLessThan(.1);
    expect(stopped.vx).toBe(0);
  });

  it('opens with two optional routes and varies both the crowd side and the skills across seeds', () => {
    const firstSkills=new Set<string>(),supports=new Set<string>(),fireSides=new Set<number>();
    for(let seed=1;seed<=24;seed++){
      const game=new Game(seed);
      run(game,1.1);
      const {player,pickups,enemies}=game.state;
      expect(pickups).toHaveLength(2);
      const fan=pickups.find(p=>p.kind==='fan')!,alternate=pickups.find(p=>p.kind!=='fan')!;
      expect(fan).toBeDefined();expect(alternate).toBeDefined();
      firstSkills.add(pickups[0].kind);supports.add(alternate.kind);fireSides.add(Math.sign(fan.x-player.x));
      expect(Math.min(...enemies.map(e=>Math.hypot(e.x-fan.x,e.y-fan.y)))).toBeLessThan(110);
      const fx=fan.x-player.x,fy=fan.y-player.y,ax=alternate.x-player.x,ay=alternate.y-player.y;
      expect(fx*ax+fy*ay).toBeLessThanOrEqual(.72*Math.hypot(fx,fy)*Math.hypot(ax,ay));
      expect(game.drainEvents().some(e=>e.type==='pickup')).toBe(false);
    }
    expect(firstSkills.has('fan')).toBe(true);
    expect(firstSkills.size).toBeGreaterThan(1);
    expect(supports.size).toBeGreaterThan(2);
    expect(fireSides).toEqual(new Set([-1,1]));
  });

  it('allows at most two consecutive support drops while the floor has no fan', () => {
    const gaps=new Set<number>();
    for(const seed of [3,19,27]){
      const game=new Game(seed);
      game.state.player.invulnerableUntil=1000;
      run(game,1.1);
      game.state.pickups=[];
      let gap=0,draws=0;
      for(let frame=0;frame<60*90&&draws<20;frame++){
        game.update(1/60,still);
        if(!game.state.pickups.length)continue;
        const drop=game.state.pickups[0];
        if(drop.kind==='fan'){gaps.add(gap);gap=0;}else gap++;
        expect(gap).toBeLessThanOrEqual(2);
        game.state.pickups=[];draws++;
      }
      expect(draws).toBe(20);
    }
    expect(gaps.has(2)).toBe(true);
    expect(gaps.size).toBeGreaterThan(1);
  });

  it('keeps drawing from the normal pool when the player leaves the opening fan on the ground', () => {
    const game=new Game(3),s=game.state;
    s.player.invulnerableUntil=1000;
    run(game,1);
    const fan=s.pickups.find(p=>p.kind==='fan')!;
    s.pickups=[fan];
    let consecutiveSupport=0;
    for(let frame=0;frame<60*40&&consecutiveSupport<3;frame++){
      game.update(1/60,still);
      const next=s.pickups.find(p=>p.id!==fan.id);
      if(next){
        consecutiveSupport=next.kind==='fan'?0:consecutiveSupport+1;
        s.pickups=[fan];
      }
    }
    expect(consecutiveSupport).toBe(3);
    expect(s.pickups).toEqual([fan]);
  });

  it('keeps tracked ground items and the player across the first transition and allows wave 8', () => {
    const game=new Game(35);
    game.setupWaveDemo();
    const s=game.state;
    const before=structuredClone({coins:s.coins,pickups:s.pickups,player:{x:s.player.x,y:s.player.y}});
    run(game,2.02);
    expect(s.wave).toBe(2);
    expect(s.waveStartedAt).toBeCloseTo(36);
    expect({coins:s.coins,pickups:s.pickups,player:{x:s.player.x,y:s.player.y}}).toEqual(before);
    expect(game.drainEvents().filter(e=>e.type==='wave')).toEqual([{type:'wave',wave:2}]);
    game.reset(35);
    game.state.player.invulnerableUntil=1000;
    // Remove targets between batches so this checks the full schedule independently of combat aptitude.
    for(let second=0;second<241;second++){game.state.enemies=[];game.update(1,still);}
    expect(game.state.wave).toBe(8);
    expect(game.state.waveStartedAt).toBe(240);
    expect(game.state.score).toBe(game.state.kills);
  });

  it('repeats pickup practice from the same seed and requires actual movement', () => {
    const game=new Game();
    game.setupPickupDemo();
    const initial=structuredClone(game.state);
    run(game,.35);
    expect(game.state.pickups.find(p=>p.kind==='fan')).toBeDefined();
    expect(game.drainEvents().some(e=>e.type==='pickup')).toBe(false);
    run(game,.85,{x:1,y:0});
    expect(game.drainEvents().some(e=>e.type==='pickup'&&e.kind==='fan')).toBe(true);
    expect(game.state.kills).toBeGreaterThan(1);
    expect(game.state.coins.length).toBeGreaterThan(0);
    expect(game.state.enemies.length).toBeGreaterThan(0);
    game.setupPickupDemo();
    expect(game.state).toEqual(initial);
  });

  it('keeps score, combo, dropped value and collected value distinct with the stamp active', () => {
    const game=new Game(7);
    game.reset(7,true);
    const s=game.state;
    s.weapon.readyAt=Infinity;
    game.triggerSkill('stamp');
    for(let i=0;i<3;i++)game.spawnEnemy('bun',{x:s.player.x+30,y:s.player.y});
    game.triggerSkill('fan');
    expect(s.kills).toBe(3);expect(s.score).toBe(3);expect(s.combo).toBe(3);
    expect(s.collectedCoins).toBe(0);expect(s.coins.reduce((a,c)=>a+c.value,0)).toBe(6);
    run(game,.4);expect(s.collectedCoins).toBe(0);
    run(game,.4);expect(s.collectedCoins).toBe(6);expect(s.coins).toHaveLength(0);
    const receipts=game.drainEvents().filter(e=>e.type==='coin');
    expect(receipts.reduce((sum,e)=>sum+e.amount,0)).toBe(6);
    run(game,2.5);expect(s.combo).toBe(0);expect(s.score).toBe(3);
  });

  it('merges overflowing coin values without losing them and leaves every coin reachable', () => {
    const game=new Game(13),s=game.state;
    let nextId=100;
    const helpers={random:()=>.5,id:()=>++nextId} as CombatContext;
    for(let i=0;i<CONFIG.rewards.cap+9;i++)dropCoins(s,{x:WORLD.bounds.left+i*9,y:WORLD.bounds.top},3,helpers);
    expect(s.coins.length).toBe(CONFIG.rewards.cap);
    expect(s.coins.reduce((v,c)=>v+c.value,0)).toBe((CONFIG.rewards.cap+9)*3);
    expect(s.coins.every(c=>c.y>=CONFIG.player.minY)).toBe(true);
  });

  it('freezes a defeated run, resumes the same board once, and resets protection on a new run', () => {
    const game=new Game(54),s=game.state;
    s.weapon.readyAt=Infinity;s.player.hp=1;
    const enemy=game.spawnEnemy('bun',s.player);
    enemy.spawnAt=-1;
    game.update(1/60,still);
    expect(s.ended).toBe(true);
    const frozen=structuredClone(s);
    game.update(1,still);expect(s).toEqual(frozen);
    expect(game.revive()).toBe(true);expect(game.revive()).toBe(false);
    expect(s.player.hp).toBe(100);expect(s.time).toBe(frozen.time);expect(s.enemies).toEqual(frozen.enemies);
    expect(s.revivesUsed).toBe(1);run(game,1);expect(s.player.hp).toBe(100);
    s.player.invulnerableUntil=0;s.player.hp=1;game.update(1/60,still);
    expect(s.ended).toBe(true);expect(game.revive()).toBe(false);
    game.reset(54);expect(game.state.revivesUsed).toBe(0);
  });

  it('sends later-wave soup projectiles along one telegraphed line, and cancels a volley on stun', () => {
    const game=new Game(64);game.reset(64,true);
    const s=game.state;s.wave=2;
    const bowl=game.spawnEnemy('bowl',{x:360,y:s.player.y});bowl.shotReadyAt=0;
    run(game,.1);expect(bowl.shotWarnUntil).toBeGreaterThan(s.time);
    s.player.y+=130;
    run(game,1.25);
    expect(s.enemyShots).toHaveLength(2);
    expect(s.enemyShots![0].vx).toBe(s.enemyShots![1].vx);
    expect(s.enemyShots![0].y).toBeCloseTo(s.enemyShots![1].y);
    expect(s.enemyShots![0].x-s.enemyShots![1].x).toBeGreaterThan(20);
    bowl.stunUntil=s.time+1;run(game,.4);expect(s.enemyShots).toHaveLength(2);
  });
});
