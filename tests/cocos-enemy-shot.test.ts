import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import type {EnemyShot} from '../cocos/assets/scripts/domain/shared/types';
import {enemyShotPoint,enemyShotVisual} from '../cocos/assets/scripts/presentation/enemy-shot-model';

const shot=(tea:boolean):EnemyShot=>({id:1,ownerId:2,...(tea?{kind:'tea' as const}:{}),
  x:400,y:300,px:390,py:300,vx:0,vy:100,radius:tea?CONFIG.elites.kettle.radius:CONFIG.ranged.radius,damage:8,bornAt:0,expiresAt:6});

describe('enemy projectile presentation',()=>{
  it('distinguishes tea and soup while preserving their actual hit radii and positions',()=>{
    const soup=shot(false),tea=shot(true),before=structuredClone(tea);
    const a=enemyShotVisual(soup),b=enemyShotVisual(tea);
    expect(a).toMatchObject({kind:'soup',radius:CONFIG.ranged.radius,x:400,y:300});
    expect(b).toMatchObject({kind:'tea',radius:CONFIG.elites.kettle.radius,x:400,y:300});
    expect(b.scale).toBeCloseTo(CONFIG.elites.kettle.radius/7);
    expect(tea).toEqual(before);
  });
  it('rotates the forward tip along the current projectile velocity',()=>{
    const s=shot(false),visual=enemyShotVisual(s),tip=enemyShotPoint(visual,10,0);
    expect(tip.x).toBeCloseTo(s.x);expect(tip.y).toBeCloseTo(s.y+10);
    s.vx=-100;s.vy=0;
    const reversed=enemyShotPoint(enemyShotVisual(s),10,0);
    expect(reversed.x).toBeCloseTo(s.x-10);expect(reversed.y).toBeCloseTo(s.y);
  });
});
