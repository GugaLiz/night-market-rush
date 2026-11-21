import {describe,expect,it} from 'vitest';
import {deliveryUsePose,fanRotorAngle,iceShavings,pickupShell,USE_LIFETIME,type SkillUse} from '../cocos/assets/scripts/presentation/delivery-use-model';

const bag={x:100,y:80},hand={x:120,y:70},image={width:100,height:100};
const event=(changes:Partial<SkillUse>={}):SkillUse=>({type:'skill',kind:'bell',x:100,y:100,time:5,facing:{x:1,y:0},pickupFrom:{x:10,y:50},...changes});

describe('delivery use presentation',()=>{
  it('moves the pickup to the bag and then to the free hand without mutation',()=>{
    const use=event(),before=structuredClone(use);
    expect(deliveryUsePose(use,5,bag,hand,false,image)).toMatchObject({x:12,y:11,collect:0});
    const transfer=deliveryUsePose(use,5.1,bag,hand,false,image)!;
    expect(transfer.collect).toBeCloseTo(1);expect(transfer.x).toBeGreaterThan(bag.x);expect(transfer.x).toBeLessThan(hand.x);
    expect(deliveryUsePose(use,5.171,bag,hand,false,image)).toMatchObject({x:120,y:66,collect:1});
    expect(use).toEqual(before);
  });
  it('puts grounded props down and eventually removes the use and label',()=>{
    const use=event({kind:'lure',pickupFrom:undefined});
    expect(deliveryUsePose(use,5.38,bag,hand,false,image)).toMatchObject({x:121,y:94});
    expect(deliveryUsePose(use,5+USE_LIFETIME+.01,bag,hand,false,image)).toBeNull();
  });
  it('preserves the original fan and ultimate short handoff',()=>{
    expect(deliveryUsePose(event({kind:'fan'}),5.181,bag,hand,false,image)?.alpha).toBe(0);
    expect(deliveryUsePose(event({kind:'icebox'}),5.151,bag,hand,false,image)?.alpha).toBe(0);
  });
  it('retains the frost tool at its field during reduced motion',()=>{
    const field={id:1,kind:'frost' as const,x:400,y:300,radius:100,bornAt:5,releaseAt:6,expiresAt:7,released:false};
    const pose=deliveryUsePose(event({kind:'frost'}),5.3,bag,hand,true,image,field);
    expect(pose).toMatchObject({x:350,y:276,alpha:1,height:55});
  });
  it('fades ordinary pickup shell fragments and omits them in reduced motion',()=>{
    const use=event();
    expect(pickupShell(use,5,bag,false)).toMatchObject({kind:'burst',center:{x:10,y:11},radius:35,alpha:.75});
    const middle=pickupShell(use,5.08,bag,false);
    expect(middle?.kind).toBe('burst');if(middle?.kind==='burst'){expect(middle.radius).toBeCloseTo(38.85);expect(middle.alpha).toBeCloseTo(.375);}
    expect(pickupShell(use,5.161,bag,false)).toBeNull();expect(pickupShell(use,5,bag,true)).toBeNull();
  });
  it('draws the fan shell moving into the bag and closes its clasp',()=>{
    const fan=event({kind:'fan'}),start=pickupShell(fan,5,bag,false),settled=pickupShell(fan,5.101,bag,false);
    expect(start).toMatchObject({kind:'fan',center:{x:12,y:11},drawArcs:true,scaleX:1,scaleY:1});
    expect(settled).toMatchObject({kind:'fan',center:bag,drawArcs:false,close:1});
    expect(pickupShell(fan,5.221,bag,false)).toBeNull();
    expect(pickupShell(fan,5.05,bag,true)).toMatchObject({kind:'fan',center:{x:12,y:11},scaleX:1,scaleY:1,close:1});
    expect(pickupShell(event({pickupFrom:undefined}),5,bag,false)).toBeNull();
  });
  it('ramps fan rotation continuously to its running speed',()=>{
    expect(fanRotorAngle(-1)).toBe(0);expect(fanRotorAngle(0)).toBe(0);
    expect(fanRotorAngle(.11)).toBeCloseTo(.715);
    expect(fanRotorAngle(.22)).toBeCloseTo(2.2);
    expect(fanRotorAngle(1)-fanRotorAngle(.22)).toBeCloseTo(17*.78);
    expect(fanRotorAngle(.220001)-fanRotorAngle(.22)).toBeCloseTo(.000017);
  });
  it('emits curling shavings with the original timing and reduced-motion pose',()=>{
    expect(iceShavings(.21,false,false)).toEqual([]);
    const normal=iceShavings(.5,false,false),simple=iceShavings(.5,false,true);
    expect(normal.length).toBeGreaterThan(simple.length);expect(normal.length).toBeLessThanOrEqual(10);
    expect(normal.some(s=>s.side<0)).toBe(true);expect(normal.some(s=>s.side>0)).toBe(true);
    expect(iceShavings(1.3,false,false)).toEqual([]);
    const quiet=iceShavings(.5,true,false),later=iceShavings(1.3,true,false);
    expect(quiet).toHaveLength(10);expect(later).toHaveLength(10);
    expect(later.map(({dx,dy,angle})=>({dx,dy,angle}))).toEqual(quiet.map(({dx,dy,angle})=>({dx,dy,angle})));
    expect(quiet.every(s=>s.alpha>.9)).toBe(true);
  });
});
