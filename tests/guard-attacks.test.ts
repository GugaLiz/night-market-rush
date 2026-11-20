import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG} from '../src/core/config';
import {guardMarkContact,guardShapeAt} from '../src/core/guard-attacks';
import {EPIC_KINDS,type EnemyKind,type GuardShape,type Vec} from '../src/shared/types';

const still={x:0,y:0};
function encounter(kind:EnemyKind){
  const game=new Game(171);
  game.reset(171,true);
  const s=game.state;
  s.weapon.readyAt=Infinity;
  const guard=game.spawnEnemy(kind,{x:s.player.x-220,y:s.player.y});
  guard.shotReadyAt=0;
  return {game,s,guard};
}
function tick(g:Game,seconds:number){
  for(let i=0;i<Math.ceil(seconds/CONFIG.step);i++)g.update(CONFIG.step,still);
}
const expectedHelpers={epicHotpot:'siumai',epicDragon:'zongzi',epicOpera:'box',epicPearl:'onigiri',epicSteamer:'bun'};

describe('market guard choreography',()=>{
  it.each(['eliteSkewer','eliteLotus','eliteChili','eliteTofu','eliteTanghulu','eliteRoll'] as const)('%s locks a visible attack before it actually damages a stationary rider',kind=>{
    const {game,s,guard}=encounter(kind);
    tick(game,.25);
    const cast=guard.guardCast!;
    expect(cast.marks.length).toBeGreaterThan(0);
    expect(s.player.hp).toBe(100);
    tick(game,cast.endsAt-s.time);
    expect(s.player.hp).toBeLessThan(100);
    expect(s.lastDamage).toBe(kind);
  });

  it.each(EPIC_KINDS)('%s executes two damaging attacks and calls its own type of warned helper',kind=>{
    const {game,s,guard}=encounter(kind);
    s.player.invulnerableUntil=Infinity;
    const moves=new Set<string>();
    let helperTime=-1;
    for(let frame=0;frame<18*60;frame++){
      game.update(CONFIG.step,still);
      const cast=guard.guardCast;
      if(!cast)continue;
      if(cast.marks.some(mark=>mark.damage>0))moves.add(cast.name);
      const helper=s.enemies.find(e=>e.summonerId===guard.id);
      if(helper){
        expect(helper.kind).toBe(expectedHelpers[kind]);
        helperTime=s.time-helper.spawnAt;
        break;
      }
    }
    expect(moves.size).toBe(2);
    expect(helperTime).toBeCloseTo(0);
  });

  it.each(EPIC_KINDS)('%s deals damage from inside the first printed mark of either signature move',kind=>{
    for(const turn of [0,1]){
      const {game,s,guard}=encounter(kind);
      guard.guardTurn=turn;
      tick(game,.04);
      const mark=guard.guardCast!.marks[0],shape=guardShapeAt(mark,mark.hitAt);
      let target:Vec;
      if(shape.kind==='lane')target={x:(shape.from.x+shape.to.x)/2,y:(shape.from.y+shape.to.y)/2};
      else if(shape.kind==='fan')target={x:shape.center.x+Math.cos(shape.angle)*160,y:shape.center.y+Math.sin(shape.angle)*160};
      else target={x:shape.center.x+(shape.radius+shape.inner)*.5,y:shape.center.y};
      s.player.x=target.x;s.player.y=target.y;
      while(s.time+CONFIG.step<mark.hitAt)game.update(CONFIG.step,still);
      expect(s.player.hp).toBe(100);
      tick(game,CONFIG.step);
      expect(s.player.hp).toBe(100-mark.damage);
      expect(s.lastDamage).toBe(kind);
    }
  });

  it('sounds one epic strike at the first active mark, even when dodged, and cancels the beat if the cast was interrupted',()=>{
    for(const interrupt of [false,true]){
      const {game,s,guard}=encounter('epicPearl');
      tick(game,.3);
      const cast=guard.guardCast!,first=cast.marks[0];
      s.player.x+=100;s.player.y-=130;
      if(interrupt)game.triggerSkill('frost');
      while(s.time+CONFIG.step<first.hitAt)game.update(CONFIG.step,still);
      expect(game.drainEvents().filter(e=>e.type==='guardBeat')).toEqual([]);
      tick(game,CONFIG.step);
      const beats=game.drainEvents().filter(e=>e.type==='guardBeat');
      if(interrupt)expect(beats).toEqual([]);
      else expect(beats).toEqual([{type:'guardBeat',kind:'epicPearl',beat:'strike',x:640,y:370}]);
      tick(game,cast.endsAt-s.time+.12);
      expect(game.drainEvents().filter(e=>e.type==='guardBeat')).toEqual([]);
    }
  });

  it('sounds a summon only when the first helper enters; a blocked seal is silent',()=>{
    for(const block of [false,true]){
      const {game,s,guard}=encounter('epicSteamer');
      guard.guardTurn=2;
      tick(game,.1);
      const seals=guard.guardCast!.marks;
      expect(seals.every(m=>m.summon==='bun')).toBe(true);
      if(block)for(const seal of seals){
        if(seal.shape.kind==='disc'){
          const occupant=game.spawnEnemy('bowl',seal.shape.center);
          occupant.stunUntil=Infinity;
        }
      }
      expect(game.drainEvents().filter(e=>e.type==='guardBeat')).toHaveLength(0);
      tick(game,1.5);
      const events=game.drainEvents(),beats=events.filter(e=>e.type==='guardBeat');
      expect(beats).toHaveLength(block?0:1);
      if(!block){
        expect(s.enemies.filter(e=>e.summonerId===guard.id).length).toBeGreaterThan(1);
        expect(beats[0]).toMatchObject({kind:'epicSteamer',beat:'summon'});
        expect(events.findIndex(e=>e.type==='spawn')).toBeLessThan(events.indexOf(beats[0]));
      }
    }
  });

  it('keeps the lane locked while a player crosses it during warning, and the charging body continues after contact',()=>{
    const {game,s,guard}=encounter('eliteRoll');
    tick(game,.1);
    const marks=guard.guardCast!.marks;
    const first=marks[0],second=marks[1];
    if(first.shape.kind!=='lane'||second.shape.kind!=='lane')throw Error('Expected two roll segments');
    expect(guardShapeAt(first,s.time)).toEqual(first.shape);
    const middle=guardShapeAt(first,(first.hitAt+first.endAt)/2);
    if(middle.kind!=='disc')throw Error('Expected rolling body');
    s.player.x=middle.center.x;s.player.y=middle.center.y;
    tick(game,second.endAt-s.time);
    expect(s.player.hp).toBeLessThan(100);
    expect(guard.x).toBeCloseTo(second.shape.to.x,0);
    expect(guard.y).toBeCloseTo(second.shape.to.y,0);
  });

  it('keeps clear lanes safe and cancels a pending attack on the actual bell pickup',()=>{
    const {game,s,guard}=encounter('eliteTofu');
    tick(game,.25);
    const cast=guard.guardCast!;
    s.player.x+=54;s.player.y+=8;
    tick(game,cast.endsAt-s.time);
    expect(s.player.hp).toBe(100);
    guard.shotReadyAt=0;tick(game,2.4);
    expect(guard.guardCast).toBeDefined();
    s.player.x=guard.x+105;s.player.y=guard.y;
    game.triggerSkill('bell');
    tick(game,.09);
    expect(guard.guardCast).toBeUndefined();
    tick(game,1.2);
    expect(guard.guardCast).toBeUndefined();
    expect(s.player.hp).toBe(100);
  });

  it('limits reinforcements per owner and withdraws surviving helpers on the killing blow without awarding extra kills',()=>{
    const {game,s,guard}=encounter('epicHotpot');
    s.player.invulnerableUntil=Infinity;
    const bystander=game.spawnEnemy('bun',{x:95,y:190});
    for(let n=0;n<7;n++){
      guard.guardTurn=2;guard.shotReadyAt=0;delete guard.guardCast;
      tick(game,1.26);
      const helpers=s.enemies.filter(e=>e.summonerId===guard.id);
      expect(helpers.length).toBeLessThanOrEqual(4);
      if(n>1&&guard.guardSummoned!<9)
        s.enemies=s.enemies.filter(e=>e.summonerId!==guard.id);
    }
    expect(guard.guardSummoned).toBe(9);
    expect(s.enemies.some(e=>e.summonerId===guard.id)).toBe(true);
    // The fan hits the boss first and still holds the gathered helpers in its sweep.
    for(const h of s.enemies.filter(e=>e.summonerId===guard.id)){h.x=guard.x+5;h.y=guard.y;h.hp=1;}
    s.player.x=guard.x;s.player.y=guard.y;guard.hp=1;
    game.triggerSkill('fan');tick(game,.02);
    expect(s.enemies.some(e=>e.id===guard.id||e.summonerId===guard.id)).toBe(false);
    expect(s.enemies).toContain(bystander);
    expect(game.drainEvents().filter(e=>e.type==='kill')).toHaveLength(1);
  });

  it('spots short crossings through each attack shape without clipping into holes or ending a sweep early',()=>{
    const {s}=encounter('epicOpera');
    const center={x:0,y:0};
    function test(shape:GuardShape,start:Vec,end:Vec){
      const mark={shape,warnAt:0,hitAt:1,endAt:2,damage:15};
      const p={...s.player,...end,px:start.x,py:start.y,radius:2};
      expect(guardMarkContact(mark,p,.9,.1)).toBeNull();
      return guardMarkContact(mark,p,1.1,.1);
    }
    const ring:GuardShape={kind:'ring',center,inner:24,radius:34};
    expect(test(ring,center,{x:8,y:0})).toBeNull();
    expect(test(ring,center,{x:80,y:0})).toBeCloseTo(22/80);
    expect(test({kind:'lane',from:{x:-80,y:0},to:{x:80,y:0},radius:6},{x:0,y:42},{x:0,y:-42})).toBeCloseTo(34/84);
    const fan:GuardShape={kind:'fan',center,halfAngle:.2,angle:0,radius:100};
    expect(test(fan,{x:50,y:60},{x:50,y:-40})).toBeLessThan(.5);
    expect(test(fan,{x:45,y:42},{x:55,y:40})).toBeNull();
  });
});
