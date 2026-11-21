import {describe,expect,it} from 'vitest';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {giantPulseContact,giantPulseLifetime,giantPulseRadius} from '../cocos/assets/scripts/domain/core/giant-bun';
import type {GiantPulse} from '../cocos/assets/scripts/domain/shared/types';
import {giantPulseVisual} from '../cocos/assets/scripts/presentation/giant-pulse-model';

const pulse=(hop:1|2|3):GiantPulse=>({id:1,ownerId:2,hop,x:600,y:400,bornAt:5,reach:hop===3?600:CONFIG.giant.stompRadius,gapAngle:.7,spent:false});

describe('giant boss warning geometry',()=>{
  it('shows the third landing wave at its actual radius and collision width, with the real safe wedge',()=>{
    const wave=pulse(3),time=wave.bornAt+.3,v=giantPulseVisual(wave,time)!;
    expect(v.radius).toBeCloseTo(giantPulseRadius(wave,time));
    expect(v.inner).toBeCloseTo(v.radius-CONFIG.giant.pulseHalfWidth);
    expect(v.outer).toBeCloseTo(v.radius+CONFIG.giant.pulseHalfWidth);
    expect(v.start).toBeCloseTo(wave.gapAngle+CONFIG.giant.gapHalfAngle);
    expect(v.end).toBeCloseTo(wave.gapAngle+2*Math.PI-CONFIG.giant.gapHalfAngle);
    const p=new Game(7).state.player;p.radius=0;
    const place=(angle:number)=>{p.x=p.px=wave.x+Math.cos(angle)*v.radius;p.y=p.py=wave.y+Math.sin(angle)*v.radius;};
    place(wave.gapAngle);expect(giantPulseContact(wave,p,time,0)).toBeNull();
    place(wave.gapAngle+CONFIG.giant.gapHalfAngle+.01);expect(giantPulseContact(wave,p,time,0)).not.toBeNull();
  });

  it('keeps the first two danger discs only for the real damage interval, then shows a harmless print',()=>{
    for(const hop of [1,2] as const){
      const wave=pulse(hop),during=giantPulseVisual(wave,wave.bornAt+.1)!,after=giantPulseVisual(wave,wave.bornAt+CONFIG.giant.localDuration+.01)!;
      expect(during.danger).toBe(true);expect(during.outer).toBe(CONFIG.giant.stompRadius);
      expect(after.danger).toBe(false);expect(after.printAlpha).toBeGreaterThan(0);
      const p=new Game(7).state.player;p.x=p.px=wave.x;p.y=p.py=wave.y;
      expect(giantPulseContact(wave,p,wave.bornAt+.1,0)).not.toBeNull();
      expect(giantPulseContact(wave,p,wave.bornAt+CONFIG.giant.localDuration+.01,0)).toBeNull();
      expect(giantPulseVisual(wave,wave.bornAt+giantPulseLifetime(wave)+.01)).toBeNull();
    }
  });
});
