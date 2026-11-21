import {describe,expect,it,vi} from 'vitest';
import {HapticsSession,type HapticsHost} from '../cocos/assets/scripts/runtime/haptics-session';
import {createBrowserHapticsHost} from '../cocos/assets/scripts/runtime/browser-haptics';
import {skillCameraOffset as cocosCamera} from '../cocos/assets/scripts/presentation/skill-camera';
import {skillCameraOffset as webCamera} from '../src/render/skill-camera';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';

const turn:GameEvent={type:'ultimateBeat',kind:'express',beat:1,x:0,y:0};
const berry:GameEvent={type:'ultimateBeat',kind:'berry',beat:0,x:0,y:0};
const final:GameEvent={type:'ultimateBeat',kind:'express',beat:12,x:0,y:0};

describe('shared platform feedback',()=>{
  it('shares camera computation with the old web renderer',()=>expect(cocosCamera).toBe(webCamera));
  it('does not let a lighter pulse replace a stronger pulse and stops on interruption',()=>{
    let now=1000,available=true,interrupt=()=>{};
    const vibrate=vi.fn(()=>true),unsubscribe=vi.fn();
    const host:HapticsHost={isAvailable:()=>available,now:()=>now,vibrate,onInterrupt:cb=>{interrupt=cb;return unsubscribe;}};
    const session=new HapticsSession(host);
    session.play([turn,berry]);expect(vibrate).toHaveBeenCalledWith([75,30,35]);
    session.play([turn]);expect(vibrate).toHaveBeenCalledTimes(1);
    session.play([final]);expect(vibrate).toHaveBeenLastCalledWith([55,28,75]);
    interrupt();expect(vibrate).toHaveBeenLastCalledWith(0);
    available=false;now+=1000;session.play([turn]);expect(vibrate).toHaveBeenCalledTimes(3);
    session.dispose();session.dispose();expect(unsubscribe).toHaveBeenCalledTimes(1);expect(session.available).toBe(false);
  });
  it('does not reserve a pulse after a rejected or throwing host call',()=>{
    let attempt=0;const vibrate=vi.fn(()=>{attempt++;if(attempt===1)return false;if(attempt===2)throw new Error('blocked');return true;});
    const session=new HapticsSession({isAvailable:()=>true,now:()=>1000,vibrate});
    session.play([berry]);session.play([berry]);session.play([turn]);
    expect(vibrate).toHaveBeenCalledTimes(3);expect(vibrate).toHaveBeenLastCalledWith([18]);
    session.dispose();expect(vibrate).toHaveBeenLastCalledWith(0);
  });
  it('stays safe when browser APIs are absent or the page is hidden',()=>{
    vi.stubGlobal('navigator',undefined);vi.stubGlobal('document',undefined);
    try{
      const session=new HapticsSession(createBrowserHapticsHost());
      expect(session.available).toBe(false);expect(()=>session.play([berry])).not.toThrow();session.dispose();
    }finally{vi.unstubAllGlobals();}
    const vibrate=vi.fn(()=>true);vi.stubGlobal('navigator',{vibrate,userActivation:{hasBeenActive:true}});
    vi.stubGlobal('document',{hidden:true});
    try{
      const session=new HapticsSession(createBrowserHapticsHost());session.play([berry]);
      expect(vibrate).not.toHaveBeenCalled();session.dispose();
    }finally{vi.unstubAllGlobals();}
  });
  it('cancels an active browser pulse on hide and detaches its lifecycle listeners',()=>{
    const documentTarget=Object.assign(new EventTarget(),{hidden:false});
    const windowTarget=new EventTarget(),vibrate=vi.fn(()=>true);
    vi.stubGlobal('document',documentTarget);vi.stubGlobal('window',windowTarget);
    vi.stubGlobal('navigator',{vibrate,userActivation:{hasBeenActive:true}});
    try{
      const session=new HapticsSession(createBrowserHapticsHost());
      session.play([berry]);expect(vibrate).toHaveBeenCalledTimes(1);
      documentTarget.hidden=true;documentTarget.dispatchEvent(new Event('visibilitychange'));
      expect(vibrate).toHaveBeenLastCalledWith(0);
      session.play([turn]);expect(vibrate).toHaveBeenCalledTimes(2);
      session.dispose();windowTarget.dispatchEvent(new Event('blur'));
      expect(vibrate).toHaveBeenCalledTimes(2);
    }finally{vi.unstubAllGlobals();}
  });
});
