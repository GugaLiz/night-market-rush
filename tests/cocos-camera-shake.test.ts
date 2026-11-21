import {describe,expect,it} from 'vitest';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';
import {CameraShakeModel} from '../cocos/assets/scripts/presentation/camera-shake-model';
import {skillCameraOffset} from '../cocos/assets/scripts/presentation/skill-camera';

const settings={shake:true,reduceMotion:false};
const damage=(victimId:number,source:'bun'|'fan'|'tongs',time=10,burstIndex=1):GameEvent=>
  ({type:'damage',id:1,victimId,source,amount:1,nominal:1,x:0,y:0,time,burstIndex});
const kill=(id:number,x:number,y:number):GameEvent=>({type:'kill',kind:'bun',victimId:id,x,y,points:1});
const game=()=>new Game(1);

describe('legacy camera shake model',()=>{
  it('matches player damage, weapon impact, burst filtering and failure amplitudes',()=>{
    const state=game().state;
    for(const [event,strength] of [[damage(0,'bun'),.14],[damage(2,'tongs'),.08],[damage(2,'tongs',10,2),0],
      [{type:'fail',kind:'bun',x:0,y:0} as GameEvent,.3]] as const){
      const model=new CameraShakeModel();model.events([event]);
      const result=model.frame(state,.016,'play',settings,1280,720);
      const remaining=Math.max(0,strength-.016);
      expect(result.dx).toBeCloseTo(Math.sin(.016*104)*remaining*8);
      expect(result.dy).toBeCloseTo(Math.cos(.016*127)*remaining*6);
    }
  });
  it('uses nearby defeats within the original time window and the last moving position',()=>{
    const state=game().state,model=new CameraShakeModel();state.player.x=600;state.player.y=400;state.player.vx=100;state.player.vy=0;
    model.frame(state,.02,'play',settings,1280,720);
    model.events([damage(1,'fan',10),kill(1,670,320),kill(2,680,320),kill(3,690,320)]);
    const result=model.frame(state,0,'play',settings,1280,720);
    const direction=Math.atan2(-80,80),power=.48+3*.045;
    expect(result.dx).toBeCloseTo(-Math.cos(direction)*power*8);
    expect(result.dy).toBeCloseTo(-Math.sin(direction)*power*8);
    expect(result.overscan).toBeCloseTo(1+Math.max(Math.abs(result.dx)/1280,Math.abs(result.dy)/720)*2);
  });
  it('does not retrigger a group impact within .28 seconds and expires the impact',()=>{
    const state=game().state,model=new CameraShakeModel();
    const batch=(time:number)=>[damage(1,'fan',time),kill(1,600,300),kill(2,610,300),kill(3,620,300)];
    model.events(batch(10));model.frame(state,.04,'play',settings,1280,720);
    model.events(batch(10.1));
    const value=model.frame(state,0,'play',settings,1280,720),kick=Math.cos(.04*79)*Math.exp(-.04*17)*(.48+3*.045)*8;
    expect(value.dx).toBeCloseTo(-Math.cos(-.65)*kick);
    expect(value.dy).toBeCloseTo(-Math.sin(-.65)*kick);
    for(let i=0;i<8;i++)model.frame(state,.05,'play',settings,1280,720);
    expect(model.frame(state,0,'play',settings,1280,720)).toEqual({dx:0,dy:0,overscan:1});
  });
  it('does not group distant or stale defeats',()=>{
    const state=game().state,model=new CameraShakeModel();
    model.events([damage(1,'fan',10),kill(1,400,300),kill(2,410,300),kill(3,900,300)]);
    expect(model.frame(state,0,'play',settings,1280,720)).toEqual({dx:0,dy:0,overscan:1});
    model.events([damage(4,'fan',10.16),kill(4,405,300)]);
    expect(model.frame(state,0,'play',settings,1280,720)).toEqual({dx:0,dy:0,overscan:1});
  });
  it('gives skill recoil priority and suppresses all movement for pause and reduced motion',()=>{
    const g=game(),model=new CameraShakeModel();g.triggerSkill('vortex');model.events([damage(0,'bun')]);
    const expected=skillCameraOffset(g.state)!;
    const actual=model.frame(g.state,.016,'play',settings,1280,720);
    expect(actual.dx).toBeCloseTo(expected.x);expect(actual.dy).toBeCloseTo(expected.y);
    expect(model.frame(g.state,1,'pause',settings,1280,720)).toEqual({dx:0,dy:0,overscan:1});
    expect(model.frame(g.state,.016,'play',{...settings,reduceMotion:true},1280,720)).toEqual({dx:0,dy:0,overscan:1});
    expect(model.frame(g.state,.016,'play',{...settings,shake:false},1280,720)).toEqual({dx:0,dy:0,overscan:1});
    model.reset();expect(model.frame(null,0,'home',settings,1280,720)).toEqual({dx:0,dy:0,overscan:1});
  });
});
