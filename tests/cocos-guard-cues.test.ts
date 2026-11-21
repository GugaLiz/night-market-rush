import {describe,expect,it} from 'vitest';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import type {Enemy,GuardMark,GuardShape} from '../cocos/assets/scripts/domain/shared/types';
import {guardCues,guardIngredient} from '../cocos/assets/scripts/presentation/guard-cue-model';

const full={quality:'standard',reduceMotion:false} as const;
function guard(kind:Enemy['kind'],shape:GuardShape,extra:Partial<GuardMark>={}):Enemy {
  const enemy=new Game(5).spawnEnemy(kind,{x:400,y:350});enemy.spawnAt=-10;
  enemy.guardCast={name:'test',startsAt:2,endsAt:4,marks:[{shape,warnAt:2,hitAt:3,endAt:4,damage:20,...extra}]};
  return enemy;
}
describe('guard warning details',()=>{
  it('uses the original per-enemy ingredient families',()=>{
    expect(guardIngredient('epicPearl')).toBe('bead');expect(guardIngredient('eliteTanghulu')).toBe('bead');
    expect(guardIngredient('epicSteamer')).toBe('steam');expect(guardIngredient('epicHotpot')).toBe('steam');
    expect(guardIngredient('eliteLotus')).toBe('lotus');expect(guardIngredient('epicDragon')).toBe('chevron');
  });
  it('moves the lane accents with warning progress and retains reduced-motion placement',()=>{
    const e=guard('eliteSkewer',{kind:'lane',from:{x:100,y:200},to:{x:440,y:200},radius:20});
    const early=guardCues(e,2,full),late=guardCues(e,2.9,full);
    expect(early).toHaveLength(4);expect(late).toHaveLength(4);
    expect(late[0].x).toBeGreaterThan(early[0].x);
    expect(early.every(c=>c.kind==='ingredient'&&c.y===200&&c.angle===0)).toBe(true);
    expect(guardCues(e,2.1,{quality:'standard',reduceMotion:true})).toEqual(guardCues(e,2.9,{quality:'standard',reduceMotion:true}));
    expect(guardCues(e,2.5,{quality:'simple',reduceMotion:false})).toEqual([]);
    expect(guardCues(e,1.9,full)).toEqual([]);expect(guardCues(e,3,full)).toEqual([]);
  });
  it('places radial cues within the damaging ring, never in its safe middle',()=>{
    const shape:GuardShape={kind:'ring',center:{x:600,y:400},inner:66,radius:152};
    const cues=guardCues(guard('eliteLotus',shape),2.5,full);
    expect(cues).toHaveLength(6);
    for(const cue of cues){const d=Math.hypot(cue.x-600,cue.y-400);expect(d).toBeGreaterThan(66+10);expect(d).toBeLessThan(152-10);}
    expect(cues.every(c=>c.kind==='ingredient'&&c.ingredient==='lotus')).toBe(true);
  });
  it('keeps summon baskets distinct through warning and live phases, even in simple mode',()=>{
    const e=guard('epicSteamer',{kind:'disc',center:{x:700,y:400},radius:40,inner:0},{summon:'bun'});
    const expected=[{kind:'basket',x:700,y:400}];
    for(const time of [2,2.5,3,3.9])expect(guardCues(e,time,{quality:'simple',reduceMotion:true})).toEqual(expected);
    expect(guardCues(e,4,full)).toEqual([]);
  });
  it('uses the active guarded marks only and leaves unrelated enemies alone',()=>{
    const e=guard('epicDragon',{kind:'fan',center:{x:500,y:350},angle:0,halfAngle:.5,radius:100});
    expect(guardCues(e,2.5,full)).toHaveLength(3);
    e.spawnAt=2.4;expect(guardCues(e,2.5,full)).toEqual([]);
    e.kind='bun';e.spawnAt=-10;expect(guardCues(e,2.5,full)).toEqual([]);
  });
});
