import {describe,expect,it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import {ELITE_KINDS,EPIC_KINDS,isGuard,type Enemy} from '../src/shared/types';

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
const guards=(game:Game)=>game.state.enemies.filter(e=>isGuard(e.kind));
function finish(game:Game,enemy:Enemy){
  Object.assign(game.state.player,{x:enemy.x,y:enemy.y});
  enemy.hp=1;game.triggerSkill('fan');
  expect(game.state.enemies).not.toContain(enemy);
  game.update(CONFIG.step,still);
}

describe('defeating guards to advance the challenge',()=>{
  it.each([
    [1,['eliteCrab']], [2,['giantBun']], [3,['eliteKettle']], [4,['eliteSesame','eliteSkewer']],
  ] as const)('sends the expected headliners for wave %i', (wave,kinds)=>{
    const game=nearArrival(wave);
    expect(guards(game).map(e=>e.kind)).toEqual(kinds);
    const ids=guards(game).map(e=>e.id);
    game.update(.5,still);
    expect(guards(game).map(e=>e.id)).toEqual(ids);
  });

  it('introduces all ten elites and varies the later pairs without duplicating a guard',()=>{
    const encountered=new Set<string>(),partners=new Map<string,Set<string>>();
    for(let wave=1;wave<=30;wave++){
      if(wave%5===0)continue;
      const game=nearArrival(wave);
      const roster=guards(game).map(e=>e.kind);
      expect(new Set(roster).size).toBe(wave<4?1:2);
      for(const kind of roster){
        if(wave<=8)encountered.add(kind);
        if(roster.length===2){
          const others=partners.get(kind)??new Set<string>();
          others.add(roster.find(k=>k!==kind)!);
          partners.set(kind,others);
        }
      }
    }
    expect(encountered).toEqual(new Set(ELITE_KINDS));
    expect([...partners.values()].every(others=>others.size>1)).toBe(true);
  });

  it.each([...EPIC_KINDS,EPIC_KINDS[0]].map((kind,i)=>[5*(i+1),kind] as const))(
    'opens wave %i with one %s and advances when that boss falls', (wave,kind)=>{
      const game=new Game(731),s=game.state;
      s.wave=wave;s.waveStartedAt=s.time;
      s.player.invulnerableUntil=Infinity;s.weapon.readyAt=Infinity;
      game.update(CONFIG.step,still);
      const [boss]=guards(game);
      expect(s.enemies.map(e=>e.kind)).toEqual([kind]);
      expect(s.eliteWave).toBe(wave);
      for(let i=0;i<6;i++)game.update(.2,still);
      expect(s.enemies).toEqual([boss]);
      // An expired wave timer cannot bypass its living boss or spawn a second one.
      s.time=80;game.update(CONFIG.step,still);
      expect(s.wave).toBe(wave);expect(guards(game)).toEqual([boss]);
      finish(game,boss);
      expect(s.wave).toBe(wave+1);expect(s.waveStartedAt).toBeCloseTo(s.time);
    });

  it('starts the next street immediately after an early epic kill, with living ordinary survivors',()=>{
    const game=new Game(319),s=game.state;
    s.wave=5;s.player.invulnerableUntil=Infinity;s.weapon.readyAt=Infinity;
    game.update(.7,still);
    const [boss]=guards(game);
    const survivor=game.spawnEnemy('box',{x:100,y:190});
    finish(game,boss);
    expect(s.wave).toBe(6);expect(s.waveStartedAt).toBeLessThan(1);
    expect(s.enemies).toContain(survivor);
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
    game.update(.75,still);expect(s.wave).toBe(5);expect(guards(game).map(e=>e.kind)).toEqual(['epicHotpot']);
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
