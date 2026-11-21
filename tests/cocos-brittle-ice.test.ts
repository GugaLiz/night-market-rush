import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import type {Enemy,Settings} from '../cocos/assets/scripts/domain/shared/types';
import {brittleIceVisual} from '../cocos/assets/scripts/presentation/brittle-ice-model';

const enemy=(patch:Partial<Enemy>={}):Enemy=>({id:1,kind:'bun',x:30,y:60,hp:10,spawnAt:0,frostUntil:4,...patch} as Enemy);
const standard={quality:'standard',reduceMotion:false} satisfies Pick<Settings,'quality'|'reduceMotion'>;
describe('frost upgrade target indicator',()=>{
  it('requires active frost and a live, spawned, grounded target with the frost upgrade',()=>{
    const time=1;
    expect(brittleIceVisual(enemy(),time,'frost',standard)).toMatchObject({x:30,y:60,remaining:3});
    expect(brittleIceVisual(enemy(),time,null,standard)).toBeNull();
    expect(brittleIceVisual(enemy(),time,'brine',standard)).toBeNull();
    expect(brittleIceVisual(enemy({frostUntil:time,chilledUntil:4}),time,'frost',standard)).toBeNull();
    expect(brittleIceVisual(enemy({frostUntil:undefined,chilledUntil:4}),time,'frost',standard)).toBeNull();
    expect(brittleIceVisual(enemy({hp:0}),time,'frost',standard)).toBeNull();
    expect(brittleIceVisual(enemy({spawnAt:time-CONFIG.spawn.warning+.001}),time,'frost',standard)).toBeNull();
    expect(brittleIceVisual(enemy({jump:{phase:'flight'} as Enemy['jump']}),time,'frost',standard)).toBeNull();
  });
  it('keeps the cue present in simple and reduced-motion modes with a stable sheen',()=>{
    expect(brittleIceVisual(enemy(),1,'frost',{quality:'simple',reduceMotion:true})).toMatchObject({detail:false,sheen:.65});
    expect(brittleIceVisual(enemy(),2,'frost',{quality:'simple',reduceMotion:true})).toMatchObject({detail:false,sheen:.65});
    expect(brittleIceVisual(enemy(),1,'frost',standard)?.detail).toBe(true);
  });
});
