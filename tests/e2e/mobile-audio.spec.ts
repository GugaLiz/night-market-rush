import {expect,test} from '@playwright/test';

declare global {
  interface Window {
    mobileAudioProbe:{release:()=>Promise<void>;suspend:()=>Promise<void>;peak:()=>number;session:{type:string};contexts:number};
  }
}

test.use({viewport:{width:956,height:440},hasTouch:true,isMobile:true});

test('touch input restores interrupted audio, while muting releases the playback session',async({page})=>{
  await page.addInitScript(()=>{
    let blocked=true;
    let active:AudioContext;
    let analyser:AnalyserNode;
    const session={type:'auto'};
    Object.defineProperty(navigator,'audioSession',{configurable:true,value:session});
    window.mobileAudioProbe={
      release:async()=>{await active.suspend();blocked=false;},
      suspend:()=>active.suspend(),
      peak:()=>{
        const samples=new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return samples.reduce((peak,value)=>Math.max(peak,Math.abs(value)),0);
      },
      session,contexts:0,
    };
    class InterruptedContext extends AudioContext {
      constructor(){
        super();
        active=this;
        window.mobileAudioProbe.contexts++;
      }
      override get state(){return blocked?'suspended':super.state;}
      override resume(){
        if(blocked)return Promise.reject(new DOMException('Audio requires a later gesture','NotAllowedError'));
        return super.resume();
      }
      override createDynamicsCompressor(){
        const output=super.createDynamicsCompressor();
        analyser=this.createAnalyser();
        output.connect(analyser);
        return output;
      }
    }
    window.AudioContext=InterruptedContext;
  });
  await page.goto('/');
  await page.getByRole('button',{name:'开始挑战',exact:true}).tap();
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view','play');
  expect(await page.evaluate(()=>window.__gameTest.audioAvailable())).toBe(false);
  await page.evaluate(()=>window.mobileAudioProbe.release());
  expect(await page.evaluate(()=>window.__gameTest.audioAvailable())).toBe(false);
  await page.touchscreen.tap(150,260);
  await expect.poll(()=>page.evaluate(()=>window.__gameTest.audioAvailable())).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.mobileAudioProbe.peak())).toBeGreaterThan(.00001);
  await page.evaluate(()=>window.mobileAudioProbe.suspend());
  expect(await page.evaluate(()=>window.__gameTest.audioAvailable())).toBe(false);
  await page.touchscreen.tap(165,260);
  await expect.poll(()=>page.evaluate(()=>window.__gameTest.audioAvailable())).toBe(true);
  expect(await page.evaluate(()=>window.mobileAudioProbe.contexts)).toBe(1);
  expect(await page.evaluate(()=>window.mobileAudioProbe.session.type)).toBe('playback');

  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'设置',exact:true}).tap();
  await page.locator('[data-tab="sound"]').tap();
  await page.getByRole('switch',{name:'总静音'}).tap();
  expect(await page.evaluate(()=>window.mobileAudioProbe.session.type)).toBe('auto');
  await expect.poll(()=>page.evaluate(()=>window.mobileAudioProbe.peak())).toBeLessThan(.00001);
});
