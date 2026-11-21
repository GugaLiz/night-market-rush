import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../cocos/assets/scripts/domain/core/config';
import type {GiantJump} from '../cocos/assets/scripts/domain/shared/types';
import {giantJumpGuide} from '../cocos/assets/scripts/presentation/giant-jump-guide-model';

const jump=(hop:1|2|3,phase:GiantJump['phase']='warn'):GiantJump=>({
  hop,phase,startedAt:1,until:2,from:{x:300,y:350},target:{x:650,y:360},gapAngle:.7,
});

describe('giant jump safety guidance',()=>{
  it('shows the locked landing trajectory for each active hop but no safety wedge for the first two',()=>{
    for(const hop of [1,2,3] as const){
      const guide=giantJumpGuide(300,350,jump(hop))!;
      expect(guide.trajectory.length).toBeGreaterThan(0);
      expect(guide.trajectory[0].from).toEqual({x:300,y:350});
      if(hop!==3){expect(guide.edges).toEqual([]);expect(guide.arrows).toEqual([]);}
    }
    expect(giantJumpGuide(300,350,jump(3,'rest'))).toBeNull();
    expect(giantJumpGuide(300,350,null)).toBeNull();
  });
  it('places the two guides on the actual wedge boundaries and arrows along its safe center',()=>{
    const j=jump(3),guide=giantJumpGuide(300,350,j)!,r=CONFIG.giant.stompRadius;
    expect(guide.edges.length).toBeGreaterThan(2);expect(guide.arrows).toHaveLength(4);
    for(const a of [j.gapAngle-CONFIG.giant.gapHalfAngle,j.gapAngle+CONFIG.giant.gapHalfAngle]){
      const p={x:j.target.x+Math.cos(a)*r,y:j.target.y+Math.sin(a)*r};
      expect(guide.edges.some(s=>Math.hypot(s.from.x-p.x,s.from.y-p.y)<1e-6)).toBe(true);
    }
    for(const [i,offset] of [r+12,r+34].entries()){
      const tip=guide.arrows[i*2].to;
      expect(tip.x).toBeCloseTo(j.target.x+Math.cos(j.gapAngle)*offset);
      expect(tip.y).toBeCloseTo(j.target.y+Math.sin(j.gapAngle)*offset);
    }
  });
  it('clips decorative lines to the playable floor even at its edge',()=>{
    const j=jump(3);j.target={x:WORLD.bounds.left+10,y:WORLD.bounds.top+10};j.gapAngle=-Math.PI*.75;
    const guide=giantJumpGuide(110,130,j)!;
    for(const s of [...guide.trajectory,...guide.edges,...guide.arrows])for(const p of [s.from,s.to]){
      expect(p.x).toBeGreaterThanOrEqual(WORLD.bounds.left-1e-8);expect(p.x).toBeLessThanOrEqual(WORLD.bounds.right+1e-8);
      expect(p.y).toBeGreaterThanOrEqual(WORLD.bounds.top-1e-8);expect(p.y).toBeLessThanOrEqual(WORLD.bounds.bottom+1e-8);
    }
  });
});
