import {describe,expect,it} from 'vitest';
import {chopstickFlight} from '../cocos/assets/scripts/presentation/chopstick-flight-model';

describe('flying bamboo chopsticks',()=>{
  it('unfolds paired sticks and paper sleeve from the hand',()=>{
    expect(chopstickFlight(0,3,false)).toMatchObject({spread:0,size:.45,length:0,leaf:false});
    const mid=chopstickFlight(42.5,3,false);
    expect(mid.spread).toBeCloseTo(.5);expect(mid.size).toBeCloseTo(.725);expect(mid.length).toBeCloseTo(24.65);
    const far=chopstickFlight(200,3,false);expect(far).toMatchObject({spread:1,size:1,length:68,leaf:true});
    expect(far.crest).toBeCloseTo(Math.sin(200*.042+3*1.8)*5);
  });
  it('keeps a shorter still sleeve and no leaf in simple or reduced motion',()=>{
    const far=chopstickFlight(200,3,true);
    expect(far).toMatchObject({spread:1,size:1,length:38,crest:2,leaf:false});
    expect(chopstickFlight(-2,3,false)).toMatchObject({spread:0,size:.45,length:0});
  });
});
