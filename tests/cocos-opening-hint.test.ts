import {describe,expect,it} from 'vitest';
import {openingHint} from '../cocos/assets/scripts/ui/opening-hint';

describe('first-battle control hint',()=>{
  it('names actual desktop movement and retains the shared pickup guidance',()=>{
    const hint=openingHint('joystick',false);
    expect(hint).toMatch(/方向键|WASD/);
    expect(hint).toContain('青色泡');expect(hint).toContain('金箱');
    expect(hint).not.toContain('倾斜设备');
  });
  it('names touch joystick for touch-first devices',()=>{
    const hint=openingHint('joystick',true);
    expect(hint).toContain('拖动摇杆');expect(hint).toContain('青色泡');expect(hint).toContain('金箱');
    expect(hint).not.toContain('倾斜设备');
  });
  it('uses tilt instructions in tilt mode regardless of the primary pointer',()=>{
    for(const coarse of [false,true]){
      const hint=openingHint('tilt',coarse);
      expect(hint).toContain('倾斜设备');expect(hint).toContain('青色泡');expect(hint).toContain('金箱');
    }
  });
});

