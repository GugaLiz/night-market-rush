import {expect,test} from '@playwright/test';
import type {GameEvent,SkillKind} from '../../src/shared/types';

test('skills survive combat interruptions and weapon contacts remain distinct in the mix',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const audioUrl='/src/platform/audio.ts',typesUrl='/src/shared/types.ts';
    const {GameAudio}:typeof import('../../src/platform/audio')=await import(audioUrl);
    const {SKILL_KINDS,DEFAULT_SETTINGS}:typeof import('../../src/shared/types')=await import(typesUrl);
    const rate=32000;
    let recording:OfflineAudioContext;
    let sources=0;
    let clock=0;
    // Render the game's actual gains, oscillators, filters and limiter with a deterministic
    // audio clock. Silence during a pause is measurable without a physical speaker.
    class RecordingContext extends OfflineAudioContext{
      constructor(){super(1,rate,rate);recording=this;}
      override get state():AudioContextState{return 'running';}
      override get currentTime(){return clock;}
      override createOscillator(){sources++;return super.createOscillator();}
      override createBufferSource(){sources++;return super.createBufferSource();}
      async close(){}
    }
    window.AudioContext=RecordingContext as unknown as typeof AudioContext;
    const cast=(kind:SkillKind):GameEvent=>({type:'skill',kind,time:0,x:600,y:350,facing:{x:1,y:0}});
    async function render(events:GameEvent[],pause=false,muted=false){
      sources=0;clock=0;
      const audio=new GameAudio();
      audio.setSettings({...DEFAULT_SETTINGS,music:0});
      audio.setScene('play');
      await audio.unlock();
      for(const event of events){
        if(event.type==='damage')clock=event.time;
        audio.play(event);
      }
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
    function impact(source:'chopsticks'|'tongs'|'fan',victimId:number,attackId?:number,burstIndex=1):Extract<GameEvent,{type:'damage'}>{
      return {type:'damage',id:victimId*8+burstIndex,victimId,source,attackId,burstIndex,amount:5,nominal:5,x:600,y:350,time:0};
    }
    function energy(data:Float32Array,from:number,to:number){
      let sum=0;
      for(let i=Math.round(from*rate);i<Math.round(to*rate);i++)sum+=data[i]**2;
      return sum;
    }
    const volley=Array.from({length:10},(_,i)=>impact('chopsticks',i+1,12));
    const single=await render([volley[0],impact('chopsticks',1,12,2)]);
    const three=await render(volley.slice(0,3));
    const crowd=await render(volley);
    const overlap=await render([volley[0],impact('chopsticks',99,13),...volley.slice(1)]);
    const rear=await render([...volley,{...impact('chopsticks',11,12),time:.42},{...impact('chopsticks',12,12),time:.66}]);
    const tongsAir=await render([{type:'attack',kind:'tongs',id:10,x:600,y:350,angle:0}]);
    const tongsContact=await render([impact('tongs',1,10)]);
    const pickup:GameEvent={type:'pickup',kind:'fan',x:600,y:350};
    const fan:GameEvent={type:'skill',kind:'fan',x:600,y:350,time:0,pickupFrom:{x:630,y:350},facing:{x:1,y:0}};
    const fanCaught=await render([pickup,fan]);
    const fanHit=await render([pickup,fan,impact('fan',1)]);
    return {peaks,expectedPair:bell.sources+dispatch.sources,actualPair:pair.sources,
      bellAlone:amplitude(bell.data,1319),bellInCombat:amplitude(combat.data,1319),
      oneHit:single.sources,threeHits:three.sources,crowd:crowd.sources,overlap:overlap.sources,
      oneTail:energy(single.data,.045,.070),crowdTail:energy(crowd.data,.045,.070),
      rearHit:energy(rear.data,.425,.470),afterCap:energy(rear.data,.665,.710),noRear:energy(crowd.data,.425,.470),
      tongsAir:tongsAir.peak,tongsContact:tongsContact.peak,fanCaught:fanCaught.sources,fanHit:fanHit.sources,
      paused:(await render([...volley,pickup,fan,impact('fan',20),cast('vortex')],true)).peak,
      muted:(await render([...volley,cast('express')],false,true)).peak};
  });
  for(const [kind,peak] of Object.entries(result.peaks))expect(peak,kind).toBeGreaterThan(.014);
  expect(result.actualPair).toBe(result.expectedPair);
  expect(result.bellAlone).toBeGreaterThan(.003);
  expect(result.bellInCombat).toBeGreaterThan(result.bellAlone*.7);
  expect(result.threeHits).toBeGreaterThan(result.oneHit);
  expect(result.crowd).toBe(result.threeHits);
  expect(result.overlap).toBe(result.crowd+result.oneHit);
  expect(result.crowdTail).toBeGreaterThan(result.oneTail+.001);
  expect(result.rearHit).toBeGreaterThan(.001);
  expect(result.afterCap).toBe(0);
  expect(result.noRear).toBe(0);
  expect(result.tongsContact).toBeGreaterThan(result.tongsAir*1.5);
  expect(result.fanHit).toBeGreaterThan(result.fanCaught);
  expect(result.paused).toBe(0);
  expect(result.muted).toBe(0);
});
