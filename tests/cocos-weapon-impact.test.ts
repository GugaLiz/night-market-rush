import {describe,expect,it} from 'vitest';
import {WEAPONS} from '../cocos/assets/scripts/domain/core/weapons';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';
import {isBrinedTray,lunchboxBlastRadius,WeaponImpactModel} from '../cocos/assets/scripts/presentation/weapon-impact-model';

describe('weapon hit cues',()=>{
  it('retains the actual blast location and collision radius only during its visible lifetime',()=>{
    const model=new WeaponImpactModel(),event:GameEvent={type:'detonation',x:470,y:260};
    model.add([event],4);
    expect(model.active(4)[0]).toMatchObject({type:'detonation',x:470,y:260,bornAt:4});
    expect(lunchboxBlastRadius()).toBe(WEAPONS.lunchbox.width);
    expect(model.active(4.429)).toHaveLength(1);
    expect(model.active(4.431)).toHaveLength(0);
  });
  it('preserves the chain source and target, ignores unrelated events and expires after the web duration',()=>{
    const model=new WeaponImpactModel();
    model.add([{type:'chainLink',fromX:10,fromY:20,x:90,y:60},{type:'dash',x:3,y:5,angle:0}],5);
    expect(model.active(5.1)).toMatchObject([{type:'chainLink',fromX:10,fromY:20,x:90,y:60}]);
    expect(model.active(5.191)).toHaveLength(0);
    model.add([{type:'detonation',x:1,y:2}],6);model.reset();expect(model.active(6)).toHaveLength(0);
  });
  it('marks only trays explicitly coated by the poison upgrade',()=>{
    expect(isBrinedTray({kind:'tray',brined:true})).toBe(true);
    expect(isBrinedTray({kind:'tray',brined:false})).toBe(false);
    expect(isBrinedTray({kind:'spirit',brined:true})).toBe(false);
  });
  it('preserves the source material, side and lifetime of player contact without repeating burst hits',()=>{
    const model=new WeaponImpactModel();
    const damage=(source:'bun'|'onigiri'|'siumai'|'zongzi'|'box'|'bowl'|'dash'|'eliteCrab',victimId=0,burstIndex=1):GameEvent=>
      ({type:'damage',id:7,victimId,source,amount:4,nominal:4,x:100,y:200,time:3,impactAngle:Math.PI/2,burstIndex});
    model.add([damage('bun'),damage('onigiri'),damage('siumai'),damage('zongzi'),damage('box'),damage('bowl'),damage('dash'),
      damage('bun',0,2),damage('bun',42),damage('eliteCrab')],3);
    const effects=model.active(3.1);
    expect(effects.map(e=>e.type==='snackImpact'?e.kind:null)).toEqual(['bun','onigiri','siumai','zongzi','box','bowl','box']);
    expect(effects[0]).toMatchObject({x:100,y:200,angle:Math.PI/2,bornAt:3,duration:.29});
    expect(model.active(3.291)).toHaveLength(0);
    model.add([damage('bun')],4);model.reset();expect(model.active(4)).toHaveLength(0);
  });
});
