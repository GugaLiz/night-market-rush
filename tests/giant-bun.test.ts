import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,WORLD} from '../src/core/config';
import {giantPulseContact,giantPulseLifetime,giantPulseRadius} from '../src/core/giant-bun';
import type {GiantPulse,Vec} from '../src/shared/types';

const still={x:0,y:0};
function tick(g:Game,frames=1,input:Vec=still){
  for(let i=0;i<frames;i++)g.update(CONFIG.step,input);
}
function arena(){
  const g=new Game(9281);g.reset(9281,true);g.state.weapon.readyAt=Infinity;
  return g;
}
function wait(g:Game,predicate:()=>boolean){
  for(let i=0;i<420;i++){if(predicate())return;tick(g);}
  throw new Error('Expected giant bun phase was never reached');
}
const exampleWave=():GiantPulse=>({id:98,hop:3,x:640,y:400,gapAngle:0,bornAt:0,reach:720,spent:false});

describe('giant bun landing and the open flour wave',()=>{
  it('telegraphs a fixed target, travels without midair contact and can be hit again at rest',()=>{
    const g=arena(),e=g.spawnEnemy('giantBun',{x:1080,y:360}),p=g.state.player;
    tick(g);expect(e.jump?.phase).toBe('warn');
    const first={...e.jump!.target};
    expect(e.jump!.until-e.jump!.startedAt).toBeCloseTo(.65);
    p.x=750;p.y=360;tick(g,20);
    expect(e.jump!.target).toEqual(first);
    wait(g,()=>e.jump!.phase==='flight');
    tick(g,7);const startHp=e.hp;
    // Put both player and the contact skill directly in the aerial projection.
    p.x=e.x;p.y=e.y;g.triggerSkill('fan');tick(g,7);
    expect(e.hp).toBe(startHp);expect(p.hp).toBe(100);
    wait(g,()=>e.jump!.phase==='rest');
    expect(e.x).toBe(first.x);expect(e.y).toBe(first.y);
    expect(g.drainEvents().some(x=>x.type==='giantLand' && x.hop===1)).toBe(true);
    p.x=e.x;p.y=e.y;g.triggerSkill('fan');tick(g,4);
    expect(e.hp).toBeLessThan(startHp);
  });

  it('alternates the landing side for three jumps and keeps the warned gap fixed through recovery',()=>{
    const g=arena(),e=g.spawnEnemy('giantBun',{x:180,y:500});
    const targets:number[]=[];
    for(const hop of [1,2,3]){
      wait(g,()=>e.jump?.phase==='warn' && e.jump.hop===hop);
      const j=e.jump!,gap=j.gapAngle,target={...j.target};targets.push(target.x);
      expect(j.until-j.startedAt).toBeCloseTo(hop===3?CONFIG.giant.finalWarning:CONFIG.giant.warning);
      const exit={x:target.x+Math.cos(gap)*130,y:target.y+Math.sin(gap)*130};
      expect(exit.y).toBeGreaterThan(CONFIG.player.minY);
      expect(exit.y).toBeLessThan(WORLD.bounds.bottom);
      if(hop===3){g.state.player.x=exit.x;g.state.player.y=exit.y;}
      wait(g,()=>e.jump?.phase==='rest' && e.jump.hop===hop);
      const pulse=g.state.giantPulses!.find(w=>w.hop===hop)!;
      expect(pulse).toMatchObject({...target,gapAngle:gap});
      if(hop===3){
        expect(e.jump!.until-g.state.time).toBeCloseTo(CONFIG.giant.recovery);
        const hp=g.state.player.hp;
        tick(g,60);expect(g.state.player.hp).toBe(hp);
      }
    }
    expect(targets[0]).toBeGreaterThan(WORLD.start.x);
    expect(targets[1]).toBeLessThan(WORLD.start.x);
    expect(targets[2]).toBeGreaterThan(WORLD.start.x);
    expect(Math.abs(targets[1]-targets[0])).toBeGreaterThanOrEqual((WORLD.bounds.right-WORLD.bounds.left)*.69);
  });

  it('one slam spends exactly once, even if the player gets protected or steps back into the fading print',()=>{
    const g=arena(),p=g.state.player;
    const w:GiantPulse={...exampleWave(),x:p.x,y:p.y,hop:1,reach:CONFIG.giant.stompRadius};
    g.state.giantPulses=[w];
    p.bubbleUntil=10;tick(g);
    expect(p.bubbleUntil).toBe(0);expect(w.spent).toBe(true);expect(p.hp).toBe(100);
    p.invulnerableUntil=0;tick(g,70);expect(p.hp).toBe(100);
    w.spent=false;tick(g);expect(p.hp).toBe(100);
    expect(giantPulseLifetime(w)).toBeGreaterThan(1);
    g.clearArena();expect(g.state.giantPulses).toHaveLength(0);
  });

  it('hits the moving rim after flight time, while players passing through the warned wedge remain safe',()=>{
    const g=arena(),p=g.state.player,w=exampleWave();g.state.giantPulses=[w];
    p.x=w.x-350;p.y=w.y;tick(g,20);expect(p.hp).toBe(100);
    tick(g,20);expect(p.hp).toBe(100-CONFIG.giant.finalDamage);
    expect(g.state.lastDamage).toBe('giantBun');
    p.invulnerableUntil=0;tick(g,10);expect(p.hp).toBe(76);
    expect(giantPulseRadius(w,0.5)).toBeCloseTo(345);
  });

  it('detects a fast crossing of the ring or its lip even if neither endpoint touches danger',()=>{
    const g=arena(),p=g.state.player,w=exampleWave();
    Object.assign(p,{px:640,py:400,x:190,y:400});
    expect(giantPulseContact(w,p,.5,1/60)).not.toBeNull();
    Object.assign(p,{px:640,py:400,x:1090,y:400});
    expect(giantPulseContact(w,p,.5,1/60)).toBeNull();
    Object.assign(p,{px:850,py:400,x:830,y:85});
    expect(giantPulseContact(w,p,.43,1/60)).not.toBeNull();
    w.spent=true;expect(giantPulseContact(w,p,.43,1/60)).toBeNull();
  });

  it('cancels an interrupted windup, killing before touchdown produces no wave',()=>{
    const g=arena(),e=g.spawnEnemy('giantBun',{...g.state.player});
    tick(g,8);g.triggerSkill('bell');tick(g,7);
    expect(e.jump).toBeUndefined();expect(e.stunUntil).toBeGreaterThan(g.state.time);
    wait(g,()=>e.jump?.phase==='warn');
    expect(e.jump!.hop).toBe(1);
    e.hp=10;g.triggerSkill('fan');tick(g,12);
    expect(g.state.enemies).toHaveLength(0);expect(g.state.kills).toBe(1);
    expect(g.state.giantPulses??[]).toHaveLength(0);
  });

  it('adds one elite per even wave using normal spawn grace, spacing and population cap',()=>{
    for(const seed of [7,25,431]){
      const g=new Game(seed),s=g.state;
      s.time=36.1;s.wave=2;s.waveStartedAt=36;s.weapon.readyAt=Infinity;
      tick(g);const elites=s.enemies.filter(e=>e.kind==='giantBun');
      expect(elites).toHaveLength(1);expect(s.lastGiantWave).toBe(2);
      const e=elites[0];expect(e.jump).toBeUndefined();
      expect(Math.hypot(e.x-s.player.x,e.y-s.player.y)).toBeGreaterThanOrEqual(e.radius+s.player.radius+CONFIG.spawn.safeDistance);
      s.enemies=[];tick(g,170);expect(s.enemies.some(x=>x.kind==='giantBun')).toBe(false);
      s.enemies=[];s.time=104.1;s.wave=4;s.waveStartedAt=104;tick(g);
      expect(s.enemies.filter(x=>x.kind==='giantBun')).toHaveLength(1);
    }
  });
});
