import {describe,expect,it} from 'vitest';
import {CuePolicy} from '../cocos/assets/scripts/audio/cue-policy';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';

describe('Cocos audio event policy',()=>{
  it('keeps consecutive weapon contacts distinguishable but bounds a dense attack',()=>{
    const policy=new CuePolicy();policy.setScene('play');
    const hit:GameEvent={type:'damage',id:1,victimId:8,source:'tongs',amount:10,nominal:10,x:0,y:0,time:4,attackId:9};
    const cues=[policy.select(hit,20),policy.select(hit,20),policy.select(hit,20)];
    expect(cues.map(cue=>cue?.name)).toEqual(['impact_tongs','impact_tongs_2','impact_tongs_3']);
    expect(cues[1]!.delay).toBeGreaterThan(0);expect(cues[2]!.delay).toBeGreaterThan(cues[1]!.delay!);
    expect(policy.select(hit,20)).toBeNull();
  });

  it('throttles coin bursts, advances their chime, and restarts after a gap',()=>{
    const policy=new CuePolicy();policy.setScene('play');
    const coin:GameEvent={type:'coin',amount:1,x:0,y:0};
    expect(policy.select(coin,10)?.name).toBe('coin_0');
    expect(policy.select(coin,10.03)).toBeNull();
    expect(policy.select(coin,10.1)?.name).toBe('coin_1');
    expect(policy.select(coin,11)?.name).toBe('coin_0');
  });

  it('prioritizes skill sounds and only schedules battle events while playing',()=>{
    const policy=new CuePolicy();policy.setScene('play');
    const skill:GameEvent={type:'skill',kind:'fan',x:0,y:0,time:0,facing:{x:1,y:0}};
    expect(policy.select(skill,2)).toMatchObject({name:'skill_fan',group:'skill',duck:true});
    expect(policy.select(skill,2.03)).toBeNull();
    policy.setScene('paused');
    expect(policy.select({type:'attack',kind:'tongs',id:1,x:0,y:0,angle:0},3)).toBeNull();
    expect(policy.select('ui',3)?.name).toBe('ui');
    policy.setScene('silent');expect(policy.select('ui',4)).toBeNull();
  });
});
