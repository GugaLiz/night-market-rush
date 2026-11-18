import {describe,it,expect,vi} from 'vitest';
import {WebStorage,SAVE_KEY,sanitizeSettings,type StorageLike} from '../src/platform/storage';
import {WebInput} from '../src/platform/input';
import {DEFAULT_SETTINGS,RULES_VERSION,type BestRecord} from '../src/shared/types';

class MemoryStore implements StorageLike {
  values=new Map<string,string>(); denied=false;
  getItem(key:string){if(this.denied)throw new Error('denied');return this.values.get(key)??null;}
  setItem(key:string,value:string){if(this.denied)throw new Error('quota');this.values.set(key,value);}
}
const record=(score:number,time=10,rulesVersion=RULES_VERSION):BestRecord=>({score,time,rulesVersion,date:'2026-11-18T00:00:00Z'});

describe('browser steering',()=>{
  it('reverses a long drag locally and restores held directions after overlapping keys and touch release',()=>{
    const browser=new EventTarget();
    class Surface extends EventTarget {
      private captured:number|null=null;
      closest(){return null;}
      getBoundingClientRect(){return {left:0,top:0,width:800,height:450};}
      setPointerCapture(id:number){this.captured=id;}
      hasPointerCapture(id:number){return this.captured===id;}
      releasePointerCapture(){this.captured=null;}
    }
    const surface=new Surface();
    vi.stubGlobal('window',browser);
    vi.stubGlobal('document',new EventTarget());
    vi.stubGlobal('Element',Surface);
    const input=new WebInput(surface as unknown as HTMLElement,()=>{});
    const pointer=(type:string,x:number)=>surface.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId:1,clientX:x,clientY:260,button:0}));
    const key=(type:string,code:string)=>browser.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code}));
    try{
      input.setEnabled(true);
      pointer('pointerdown',100);pointer('pointermove',290);
      expect(input.getVector().x).toBe(1);
      pointer('pointermove',260);
      expect(input.getVector().x).toBeLessThan(0);
      pointer('pointermove',227);
      expect(input.getVector().x).toBeLessThan(-.5);
      key('keydown','ArrowRight');key('keydown','ArrowLeft');
      expect(input.getVector().x).toBe(-1);
      pointer('pointerup',227);key('keyup','ArrowLeft');
      expect(input.getVector().x).toBe(1);
      key('keyup','ArrowRight');
      expect(input.getVector()).toEqual({x:0,y:0});
    }finally{input.dispose();vi.unstubAllGlobals();}
  });

  it('keeps shallow diagonals on calibrated tilt and responds to a deliberate reversal',async()=>{
    const browser=new EventTarget();
    vi.stubGlobal('window',browser);
    vi.stubGlobal('document',new EventTarget());
    vi.stubGlobal('screen',{orientation:{angle:0}});
    vi.stubGlobal('DeviceOrientationEvent',class {});
    let now=100;
    const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
    const tilt=(gamma:number,beta:number)=>browser.dispatchEvent(Object.assign(new Event('deviceorientation'),{gamma,beta}));
    const input=new WebInput(new EventTarget() as HTMLElement,()=>{});
    try{
      input.setSettings({...DEFAULT_SETTINGS,mode:'tilt'});input.setEnabled(true);
      tilt(0,0);
      expect(await input.requestTilt()).toBe(true);
      expect(input.calibrate()).toBe(true);
      tilt(6,1.5);now+=100;
      const east=input.getVector();
      expect(east.x).toBeGreaterThan(0);
      expect(east.y/east.x).toBeCloseTo(.25);
      tilt(-6,-1.5);now+=17;
      expect(input.getVector().x).toBeLessThan(0);
    }finally{input.dispose();clock.mockRestore();vi.unstubAllGlobals();}
  });
});

