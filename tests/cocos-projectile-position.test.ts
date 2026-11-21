import {describe,expect,it} from 'vitest';
import type {Projectile} from '../cocos/assets/scripts/domain/shared/types';
import {projectilePosition} from '../cocos/assets/scripts/presentation/projectile-position';

const shot=(changes:Partial<Projectile>={}):Projectile=>({
  id:1,attackId:7,kind:'tray',x:100,y:100,px:100,py:100,vx:1,vy:0,radius:5,
  originX:100,originY:100,targetX:300,targetY:100,bornAt:0,expiresAt:5,
  travelled:0,maxDistance:200,phase:'out',hitIds:[],phaseHitIds:[],targetId:0,retargets:0,nextHitAt:0,hits:0,...changes,
});

describe('Cocos projectile presentation',()=>{
  it('starts at the captured glove and converges to simulation without mutation',()=>{
    const q=shot(),before=structuredClone(q),launch={id:7,point:{x:115,y:72}};
    expect(projectilePosition(q,0,{x:100,y:100},launch,null)).toEqual(launch.point);
    expect(projectilePosition({...q,x:250,travelled:150},1,{x:100,y:100},launch,null)).toEqual({x:250,y:82});
    expect(q).toEqual(before);
  });
  it('does not attach shots belonging to another attack',()=>{
    expect(projectilePosition(shot(),0,{x:100,y:100},{id:8,point:{x:115,y:72}},null)).toEqual({x:100,y:82});
  });
  it('brings a returning tray smoothly to the current glove',()=>{
    const hand={x:110,y:65},player={x:100,y:100};
    expect(projectilePosition(shot({phase:'return'}),1,player,null,hand)).toEqual(hand);
    expect(projectilePosition(shot({phase:'return',x:195}),1,player,null,hand)).toEqual({x:195,y:82});
    expect(projectilePosition(shot({phase:'return',x:147.5}),1,player,null,hand)).toEqual({x:152.5,y:73.5});
  });
  it('eases a lunchbox flight to its path over 0.65 seconds',()=>{
    const q=shot({kind:'lunchbox',phase:'flight'}),launch={id:7,point:{x:120,y:60}};
    expect(projectilePosition(q,0,{x:100,y:100},launch,null)).toEqual(launch.point);
    expect(projectilePosition(q,.65,{x:100,y:100},launch,null)).toEqual({x:100,y:72});
  });
});
