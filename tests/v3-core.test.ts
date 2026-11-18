import {describe,it,expect} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,difficultyAt,WORLD} from '../src/core/config';
const zero={x:0,y:0};
function lab(){const g=new Game(401);g.reset(401,true);g.state.weapon.readyAt=Infinity;return g;}
function run(g:Game,seconds:number,input=zero){for(let i=0;i<Math.ceil(seconds*60);i++)g.update(1/60,input);}

describe('V3 movement and hostile projectile rules',()=>{
  it('normal movement and dash stop at the same visible player top edge without moving the enemy boundary',()=>{
    const g=lab();g.state.player.y=CONFIG.player.minY+10;
    run(g,.3,{x:0,y:-1});expect(g.state.player.y).toBe(CONFIG.player.minY);
    expect(g.state.player.y-117).toBeGreaterThanOrEqual(58);
    g.state.player.y=CONFIG.player.minY+30;expect(g.dash()).toBe(true);
    run(g,.2,{x:0,y:-1});expect(g.state.player.y).toBe(CONFIG.player.minY);
    expect(g.state.player.y-117).toBeGreaterThanOrEqual(58);
    const enemy=g.spawnEnemy('bun',{x:300,y:WORLD.bounds.top});
    expect(enemy.y).toBe(WORLD.bounds.top+enemy.radius);expect(enemy.y).toBeLessThan(CONFIG.player.minY);
  });
  it('natural drops and supply landing positions stay reachable below the player top boundary',()=>{
    const g=new Game(51);g.state.player.y=CONFIG.player.minY;g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=Infinity;
    for(let i=0;i<1200;i++){g.state.enemies=[];g.update(1/60,zero);expect(g.state.pickups.every(p=>p.y>=CONFIG.player.minY)).toBe(true);expect(g.state.weaponDrops.every(p=>p.y>=CONFIG.player.minY)).toBe(true);}
    g.clearArena();g.state.player.moveDirection={x:0,y:-1};g.triggerSkill('supply');
    expect(g.state.pickups.length).toBeGreaterThan(0);expect(g.state.pickups.every(p=>p.y>=CONFIG.player.minY)).toBe(true);
  });
  it('twenty bowls reserve only two telegraphs, releasing slots on stun and firing',()=>{
    const g=lab();g.state.player.invulnerableUntil=Infinity;
    for(let i=0;i<20;i++){const e=g.spawnEnemy('bowl',{x:130+(i%10)*90,y:160+Math.floor(i/10)*430});e.shotReadyAt=0;}
    const warnings=()=>g.state.enemies.filter(e=>(e.shotWarnUntil??0)>g.state.time);
    g.update(1/60,zero);expect(warnings()).toHaveLength(2);
    const stunned=warnings()[0];stunned.stunUntil=g.state.time+1;
    g.update(1/60,zero);expect(stunned.shotWarnUntil).toBe(0);expect(warnings()).toHaveLength(2);
    let fired=false;
    for(let frame=0;frame<900;frame++){g.update(1/60,zero);expect(warnings().length).toBeLessThanOrEqual(CONFIG.ranged.concurrent);if(g.state.enemyShots!.length)fired=true;}
    expect(fired).toBe(true);expect(g.state.enemyShots!.length).toBeLessThanOrEqual(12);
  });
  it('sustained straight movement ramps gently and a turn or stop resets it',()=>{
    const g=lab();g.state.player.x=120;run(g,1.8,{x:1,y:0});expect(g.state.player.sprintMultiplier).toBeCloseTo(1);
    run(g,.6,{x:1,y:0});expect(g.state.player.sprintMultiplier).toBeCloseTo(1.12,2);
    g.update(1/60,{x:0,y:1});expect(g.state.player.sprintMultiplier).toBe(1);expect(g.state.player.sprintTime).toBe(0);
    g.update(1/60,zero);expect(g.state.player.sprintTime).toBe(0);
  });
  it('dash follows last input, is immune, respects cooldown and never leaves arena',()=>{
    const g=lab();g.update(1/60,{x:1,y:0});const x=g.state.player.x;const e=g.spawnEnemy('bowl',{x:x+45,y:370});e.stunUntil=100;
    expect(g.dash()).toBe(true);expect(g.dash()).toBe(false);run(g,.18);expect(g.state.player.x-x).toBeGreaterThan(95);expect(g.state.player.hp).toBe(100);
    run(g,.2);expect(g.state.player.dashReadyAt).toBeGreaterThan(g.state.time);
    g.state.player.x=WORLD.bounds.right-g.state.player.radius-5;g.state.player.dashReadyAt=0;g.dash();run(g,.18);expect(g.state.player.x).toBe(WORLD.bounds.right-g.state.player.radius);
    g.clearArena();expect(g.state.player.dashUntil).toBe(0);expect(g.state.enemyShots).toEqual([]);g.reset(2,true);expect(g.state.player.sprintMultiplier).toBe(1);
  });
  it('bowl locks its warning aim for .9s before one slow shot, then waits',()=>{
    const g=lab(),b=g.spawnEnemy('bowl',{x:300,y:370});b.shotReadyAt=0;g.update(1/60,zero);
    const angle=b.shotAngle;expect(b.shotWarnUntil!-g.state.time).toBeCloseTo(.9);g.state.player.y=550;run(g,.8);expect(g.state.enemyShots).toHaveLength(0);expect(b.shotAngle).toBe(angle);
    run(g,.12);expect(g.state.enemyShots).toHaveLength(1);expect(g.state.enemyShots![0].vy).toBeCloseTo(0);expect(Math.hypot(g.state.enemyShots![0].vx,g.state.enemyShots![0].vy)).toBe(90);
    run(g,1);expect(g.state.enemyShots).toHaveLength(1);
  });
  it('hostile shots have real swept hits, eight damage, protection and bubble handling',()=>{
    const g=lab();const shot=()=>({id:900,ownerId:99,x:600,y:370,px:600,py:370,vx:6000,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10});
    g.state.enemyShots=[shot()];g.update(1/60,zero);expect(g.state.player.hp).toBe(92);expect(g.state.enemyShots).toHaveLength(0);
    g.state.enemyShots=[shot()];g.update(1/60,zero);expect(g.state.player.hp).toBe(92);
    g.state.player.invulnerableUntil=0;g.triggerSkill('bubble');g.state.enemyShots=[shot()];g.update(1/60,zero);expect(g.state.player.hp).toBe(92);expect(g.state.player.bubbleUntil).toBe(0);
  });
  it('simultaneous shot and contact prefer actual time then higher damage',()=>{
    const g=lab();g.spawnEnemy('bowl',g.state.player).stunUntil=100;g.state.enemyShots=[{id:500,ownerId:99,x:640,y:370,px:640,py:370,vx:0,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10}];g.update(1/60,zero);expect(g.state.player.hp).toBe(82);
  });
  it('bowl shots remain capped, stun cancels telegraphs and opening stage has no bowls',()=>{
    const g=lab();for(let i=0;i<20;i++){const b=g.spawnEnemy('bowl',{x:120+(i%10)*70,y:180+Math.floor(i/10)*300});b.shotReadyAt=0;}
    run(g,1);expect(g.state.enemyShots!.length).toBeLessThanOrEqual(CONFIG.ranged.cap);
    const b=g.state.enemies[0];b.shotWarnUntil=g.state.time+.5;b.stunUntil=g.state.time+1;g.update(1/60,zero);expect(b.shotWarnUntil).toBe(0);
    expect(difficultyAt(29.9).weights[2]).toBe(0);expect(difficultyAt(30).weights[2]).toBeGreaterThan(0);
  });
  it('crowd arrives early, keeps stable HP and uses a bounded hundred-enemy cap',()=>{
    const g=new Game(55);g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=1000;run(g,8);expect(g.state.enemies.length).toBeGreaterThan(20);expect(g.state.enemies.every(e=>e.maxHp===CONFIG.enemies[e.kind].hp)).toBe(true);expect(difficultyAt(1000).cap).toBe(100);
  });
  it('weapons arrive around four seconds near the player, with two natural packages',()=>{
    const g=new Game(71);g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=1000;
    for(let i=0;i<250;i++){g.state.enemies=[];g.update(1/60,zero);}expect(g.state.weaponDrops.filter(d=>!d.returnDrop)).toHaveLength(1);const d=g.state.weaponDrops[0];expect(Math.hypot(d.x-g.state.player.x,d.y-g.state.player.y)).toBeLessThanOrEqual(270);
    for(let i=0;i<850;i++){g.state.enemies=[];g.update(1/60,zero);}expect(g.state.weaponDrops.filter(d=>!d.returnDrop)).toHaveLength(2);
  });
});
