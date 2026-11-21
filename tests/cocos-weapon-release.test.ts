import {describe,expect,it} from 'vitest';
import type {WeaponAttack} from '../cocos/assets/scripts/domain/shared/types';
import {meleeReleasePose,rangedReleasePose,type RangedRelease} from '../cocos/assets/scripts/presentation/weapon-release-model';

const attack=(kind:WeaponAttack['kind']='bag'):WeaponAttack=>({id:8,kind,phase:'active',startedAt:1,releaseAt:1.1,endsAt:1.3,angle:0,targetId:-1,hitIds:[],blocked:false});

describe('weapon release presentation',()=>{
  it('uses only the fixed ranged hand anchor belonging to the same attack',()=>{
    const event:RangedRelease={id:8,kind:'bag',angle:.5,bornAt:1.1},anchor={id:8,point:{x:100,y:70}},state=attack();
    expect(rangedReleasePose(event,1.099,state,anchor)).toBeNull();
    expect(rangedReleasePose(event,1.15,state,{id:9,point:{x:9,y:9}})).toBeNull();
    expect(rangedReleasePose(event,1.15,{...state,id:9},anchor)).toBeNull();
    expect(rangedReleasePose(event,1.15,state,null)).toBeNull();
    expect(rangedReleasePose(event,1.15,state,anchor)).toMatchObject({kind:'bag',point:{x:100,y:70},angle:.5});
    expect(rangedReleasePose(event,1.281,state,anchor)).toBeNull();
  });
  it('tracks a melee tip only during its own active swing',()=>{
    const state=attack('tongs'),first={id:8,point:{x:50,y:80},angle:.3,progress:.2};
    expect(meleeReleasePose(state,1.099,first)).toBeNull();
    expect(meleeReleasePose({...state,phase:'recovery'},1.15,first)).toBeNull();
    expect(meleeReleasePose(state,1.15,{...first,id:9})).toBeNull();
    expect(meleeReleasePose(attack('bag'),1.15,first)).toBeNull();
    expect(meleeReleasePose(state,1.15,first)).toMatchObject({kind:'tongs',point:{x:50,y:80},angle:.3,progress:.2});
    const next={id:8,point:{x:70,y:90},angle:.9,progress:.6};
    expect(meleeReleasePose(state,1.2,next)).toMatchObject({point:{x:70,y:90},angle:.9,progress:.6});
  });
});
