import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import {guardShapeAt} from '../cocos/assets/scripts/domain/core/guard-attacks';
import {crabChargeReach} from '../cocos/assets/scripts/domain/core/enemies';
import type {GuardMark} from '../cocos/assets/scripts/domain/shared/types';
import {enemyWarnings} from '../cocos/assets/scripts/presentation/enemy-warning-model';

describe('foreground enemy warnings',()=>{
  it('shares the guard collision shape and timing, including a moving rush',()=>{
    const game=new Game(3),enemy=game.spawnEnemy('eliteRoll',{x:400,y:350});enemy.spawnAt=-10;
    const mark:GuardMark={shape:{kind:'lane',from:{x:400,y:350},to:{x:800,y:350},radius:45},
      warnAt:2,hitAt:3,endAt:4,damage:20,rush:true};
    enemy.guardCast={name:'rush',startsAt:2,endsAt:4,marks:[mark]};
    expect(enemyWarnings(enemy,1.99)).toEqual([]);
    expect(enemyWarnings(enemy,2.5)[0].shape).toEqual(mark.shape);
    expect(enemyWarnings(enemy,3.5)[0].shape).toEqual(guardShapeAt(mark,3.5));
    expect(enemyWarnings(enemy,3.5)[0].live).toBe(true);
    expect(enemyWarnings(enemy,4)).toEqual([]);
  });

  it('uses the giant safe wedge and crab collision width and remaining reach',()=>{
    const game=new Game(4),giant=game.spawnEnemy('giantBun',{x:300,y:350});giant.spawnAt=-10;
    giant.jump={phase:'warn',hop:3,startedAt:2,until:3,from:{x:300,y:350},target:{x:700,y:400},gapAngle:.4};
    const shape=enemyWarnings(giant,2.5)[0].shape;
    expect(shape.kind).toBe('fan');
    if(shape.kind==='fan'){
      expect(shape.angle-shape.halfAngle).toBeCloseTo(.4+CONFIG.giant.gapHalfAngle);
      expect(shape.angle+shape.halfAngle).toBeCloseTo(.4+2*Math.PI-CONFIG.giant.gapHalfAngle);
      expect(shape.radius).toBe(CONFIG.giant.stompRadius);
    }
    const crab=game.spawnEnemy('eliteCrab',{x:400,y:350});crab.spawnAt=-10;
    crab.phase='dash';crab.phaseUntil=3;crab.dashX=1;crab.dashY=0;
    const lane=enemyWarnings(crab,2.5)[0].shape;
    expect(lane.kind).toBe('lane');
    if(lane.kind==='lane'){
      expect(lane.radius).toBe(CONFIG.elites.crab.halfWidth);
      expect(lane.to.x-lane.from.x).toBeCloseTo(crabChargeReach(crab,2.5));
    }
  });

  it('uses actual projectile radii and stops warning after the shot is fired',()=>{
    const game=new Game(5),bowl=game.spawnEnemy('bowl',{x:400,y:350});bowl.spawnAt=-10;
    bowl.shotAngle=0;bowl.shotWarnUntil=4;
    const lane=enemyWarnings(bowl,3)[0].shape;
    expect(lane.kind).toBe('lane');if(lane.kind==='lane')expect(lane.radius).toBe(CONFIG.ranged.radius);
    expect(enemyWarnings(bowl,4)).toEqual([]);
  });
});
