import {describe,expect,it} from 'vitest';
import {layoutTongs,tongsJawAngle} from '../cocos/assets/scripts/presentation/held-tongs-geometry';

describe('articulated courier tongs',()=>{
  it('aligns the painted grip and tip and splits around the original hinge',()=>{
    const width=225,height=236,reach=34,layout=layoutTongs(width,height,reach);
    const dx=(.78-.16)*width,dy=(.15-.83)*height,c=Math.cos(layout.imageAngle),s=Math.sin(layout.imageAngle);
    expect((dx*c+dy*s)*layout.scale).toBeCloseTo(reach,8);
    expect((-dx*s+dy*c)*layout.scale).toBeCloseTo(0,8);
    const [handle,upper,lower]=layout.segments;
    expect(layout.hinge).toBeCloseTo(reach*.33,8);
    expect(handle.right).toBe(layout.hinge);expect(upper.pivotX).toBe(layout.hinge);expect(lower.pivotX).toBe(layout.hinge);
    expect(upper.top).toBe(handle.top);expect(lower.bottom).toBe(handle.bottom);
    expect(upper.bottom).toBe(0);expect(lower.top).toBe(0);
    expect(upper.left).toBeLessThanOrEqual(handle.right);
    for(const segment of layout.segments){expect(segment.right-segment.left).toBeGreaterThan(0);expect(segment.bottom-segment.top).toBeGreaterThan(0);}
  });
  it('animates opposite jaws with original windup and release timing',()=>{
    expect(tongsJawAngle(null,0)).toBe(0);
    expect(tongsJawAngle('windup',0)).toBe(0);
    expect(tongsJawAngle('windup',1)).toBeCloseTo(.045,8);
    expect(tongsJawAngle('active',0)).toBeCloseTo(.04,8);
    expect(tongsJawAngle('active',1)).toBeCloseTo(-.024,8);
    expect(tongsJawAngle('recovery',.5)).toBe(0);
    expect(tongsJawAngle('active',-1)).toBeCloseTo(.04,8);
  });
  it('rejects degenerate image dimensions',()=>{
    expect(()=>layoutTongs(0,236,34)).toThrow();
    expect(()=>layoutTongs(225,236,0)).toThrow();
  });
});
