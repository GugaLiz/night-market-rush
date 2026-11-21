import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import type {Enemy,EnemyShot} from '../cocos/assets/scripts/domain/shared/types';
import {enemyRangedDetail,rangedToolPosition} from '../cocos/assets/scripts/presentation/enemy-ranged-detail-model';

const pose={lift:0,scaleX:1,scaleY:1,tilt:0};
const enemy=(kind:Enemy['kind'],extra:Partial<Enemy>={}):Enemy=>({id:7,kind,x:100,y:200,facing:1,hp:10,spawnAt:0,stunUntil:0,shotAngle:0,...extra} as Enemy);
const shot=(extra:Partial<EnemyShot>={}):EnemyShot=>({id:1,ownerId:7,kind:'tea',x:150,y:180,vx:100,vy:0,bornAt:5,...extra} as EnemyShot);
describe('ranged attack presentation model',()=>{
  it('shows bowl preparation and continuing volley, but not a normal or interrupted bowl',()=>{
    const bowl=enemy('bowl',{shotWarnUntil:5+CONFIG.ranged.warning});
    expect(enemyRangedDetail(bowl,5,[],pose,false)).toMatchObject({kind:'bowl',x:111,y:159,progress:0,rise:3});
    expect(enemyRangedDetail({...bowl,shotWarnUntil:0,volleyRemaining:2},5,[],pose,false)).toMatchObject({kind:'bowl',progress:1,rise:13});
    expect(enemyRangedDetail({...bowl,shotWarnUntil:0},5,[],pose,false)).toBeNull();
    expect(enemyRangedDetail({...bowl,stunUntil:6},5,[],pose,false)).toBeNull();
    expect(enemyRangedDetail({...bowl,frostUntil:6},5,[],pose,false)).toBeNull();
    expect(enemyRangedDetail({...bowl,hp:0},5,[],pose,false)).toBeNull();
    expect(enemyRangedDetail({...bowl,spawnAt:5},5,[],pose,false)).toBeNull();
  });
  it('attaches kettle steam to its posed spout and keeps reduced motion steady',()=>{
    const kettle=enemy('eliteKettle',{shotWarnUntil:5+CONFIG.elites.kettle.warning/2});
    const transformed={lift:8,scaleX:1.1,scaleY:.9,tilt:.2};
    const point=rangedToolPosition(kettle,transformed,.51,.64);
    expect(enemyRangedDetail(kettle,5,[],transformed,true)).toMatchObject({kind:'kettle-warning',...point,rise:6});
    const flipped=rangedToolPosition({...kettle,facing:-1},pose,.51,.64);
    expect(flipped.x).toBeLessThan(kettle.x);
    expect(rangedToolPosition(kettle,pose,.51,.64).x).toBeGreaterThan(kettle.x);
  });
  it('links only the matching pot and central fresh tea shot, then fades',()=>{
    const kettle=enemy('eliteKettle'),other=shot({ownerId:8}),side=shot({vy:70}),centre=shot();
    expect(enemyRangedDetail(kettle,5.13,[other,side,centre],pose,false)).toMatchObject({kind:'kettle-jet',targetX:150,targetY:180});
    const jet=enemyRangedDetail(kettle,5.13,[centre],pose,false);
    expect(jet?.kind==='kettle-jet'&&jet.alpha).toBeCloseTo(.5);
    expect(enemyRangedDetail(kettle,5.27,[centre],pose,false)).toBeNull();
    expect(enemyRangedDetail(kettle,5.13,[other,side],pose,false)).toBeNull();
    expect(enemyRangedDetail({...kettle,stunUntil:6},5.13,[centre],pose,false)).toBeNull();
  });
});
