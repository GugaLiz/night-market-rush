import {describe,expect,it} from 'vitest';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {skillFieldRadius} from '../cocos/assets/scripts/domain/core/skill-fields';
import type {SkillField} from '../cocos/assets/scripts/domain/shared/types';
import {skillFieldVisual} from '../cocos/assets/scripts/presentation/skill-field-model';

const field=(kind:'fire'|'blue',id=1):SkillField=>({kind,id,castId:1,x:400,y:350,radius:200,bornAt:5,expiresAt:8,hitIds:[]});
describe('visible skill field geometry',()=>{
  it('uses the collision radius at each time, including delayed outer fire',()=>{
    for(const f of [field('fire'),{...field('fire',2),bornAt:5.3}]){
      expect(skillFieldVisual(f,f.bornAt-.01)).toBeNull();
      for(const time of [f.bornAt,f.bornAt+.1,f.bornAt+.3,f.expiresAt-.001]){
        const v=skillFieldVisual(f,time)!;
        expect(v.radius).toBeCloseTo(skillFieldRadius(f,time));
        expect(v.remaining).toBeCloseTo(f.expiresAt-time);
      }
      expect(skillFieldVisual(f,f.expiresAt)).toBeNull();
    }
    expect(skillFieldVisual(field('fire'),5)!.radius).toBe(CONFIG.skills.fan.radius);
  });
  it('shows the entire slowdown pool immediately and until expiry',()=>{
    const f=field('blue');
    expect(skillFieldVisual(f,5)?.radius).toBe(f.radius);
    expect(skillFieldVisual(f,7.999)?.radius).toBe(f.radius);
    expect(skillFieldVisual(f,8)).toBeNull();
  });
});
