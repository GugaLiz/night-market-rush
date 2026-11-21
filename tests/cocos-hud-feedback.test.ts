import {describe,expect,it} from 'vitest';
import {HudCombatFeedback} from '../cocos/assets/scripts/ui/hud-combat-feedback';

describe('HUD combat feedback',()=>{
  it('shows a short burst for at least four kills inside the original time window',()=>{
    const tally=new HudCombatFeedback();tally.update(0,0,false);
    tally.update(1,1,false);tally.update(2,1.1,false);tally.update(3,1.2,false);
    expect(tally.update(4,1.3,false).burstLabel).toBe('瞬间击败 4');
    expect(tally.update(4,2.14,false).burstLabel).toBe('瞬间击败 4');
    expect(tally.update(4,2.16,false).burstLabel).toBe('');
  });
  it('starts a new cluster after 0.35 seconds and resets on a new run',()=>{
    const tally=new HudCombatFeedback();tally.update(0,0,false);
    tally.update(2,1,false);expect(tally.update(4,1.36,false).burstLabel).toBe('');
    expect(tally.update(6,1.4,false).burstLabel).toBe('瞬间击败 4');
    expect(tally.update(0,0,false).burstLabel).toBe('');
    expect(tally.update(1,.1,false).burstLabel).toBe('');
  });
  it('suppresses numerical pulse under reduced motion without suppressing burst text',()=>{
    const tally=new HudCombatFeedback();tally.update(0,0,true);
    const result=tally.update(4,1,true);
    expect(result.burstLabel).toBe('瞬间击败 4');expect(result.pulse).toBe(1);
  });
});
