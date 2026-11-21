import {afterEach,describe,expect,it,vi} from 'vitest';
import {BrowserMotionInput} from '../cocos/assets/scripts/runtime/browser-motion';
import {DEFAULT_SETTINGS} from '../cocos/assets/scripts/domain/shared/types';

afterEach(()=>vi.unstubAllGlobals());
describe('Cocos browser motion adapter',()=>{
  it('calibrates fresh samples, follows reversal and pauses once if samples stop',async()=>{
    const windowTarget=new EventTarget();vi.stubGlobal('window',windowTarget);
    vi.stubGlobal('screen',{orientation:{angle:0}});vi.stubGlobal('DeviceOrientationEvent',class {});
    let clock=100;const unavailable=vi.fn();
    const motion=new BrowserMotionInput(unavailable,()=>clock);
    const sample=(gamma:number,beta:number)=>windowTarget.dispatchEvent(Object.assign(new Event('deviceorientation'),{gamma,beta}));
    try {
      const pending=motion.request();sample(0,0);expect(await pending).toBe(true);
      expect(motion.calibrate()).toBe(true);motion.setSettings({...DEFAULT_SETTINGS,mode:'tilt'});motion.setEnabled(true);
      sample(6,1.5);clock+=100;const east=motion.getVector();
      expect(east.x).toBeGreaterThan(0);expect(east.y/east.x).toBeCloseTo(.25);
      sample(-6,-1.5);clock+=17;expect(motion.getVector().x).toBeLessThan(0);
      clock+=1600;expect(motion.getVector()).toEqual({x:0,y:0});motion.getVector();
      await Promise.resolve();expect(unavailable).toHaveBeenCalledTimes(1);
    }finally{motion.dispose();}
  });

  it('invalidates calibration when the device rotates',async()=>{
    const windowTarget=new EventTarget();vi.stubGlobal('window',windowTarget);
    vi.stubGlobal('screen',{orientation:{angle:0}});vi.stubGlobal('DeviceOrientationEvent',class {});
    const unavailable=vi.fn(),motion=new BrowserMotionInput(unavailable,()=>100);
    try {
      const pending=motion.request();windowTarget.dispatchEvent(Object.assign(new Event('deviceorientation'),{gamma:0,beta:0}));
      expect(await pending).toBe(true);expect(motion.calibrate()).toBe(true);
      motion.setSettings({...DEFAULT_SETTINGS,mode:'tilt'});motion.setEnabled(true);
      windowTarget.dispatchEvent(new Event('orientationchange'));expect(unavailable).toHaveBeenCalledTimes(1);
    }finally{motion.dispose();}
  });
});
