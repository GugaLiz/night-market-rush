import {describe,expect,it} from 'vitest';
import {DashGhostTimeline} from '../cocos/assets/scripts/presentation/dash-ghost-model';

describe('dash ghost timeline',()=>{
  it('captures at most three poses at the original 0.05 second spacing and fades over 0.17 seconds',()=>{
    const model=new DashGhostTimeline();
    expect(model.update(0,true,true,true).capture).toBe(0);
    expect(model.update(.04,true,true,true).capture).toBeNull();
    expect(model.update(.05,true,true,true).capture).toBe(1);
    expect(model.update(.10,true,true,true).capture).toBe(2);
    const next=model.update(.15,true,true,true);expect(next.capture).toBe(0);expect(next.ghosts).toHaveLength(3);
    expect(next.ghosts[0].alpha).toBeCloseTo(.36*(1-.1/.17),8);
    expect(model.update(.33,false,true,true).ghosts).toHaveLength(0);
  });
  it('keeps a frozen snapshot during pause, disables for simple or reduced motion, and resets across runs',()=>{
    const model=new DashGhostTimeline();model.update(5,true,true,true);
    const before=model.update(5.06,true,true,true);const paused=model.update(5.06,true,true,false);
    expect(paused.capture).toBeNull();expect(paused.ghosts).toEqual(before.ghosts);
    expect(model.update(5.07,true,false,true).ghosts).toHaveLength(0);
    expect(model.update(5.08,true,true,false).capture).toBeNull();
    expect(model.update(5.09,true,true,true).ghosts).toHaveLength(1);
    expect(model.update(0,false,true,true).ghosts).toHaveLength(0);
  });
});
