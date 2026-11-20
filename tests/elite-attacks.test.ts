import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../src/core/config';
import {crabChargeReach} from '../src/core/enemies';
import {Game} from '../src/core/game';

const still={x:0,y:0};
function arena(){
  const game=new Game(42);
  game.reset(42,true);
  game.state.weapon.readyAt=Infinity;
  return game;
}
function until(game:Game,ready:()=>boolean){
  for(let i=0;i<600;i++){
    if(ready())return;
    game.update(CONFIG.step,still);
  }
  throw new Error('Expected attack phase was never reached');
}

describe('night market elite attacks',()=>{
  it('spawns every elite inside the arena with the same grounded footprint as the giant',()=>{
    const game=arena();
    for(const kind of ['giantBun','eliteCrab','eliteKettle','eliteSesame'] as const){
      const e=game.spawnEnemy(kind,{x:WORLD.width,y:WORLD.height});
      expect(e.radius).toBe(CONFIG.enemies.giantBun.radius);
      expect(e.x+e.radius).toBe(WORLD.bounds.right);
      expect(e.y+e.radius).toBe(WORLD.bounds.bottom);
      expect(game.spawnEnemy(kind,{x:0,y:0}).y).toBe(CONFIG.player.minY);
    }
  });

  it('reaches the marked outer edge of a long claw charge and leaves space just beside it',()=>{
    for(const offset of [-1,1]){
      const game=arena(),p=game.state.player;
      p.x=850;
      const crab=game.spawnEnemy('eliteCrab',{x:320,y:p.y});crab.phaseUntil=0;
      until(game,()=>crab.phase==='warn');
      const from=crab.x,reach=crabChargeReach(crab,game.state.time);
      expect(reach).toBeCloseTo(624);
      p.y+=CONFIG.elites.crab.halfWidth+p.radius+offset;
      until(game,()=>crab.phase==='recover');
      expect(crab.x-from).toBeCloseTo(reach);
      expect(p.hp).toBe(offset<0?100-CONFIG.elites.crab.damage:100);
    }
  });

  it('ends a diagonal claw sweep at its warned endpoint near the wall when a slow wears off',()=>{
    const game=arena(),s=game.state,p=s.player;
    p.x=1100;p.y=490;p.invulnerableUntil=Infinity;
    const crab=game.spawnEnemy('eliteCrab',{x:850,y:320});crab.phaseUntil=0;
    crab.slowUntil=s.time+CONFIG.elites.crab.warning+.32;
    until(game,()=>crab.phase==='warn');
    const reach=crabChargeReach(crab,s.time),x=crab.x+reach*crab.dashX,y=crab.y+reach*crab.dashY;
    expect(x+crab.radius).toBeCloseTo(WORLD.bounds.right);
    until(game,()=>crab.phase==='recover');
    expect(crab.x).toBeCloseTo(x);expect(crab.y).toBeCloseTo(y);
  });

  it('charges along the warned line even after the courier turns, with crab-specific damage',()=>{
    const game=arena(),s=game.state,p=s.player;
    const crab=game.spawnEnemy('eliteCrab',{x:p.x-200,y:p.y});crab.phaseUntil=0;
    until(game,()=>crab.phase==='warn');
    expect(crab.dashX).toBeCloseTo(1);expect(crab.dashY).toBeCloseTo(0);
    const laneY=crab.y;
    p.y+=120;until(game,()=>crab.phase==='dash');game.update(.1,still);
    expect(crab.y).toBeCloseTo(laneY);expect(p.hp).toBe(100);
    p.x=crab.x+60;p.y=crab.y;game.update(.14,still);
    expect(s.lastDamage).toBe('eliteCrab');expect(s.lastDamageAmount).toBe(CONFIG.elites.crab.damage);
  });

  it('launches all five tea drops on the marked fan and attributes a fatal hit to the kettle',()=>{
    const game=arena(),s=game.state,p=s.player;
    p.x=1060;
    const kettle=game.spawnEnemy('eliteKettle',{x:p.x-810,y:p.y});kettle.shotReadyAt=0;
    until(game,()=>(kettle.shotWarnUntil??0)>s.time);
    const aim=kettle.shotAngle!;
    p.y+=130;until(game,()=>!!s.enemyShots?.length);
    const shots=s.enemyShots!;
    expect(shots).toHaveLength(CONFIG.elites.kettle.shots);
    const {spread}=CONFIG.elites.kettle;
    shots.forEach((shot,i)=>{
      expect(shot.kind).toBe('tea');expect(shot.ownerId).toBe(kettle.id);
      expect(Math.atan2(shot.vy,shot.vx)).toBeCloseTo(aim+spread*(i/(shots.length-1)-.5));
    });
    p.x=kettle.x+160;p.y=kettle.y;p.hp=1;
    until(game,()=>s.ended);expect(s.cause).toBe('eliteKettle');expect(s.lastDamage).toBe('eliteKettle');
  });

  it('uses the marked tea-drop radius on the center lane while leaving the gaps between lanes open',()=>{
    for(const offset of [-1,1]){
      const game=arena(),s=game.state,p=s.player;
      const kettle=game.spawnEnemy('eliteKettle',{x:p.x-350,y:p.y});kettle.shotReadyAt=0;
      until(game,()=>(kettle.shotWarnUntil??0)>s.time);
      p.y+=CONFIG.elites.kettle.radius+p.radius+offset;
      until(game,()=>!!s.enemyShots?.length);
      for(let i=0;i<100;i++)game.update(CONFIG.step,still);
      expect(p.hp).toBe(offset<0?100-CONFIG.elites.kettle.damage:100);
    }
  });

  it('drops syrup once at the warned position and lets the courier step clear before impact',()=>{
    const game=arena(),s=game.state,p=s.player;
    const sesame=game.spawnEnemy('eliteSesame',{x:p.x-255,y:p.y});sesame.shotReadyAt=0;
    until(game,()=>!!sesame.syrupTarget);
    const first={x:p.x,y:p.y};
    p.x+=CONFIG.elites.sesame.radius+p.radius+1;until(game,()=>sesame.syrupImpactAt!==undefined);
    expect(sesame.syrupTarget).toEqual(first);expect(p.hp).toBe(100);
    game.update(.5,still);expect(sesame.syrupTarget).toBeUndefined();
    until(game,()=>!!sesame.syrupTarget);
    expect(sesame.syrupTarget).toEqual({x:p.x,y:p.y});
    p.y+=CONFIG.elites.sesame.radius+p.radius-1;
    until(game,()=>sesame.syrupImpactAt!==undefined);
    expect(s.lastDamage).toBe('eliteSesame');expect(p.hp).toBe(100-CONFIG.elites.sesame.damage);
    p.invulnerableUntil=0;game.update(.25,still);expect(p.hp).toBe(100-CONFIG.elites.sesame.damage);
  });

  it.each(['eliteCrab','eliteKettle','eliteSesame'] as const)('interrupts the windup of %s and clears its warning',kind=>{
    const game=arena(),s=game.state,p=s.player;
    const enemy=game.spawnEnemy(kind,{x:p.x-160,y:p.y});enemy.phaseUntil=enemy.shotReadyAt=0;
    until(game,()=>enemy.phase==='warn'||(enemy.shotWarnUntil??0)>s.time);
    game.triggerSkill('bell');game.update(.16,still);
    expect(enemy.bellStunUntil).toBeGreaterThan(s.time);
    expect(enemy.phase).not.toBe('warn');expect(enemy.shotWarnUntil??0).toBe(0);
    expect(enemy.syrupTarget).toBeUndefined();game.update(1,still);
    expect(p.hp).toBe(100);expect(s.enemyShots).toHaveLength(0);
  });

  it('reserves the whole fan inside the shared projectile cap, also when several kettles attack',()=>{
    const game=arena(),s=game.state;
    for(let i=0;i<6;i++)game.spawnEnemy('eliteKettle',{x:380+i*15,y:240+i*9}).shotReadyAt=0;
    until(game,()=>!!s.enemyShots?.length);
    expect(s.enemyShots!).toHaveLength(10);expect(new Set(s.enemyShots!.map(shot=>shot.ownerId)).size).toBe(2);
    for(let i=0;i<360;i++){
      game.update(CONFIG.step,still);expect(s.enemyShots!.length).toBeLessThanOrEqual(CONFIG.ranged.cap);
    }
    game.clearArena();expect(s.enemyShots).toHaveLength(0);expect(s.enemies).toHaveLength(0);
  });
});
