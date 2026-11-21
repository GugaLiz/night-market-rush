import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {skillPulse,type PulseUse} from '../cocos/assets/scripts/presentation/skill-pulse-model';

const use=(kind:PulseUse['kind']):PulseUse=>({type:'skill',kind,x:100,y:200,time:5,facing:{x:1,y:0}});

describe('skill activation pulses',()=>{
  it('uses the soda hit radius and original .42 second outward timing',()=>{
    expect(skillPulse(use('soda'),4.99,false,false)).toBeNull();
    expect(skillPulse(use('soda'),5,false,false)).toMatchObject({kind:'soda',x:100,y:200,radius:14,count:6});
    expect(skillPulse(use('soda'),5.42,false,false)?.radius).toBeCloseTo(CONFIG.skills.soda.radius);
    expect(skillPulse(use('soda'),6.09,false,false)).toBeNull();
  });
  it('delays the bell pulse and keeps full range in reduced motion',()=>{
    expect(skillPulse(use('bell'),5.079,false,false)).toBeNull();
    expect(skillPulse(use('bell'),5.081,true,true)).toMatchObject({kind:'bell',radius:CONFIG.skills.bell.radius,count:4});
    expect(skillPulse(use('bell'),6.25,false,false)).toBeNull();
  });
  it('expands the dispatch broadcast and applies separate simple quality',()=>{
    expect(skillPulse(use('dispatch'),5,false,false)).toMatchObject({kind:'dispatch',radius:22,count:6});
    expect(skillPulse(use('dispatch'),5.4,false,false)?.radius).toBeCloseTo(CONFIG.skills.dispatch.radius);
    expect(skillPulse(use('dispatch'),5,true,true)).toMatchObject({radius:CONFIG.skills.dispatch.radius,count:4});
    expect(skillPulse(use('dispatch'),6.121,false,false)).toBeNull();
    expect(skillPulse(use('fan'),5.1,false,false)).toBeNull();
  });
});
