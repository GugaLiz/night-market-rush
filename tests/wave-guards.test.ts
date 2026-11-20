import {describe,expect,it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import {isElite,type Enemy} from '../src/shared/types';

const still={x:0,y:0};
function nearArrival(wave:number){
  const game=new Game(3125),s=game.state;
  s.wave=wave;
  s.waveStartedAt=wave===1?0:CONFIG.waves.firstDuration+(wave-2)*CONFIG.waves.duration;
  const duration=wave===1?CONFIG.waves.firstDuration:CONFIG.waves.duration;
  s.time=s.waveStartedAt+duration-CONFIG.waves.eliteLead-CONFIG.step;
  s.effects.dispatchUntil=Infinity;s.player.invulnerableUntil=Infinity;s.weapon.readyAt=Infinity;
  game.update(CONFIG.step,still);
  return game;
}
const guards=(game:Game)=>game.state.enemies.filter(e=>isElite(e.kind));
function finish(game:Game,enemy:Enemy){
  Object.assign(game.state.player,{x:enemy.x,y:enemy.y});
  enemy.hp=1;game.triggerSkill('fan');
  expect(game.state.enemies).not.toContain(enemy);
  game.update(CONFIG.step,still);
}

describe('defeating guards to advance the challenge',()=>{
  it.each([
    [1,['eliteCrab']], [2,['giantBun']], [3,['eliteKettle']], [4,['eliteSesame','eliteCrab']],
  ] as const)('sends the expected headliners for wave %i', (wave,kinds)=>{
    const game=nearArrival(wave);
    expect(guards(game).map(e=>e.kind)).toEqual(kinds);
    const ids=guards(game).map(e=>e.id);
    game.update(.5,still);
    expect(guards(game).map(e=>e.id)).toEqual(ids);
  });

  it('holds wave four through overtime and one defeat, starting the next clock only after both go down',()=>{
    const game=nearArrival(4),s=game.state,[first,second]=guards(game);
    const end=s.waveStartedAt+CONFIG.waves.duration;
    s.time=end+8;game.update(CONFIG.step,still);
    expect(s.wave).toBe(4);
    finish(game,first);
    expect(s.wave).toBe(4);expect(guards(game).map(e=>e.id)).toEqual([second.id]);
    game.update(.5,still);expect(game.drainEvents().some(e=>e.type==='wave')).toBe(false);
    finish(game,second);
    expect(s.wave).toBe(5);expect(s.waveStartedAt).toBeCloseTo(s.time);
    expect(game.drainEvents().filter(e=>e.type==='wave')).toEqual([{type:'wave',wave:5}]);
    game.update(.75,still);expect(s.wave).toBe(5);expect(guards(game)).toHaveLength(0);
  });

  it('holds difficulty and fresh reinforcements during a long first guard fight and through a revive',()=>{
    const game=nearArrival(1),s=game.state,[crab]=guards(game);
    s.time=200;s.effects.dispatchUntil=0;game.update(CONFIG.step,still);
    expect(s.stage).toBe(2);expect(s.wave).toBe(1);expect(s.enemies).toEqual([crab]);
    crab.hp=135;s.player.hp=1;s.player.invulnerableUntil=0;
    const bun=game.spawnEnemy('bun',s.player);bun.spawnAt=s.time-1;
    game.update(CONFIG.step,still);expect(s.ended).toBe(true);
    const stopped=s.time;game.update(.5,still);expect(s.time).toBe(stopped);
    expect(game.revive()).toBe(true);expect(guards(game)).toEqual([crab]);expect(crab.hp).toBe(135);
    expect(s.eliteWave).toBe(1);expect(s.wave).toBe(1);
    finish(game,crab);expect(s.wave).toBe(2);expect(s.stage).toBe(2);
    game.reset(3125);expect(game.state.eliteWave).toBeUndefined();
    expect(game.state.wave).toBe(1);expect(game.state.revivesUsed).toBe(0);
    expect(game.state.enemies).toEqual([]);expect(game.state.time).toBe(0);
  });
});
