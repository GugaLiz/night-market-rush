import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import {enemyHeight} from '../cocos/assets/scripts/presentation/damage-model';
import {syrupDrop,syrupLanding} from '../cocos/assets/scripts/presentation/enemy-syrup-model';
import {enemyWarnings} from '../cocos/assets/scripts/presentation/enemy-warning-model';

describe('sesame guard syrup presentation',()=>{
  it('flies from the posed spoon toward the locked target and disappears at impact',()=>{
    const game=new Game(7),e=game.spawnEnemy('eliteSesame',{x:400,y:350});
    e.facing=1;e.syrupTarget={x:800,y:450};e.shotWarnUntil=3;
    const pose={lift:0,scaleX:1,scaleY:1,tilt:0},start=3-CONFIG.elites.sesame.warning;
    const first=syrupDrop(e,start,pose,false)!;
    expect(first.progress).toBeCloseTo(0);expect(first.x).toBeCloseTo(e.x+.416*enemyHeight(e.kind));
    expect(first.y).toBeCloseTo(e.y-.575*enemyHeight(e.kind));expect(first.scale).toBeCloseTo(.84);
    const middle=syrupDrop(e,start+CONFIG.elites.sesame.warning/2,pose,false)!;
    expect(middle.progress).toBeCloseTo(.5);expect(middle.x).toBeCloseTo((first.x+800)/2);
    expect(middle.y).toBeCloseTo((first.y+450)/2-105);expect(middle.scale).toBeCloseTo(1.105);
    expect(syrupDrop(e,3,pose,false)).toBeNull();
  });
  it('retains a stationary target cue for reduced motion and uses the posed spoon',()=>{
    const game=new Game(8),e=game.spawnEnemy('eliteSesame',{x:400,y:350});
    e.syrupTarget={x:730,y:420};e.shotWarnUntil=2;
    const pose={lift:8,scaleX:1.1,scaleY:.9,tilt:.2};
    expect(syrupDrop(e,1,pose,true)).toMatchObject({x:730,y:401,angle:0});
    const curved=syrupDrop(e,2-CONFIG.elites.sesame.warning,pose,false)!;
    const h=enemyHeight(e.kind),dx=e.facing*.416*h,dy=-.575*h;
    expect(curved.x).toBeCloseTo(e.x+(dx*Math.cos(.2)-dy*Math.sin(.2))*1.1);
    expect(curved.y).toBeCloseTo(e.y-8+(dx*Math.sin(.2)+dy*Math.cos(.2))*.9);
    e.syrupTarget=undefined;expect(syrupDrop(e,1,pose,false)).toBeNull();
    const bowl=game.spawnEnemy('bowl',{x:300,y:300});bowl.syrupTarget={x:1,y:2};bowl.shotWarnUntil=2;
    expect(syrupDrop(bowl,1,pose,false)).toBeNull();
  });
  it('bridges interpolated time across impact and fades the landing splash',()=>{
    const game=new Game(9),e=game.spawnEnemy('eliteSesame',{x:400,y:350});e.spawnAt=-10;
    e.syrupTarget={x:730,y:420};e.syrupImpactAt=3;e.shotWarnUntil=0;
    const pose={lift:0,scaleX:1,scaleY:1,tilt:0};
    expect(syrupLanding(e,2.995,false)).toMatchObject({stage:'warn',deadline:3});
    expect(syrupDrop(e,2.995,pose,false)).not.toBeNull();
    expect(enemyWarnings(e,2.995)).toHaveLength(1);expect(enemyWarnings(e,2.995)[0].live).toBe(false);
    expect(syrupDrop(e,3,pose,false)).toBeNull();
    const start=syrupLanding(e,3,false)!;expect(start.stage).toBe('impact');
    if(start.stage==='impact'){expect(start.radius).toBeCloseTo(CONFIG.elites.sesame.radius*.28);expect(start.alpha).toBe(1);}
    expect(enemyWarnings(e,3.005)[0].live).toBe(true);
    expect(enemyWarnings(e,3.03)).toEqual([]);
    const quiet=syrupLanding(e,3.16,true)!;expect(quiet.stage).toBe('impact');
    if(quiet.stage==='impact'){expect(quiet.radius).toBeCloseTo(CONFIG.elites.sesame.radius*.94);expect(quiet.alpha).toBeCloseTo(.5**.75);}
    expect(syrupLanding(e,3+CONFIG.elites.sesame.fade+.001,false)).toBeNull();
  });
});