describe('browser storage boundary',()=>{
  it('imports V3 preferences and lets both versions keep independent records',()=>{
    const store=new MemoryStore(),legacyKey='night-market-rush.save.v1';
    const legacy={version:1,settings:{...DEFAULT_SETTINGS,hand:'right'},best:record(850,50,'night-market-3.0'),tutorialSeen:true};
    store.setItem(legacyKey,JSON.stringify(legacy));
    const v4=new WebStorage(store);
    expect(v4.load()).toMatchObject({settings:{hand:'right'},best:null,tutorialSeen:true});
    expect(v4.saveBest(record(19))).toBe(true);
    expect(JSON.parse(store.getItem(legacyKey)!)).toEqual(legacy);
    store.setItem(legacyKey,JSON.stringify({...legacy,best:record(999,90,'night-market-3.0')}));
    expect(new WebStorage(store).load().best?.score).toBe(19);
  });
  it('starts with independent valid defaults and persists settings',()=>{
    const store=new MemoryStore(),s=new WebStorage(store);const data=s.load();data.settings.music=1;
    expect(s.data.settings.music).toBe(DEFAULT_SETTINGS.music);
    expect(s.saveSettings({...DEFAULT_SETTINGS,hand:'right',muted:true})).toBe(true);
    expect(new WebStorage(store).load().settings).toMatchObject({hand:'right',muted:true});
  });
  it('does not overwrite an unknown future schema, but lets current session change',()=>{
    const store=new MemoryStore();const raw=JSON.stringify({version:4,precious:'future progress'});store.setItem(SAVE_KEY,raw);
    const s=new WebStorage(store);expect(s.load().best).toBeNull();expect(s.saveSettings({...DEFAULT_SETTINGS,muted:true})).toBe(false);
    expect(s.data.settings.muted).toBe(true);expect(store.getItem(SAVE_KEY)).toBe(raw);
  });
  it('preserves malformed raw data before replacing it',()=>{
    const store=new MemoryStore();store.setItem(SAVE_KEY,'not valid json');const s=new WebStorage(store);
    expect(s.load().settings).toEqual(DEFAULT_SETTINGS);expect([...store.values.keys()].some(k=>k.includes('.recovery.'))).toBe(true);
    expect(s.saveBest(record(100))).toBe(true);expect(JSON.parse(store.getItem(SAVE_KEY)!).best.score).toBe(100);
  });
  it('repairs individual invalid fields and keeps valid preferences and best',()=>{
    const store=new MemoryStore();store.setItem(SAVE_KEY,JSON.stringify({version:1,settings:{...DEFAULT_SETTINGS,music:9,sfx:'bad',hand:'right'},best:record(200),tutorialSeen:true}));
    const data=new WebStorage(store).load();expect(data.settings.music).toBe(1);expect(data.settings.sfx).toBe(DEFAULT_SETTINGS.sfx);expect(data.settings.hand).toBe('right');expect(data.best?.score).toBe(200);expect(data.tutorialSeen).toBe(true);
  });
  it('keeps valid settings when record is damaged',()=>{
    const store=new MemoryStore();store.setItem(SAVE_KEY,JSON.stringify({version:1,settings:{...DEFAULT_SETTINGS,muted:true},best:{score:-2}}));
    const s=new WebStorage(store);expect(s.load().settings.muted).toBe(true);expect(s.data.best).toBeNull();expect([...store.values.keys()].some(k=>k.includes('.recovery.'))).toBe(true);
  });
  it('isolates previous rules and preserves the original in an archive',()=>{
    const store=new MemoryStore();store.setItem(SAVE_KEY,JSON.stringify({version:1,settings:DEFAULT_SETTINGS,best:record(1000,50,'old-rules'),tutorialSeen:false}));
    const s=new WebStorage(store);expect(s.load().best).toBeNull();expect([...store.values.keys()].some(k=>k.includes('.previous-rules.'))).toBe(true);
    expect(s.saveBest(record(100))).toBe(true);expect(s.saveBest(record(9000,3,'old-rules'))).toBe(false);expect(s.data.best?.score).toBe(100);
  });
  it('never lowers record and handles tie-break on time',()=>{
    const store=new MemoryStore(),s=new WebStorage(store);s.saveBest(record(100,20));s.saveBest(record(99,100));expect(s.data.best).toMatchObject({score:100,time:20});
    s.saveBest(record(100,25));expect(s.data.best?.time).toBe(25);s.saveBest(record(100,10));expect(s.data.best?.time).toBe(25);
  });
  it('stale writes cannot overwrite a newer higher score from another tab',()=>{
    const store=new MemoryStore(),a=new WebStorage(store),b=new WebStorage(store);a.load();b.load();a.saveBest(record(500));b.saveBest(record(100));
    expect(b.data.best?.score).toBe(500);expect(new WebStorage(store).load().best?.score).toBe(500);
  });
  it('memory fallback works on blocked browser storage without claiming persistence',()=>{
    const store=new MemoryStore();store.denied=true;const s=new WebStorage(store);expect(s.load().best).toBeNull();expect(s.saveBest(record(123))).toBe(false);expect(s.data.best?.score).toBe(123);expect(s.setTutorialSeen()).toBe(false);expect(s.data.tutorialSeen).toBe(true);
  });
  it('failed persistence keeps in-memory best and later retries cannot regress it',()=>{
    const store=new MemoryStore(),s=new WebStorage(store);s.load();store.denied=true;expect(s.saveBest(record(800))).toBe(false);store.denied=false;
    expect(s.saveBest(record(400))).toBe(true);expect(JSON.parse(store.getItem(SAVE_KEY)!).best.score).toBe(800);
  });
  it('protects raw data when recovery backup cannot be written',()=>{
    const original='broken';let raw=original;const storage:StorageLike={getItem:()=>raw,setItem:(key,value)=>{if(key!==SAVE_KEY)throw new Error('quota');raw=value;}};
    const s=new WebStorage(storage);s.load();expect(s.saveBest(record(30))).toBe(false);expect(raw).toBe(original);
  });
  it('guards against corrupt or non-finite score/volume values',()=>{
    const s=new WebStorage(new MemoryStore());expect(s.saveBest(record(Infinity))).toBe(false);expect(s.saveBest(record(2,NaN))).toBe(false);expect(s.saveBest(record(-1))).toBe(false);
    expect(sanitizeSettings({music:Infinity,sfx:-1,mode:'invalid'})).toMatchObject({music:DEFAULT_SETTINGS.music,sfx:0,mode:'joystick'});
  });
  it('protects future schemas appearing after the tab loaded',()=>{
    const store=new MemoryStore(),s=new WebStorage(store);s.load();const future=JSON.stringify({version:3,best:{opaque:'new-format'}});store.setItem(SAVE_KEY,future);
    expect(s.saveBest(record(100))).toBe(false);expect(store.getItem(SAVE_KEY)).toBe(future);
  });
  it('backs up an externally replaced malformed primitive before saving',()=>{
    const store=new MemoryStore(),s=new WebStorage(store);s.load();store.setItem(SAVE_KEY,'123');expect(s.saveBest(record(42))).toBe(true);
    expect([...store.values.entries()].some(([key,value])=>key.includes('.recovery.')&&value==='123')).toBe(true);
  });
});
