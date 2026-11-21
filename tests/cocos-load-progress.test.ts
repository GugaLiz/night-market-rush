import {describe,expect,it} from 'vitest';
import {LoadProgress} from '../cocos/assets/scripts/runtime/load-progress';

describe('asset load attempts',()=>{
  it('reports completed resources and ignores pending successes after failure',()=>{
    const progress=new LoadProgress(),first=progress.begin(4);
    expect(progress.advance(first)).toBe(.25);
    expect(progress.advance(first)).toBe(.5);
    expect(progress.invalidate(first)).toBe(true);
    expect(progress.advance(first)).toBeNull();
    const retry=progress.begin(2);
    expect(progress.advance(first)).toBeNull();
    expect(progress.invalidate(first)).toBe(false);
    expect(progress.advance(retry)).toBe(.5);
    expect(progress.advance(retry)).toBe(1);
  });
  it('prevents completions from touching a destroyed view',()=>{
    const progress=new LoadProgress(),attempt=progress.begin(1);
    progress.cancel();expect(progress.isCurrent(attempt)).toBe(false);
    expect(progress.advance(attempt)).toBeNull();
  });
});
