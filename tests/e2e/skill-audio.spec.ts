import {expect,test} from '@playwright/test';
import type {GameEvent,SkillKind} from '../../src/shared/types';

test('every skill produces audio and simultaneous pickups survive combat interruptions',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const audioUrl='/src/platform/audio.ts',typesUrl='/src/shared/types.ts';
    const {GameAudio}:typeof import('../../src/platform/audio')=await import(audioUrl);
    const {SKILL_KINDS,DEFAULT_SETTINGS}:typeof import('../../src/shared/types')=await import(typesUrl);
    const rate=32000;
    let recording:OfflineAudioContext;
    let sources=0;
    // Render the game's actual gains, oscillators, filters and limiter with a deterministic
    // audio clock. Silence during a pause is measurable without a physical speaker.
    class RecordingContext extends OfflineAudioContext{
      constructor(){super(1,rate,rate);recording=this;}
      override get state():AudioContextState{return 'running';}
      override createOscillator(){sources++;return super.createOscillator();}
      override createBufferSource(){sources++;return super.createBufferSource();}
      async close(){}
    }
    window.AudioContext=RecordingContext as unknown as typeof AudioContext;
    const cast=(kind:SkillKind):GameEvent=>({type:'skill',kind,time:0,x:600,y:350,facing:{x:1,y:0}});
    async function render(events:GameEvent[],pause=false,muted=false){
      sources=0;
      const audio=new GameAudio();
      audio.setSettings({...DEFAULT_SETTINGS,music:0});
      audio.setScene('play');
      await audio.unlock();
      for(const event of events)audio.play(event);
      if(pause)audio.setScene('paused');
      if(muted)audio.setSettings({...DEFAULT_SETTINGS,muted:true});
      const buffer=await recording.startRendering();
      const data=buffer.getChannelData(0);
      let peak=0;
      for(const sample of data)peak=Math.max(peak,Math.abs(sample));
      audio.dispose();
      return {peak,sources,data};
    }
    const peaks:Record<string,number>={};
    for(const kind of SKILL_KINDS)peaks[kind]=(await render([cast(kind)])).peak;
    const bell=await render([cast('bell')]);
    const dispatch=await render([cast('dispatch')]);
    const pair=await render([cast('bell'),cast('dispatch'),cast('bell')]);
    const combat=await render([cast('bell'),{
      type:'weapon',kind:'sword',previous:'bag',x:600,y:350,
    },{
      type:'damage',id:1,victimId:0,source:'bun',amount:3,nominal:3,x:600,y:350,time:0,
    }]);
    // Listen for the bell's second strike once the hurt cue has decayed.
    function amplitude(data:Float32Array,hz:number){
      let real=0,imaginary=0;
      const start=Math.round(rate*.22),end=Math.round(rate*.29);
      for(let i=start;i<end;i++){
        const phase=2*Math.PI*hz*i/rate;
        real+=data[i]*Math.cos(phase);imaginary+=data[i]*Math.sin(phase);
      }
      return Math.hypot(real,imaginary)/(end-start);
    }
    return {peaks,expectedPair:bell.sources+dispatch.sources,actualPair:pair.sources,
      bellAlone:amplitude(bell.data,1319),bellInCombat:amplitude(combat.data,1319),
      paused:(await render([cast('vortex')],true)).peak,muted:(await render([cast('express')],false,true)).peak};
  });
  for(const [kind,peak] of Object.entries(result.peaks))expect(peak,kind).toBeGreaterThan(.014);
  expect(result.actualPair).toBe(result.expectedPair);
  expect(result.bellAlone).toBeGreaterThan(.003);
  expect(result.bellInCombat).toBeGreaterThan(result.bellAlone*.7);
  expect(result.paused).toBe(0);
  expect(result.muted).toBe(0);
});
