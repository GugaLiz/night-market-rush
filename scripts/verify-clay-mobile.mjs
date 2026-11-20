import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const output=process.env.MOBILE_CAPTURE||fileURLToPath(new URL('../docs/verification/clay/mobile.webp',import.meta.url));
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const labels=['保冷箱冰浪','蒸笼开席','加急三连送','杨梅汽水炸屏'];
const tiles=[4,5,2,6],errors=[],reports=[],frames=[];
// Opening glass, falling bamboo lid, repeating delivery stamps with one final impact, and a popping berry bottle.
const impactNotes=[[1260,1640,2210],[470,126],[380,210],[970,188,520,790,630]];
const button=(page,name)=>page.getByRole('button',{name,exact:true});
async function view(page,name){
  const shell=page.locator('[data-view="'+name+'"]');
  if(name==='rotate'){
    await shell.waitFor({state:'attached'});
    await page.getByRole('heading',{name:'请横屏游玩'}).waitFor();
  }else await shell.waitFor();
}

async function monitor(page){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.addInitScript(()=>{
    const meter=window.mobileCheck={tiles:new Set(),tones:[],context:null,samples:null};
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...a){
      if(this.canvas.id==='game-canvas'&&image instanceof HTMLImageElement&&image.src.endsWith('clay-ultimate-fx.webp')&&a.length===8){
        meter.tiles.add(Math.round(a[0]/a[2])+2*Math.round(a[1]/a[3]));
      }
      return draw.call(this,image,...a);
    };
    const create=BaseAudioContext.prototype.createDynamicsCompressor;
    BaseAudioContext.prototype.createDynamicsCompressor=function(){
      const limiter=create.call(this),samples=this.createAnalyser();
      samples.fftSize=2048;limiter.connect(samples);
      meter.context=this;meter.samples=samples;
      return limiter;
    };
    const pitchParams=new WeakSet(),oscillator=BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator=function(){
      const node=oscillator.call(this);pitchParams.add(node.frequency);return node;
    };
    const set=AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime=function(value,at){
      if(pitchParams.has(this))meter.tones.push(value);
      return set.call(this,value,at);
    };
  });
}

async function turnMusicOff(page,reduceMotion){
  await button(page,'操作设置').click();
  await page.getByRole('tab',{name:'声音'}).click();
  const music=page.getByRole('slider',{name:'音乐音量'});
  await music.focus();await page.keyboard.press('Home');assert.equal(await music.inputValue(),'0');
  if(reduceMotion){
    await page.getByRole('tab',{name:'画面'}).click();
    await page.locator('#setting-reduceMotion').click();
    assert.equal(await page.locator('#setting-shake').isDisabled(),true);
    assert.equal(await page.locator('#setting-shake').getAttribute('aria-checked'),'false');
    await button(page,'简化').click();
  }
  await button(page,'应用').click();await view(page,'home');
}

async function recordOutput(page){
  // The audio device advances on its own clock, independently of simulated animation frames.
  let peak=0;
  for(let i=0;i<7;i++){
    const sample=await page.evaluate(()=>{
      const meter=window.mobileCheck;
      if(meter.context?.state!=='running')return 0;
      const data=new Float32Array(meter.samples.fftSize);meter.samples.getFloatTimeDomainData(data);
      let max=0;for(const v of data)max=Math.max(max,Math.abs(v));return max;
    });
    peak=Math.max(peak,sample);
    await new Promise(resolve=>setTimeout(resolve,14));
  }
  return peak;
}

async function openWithTab(page,label){
  for(let i=0;i<35;i++){
    if(await page.evaluate(label=>document.activeElement?.textContent?.trim()===label,label)){
      await page.keyboard.press('Enter');return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard navigation did not reach '+label);
}

async function desktop(){
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  await monitor(page);await page.goto(base,{waitUntil:'networkidle'});
  await view(page,'home');await turnMusicOff(page,true);
  await button(page,'配送试验场').click();await view(page,'lab');
  await openWithTab(page,'保冷箱冰浪');await view(page,'play');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>window.mobileCheck.tiles.has(4));await page.keyboard.up('ArrowRight');
  assert.ok(Number(await page.locator('#score-value').textContent())>0);
  await page.keyboard.press('Escape');await view(page,'pause');
  await page.keyboard.press('Escape');await view(page,'play');
  await button(page,'试验工具').click();await openWithTab(page,'巨包三连坐');await view(page,'play');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('night-market-rush.save.v4')).settings);
  assert.equal(stored.reduceMotion,true);assert.equal(stored.shake,true);assert.equal(stored.quality,'simple');
  await page.close();
}

async function mobile(){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage(),assets=new Set();
  page.on('response',response=>{
    const path=new URL(response.url()).pathname;
    if(path.includes('/clay-')&&path.endsWith('.webp')&&response.ok())assets.add(path);
  });
  await monitor(page);
  const epoch=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(+epoch+1000));
  await page.goto(base,{waitUntil:'networkidle'});await view(page,'rotate');
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  if(new URL(base).port==='4173')assert.equal(await page.evaluate(()=>typeof window.__gameTest),'undefined');
  await page.setViewportSize({width:844,height:390});await page.clock.runFor(64);await view(page,'home');
  await turnMusicOff(page,false);
  await button(page,'配送试验场').tap();await view(page,'lab');
  assert.ok(await page.locator('.lab-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  const cdp=await context.newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  for(const [i,label] of labels.entries()){
    await button(page,label).tap();await view(page,'play');
    await page.evaluate(()=>window.mobileCheck.tiles.clear());
    const shell=await page.locator('#game-shell').boundingBox();
    const origin={x:shell.x+shell.width*.20,y:shell.y+shell.height*.71,id:1};
    await send('touchStart',[origin]);await send('touchMove',[{...origin,x:origin.x+66}]);
    assert.match(await page.locator('#joystick').getAttribute('class'),/is-active/);
    await page.evaluate(()=>{window.mobileCheck.tones.length=0;});
    for(let n=0;n<55;n++){
      await page.clock.runFor(16);
      if(await page.evaluate(tile=>window.mobileCheck.tiles.has(tile),tiles[i]))break;
    }
    await page.clock.runFor([192,320,543,208][i]);
    const status=await page.evaluate(()=>({tiles:[...window.mobileCheck.tiles],audioState:window.mobileCheck.context?.state}));
    assert.ok(status.tiles.includes(tiles[i]),label+' effect after joystick pickup');
    assert.equal(status.audioState,'running');
    const peak=await recordOutput(page);
    assert.ok(peak>.00005,'The real SFX output has a non-silent waveform with music off');
    const image=await page.screenshot();
    frames.push({label,url:'data:image/png;base64,'+image.toString('base64')});
    await page.clock.runFor(720);await send('touchEnd',[]);
    if(i===2){
      const delivery=page.locator('[data-status="express"]');
      assert.match(await delivery.textContent(),/急送第 1 单/);
      await page.clock.runFor(5200);
      assert.match(await delivery.textContent(),/急送第 2 单/);
      await page.clock.runFor(4900);
      assert.match(await delivery.textContent(),/急送第 3 单/);
      await page.clock.runFor(4000);
      assert.equal(await delivery.count(),0);
    }
    const kills=Number(await page.locator('#score-value').textContent());
    assert.ok(kills>0,label+' killed real demonstration targets');
    const tones=await page.evaluate(()=>window.mobileCheck.tones);
    assert.ok(impactNotes[i].every(note=>tones.includes(note)),label+' played the intended impact cues');
    reports.push({label,kills,tiles:status.tiles,impactNotes:impactNotes[i],audioPeak:Number(peak.toFixed(3))});
    await button(page,'试验工具').tap();await view(page,'lab');
  }
  await button(page,'巨包三连坐').tap();await view(page,'play');await page.clock.runFor(320);
  await page.setViewportSize({width:390,height:844});await page.clock.runFor(64);await view(page,'rotate');
  await page.setViewportSize({width:844,height:390});await page.clock.runFor(64);await view(page,'pause');
  await button(page,'继续挑战').tap();await view(page,'play');
  await page.evaluate(()=>{window.mobileCheck.tones.length=0;});await page.clock.runFor(4800);
  assert.deepEqual(await page.evaluate(()=>window.mobileCheck.tones.filter(note=>note===143||note===118)),[143,143,118]);
  assert.ok(assets.size>=8,'expected the clay WebP atlases to load');
  const sheet=await page.evaluate(async frames=>{
    const w=844,h=390,gutter=6,row=27;
    const stage=document.createElement('canvas');stage.width=w*2+gutter;stage.height=(h+row)*2+gutter;
    const c=stage.getContext('2d');c.fillStyle='#2c2628';c.fillRect(0,0,stage.width,stage.height);
    for(const [i,frame] of frames.entries()){
      const x=i%2*(w+gutter),y=Math.floor(i/2)*(h+row+gutter),image=new Image();
      image.src=frame.url;await image.decode();c.drawImage(image,x,y+row,w,h);
      c.fillStyle='#ffdfa1';c.font='bold 16px Microsoft YaHei,sans-serif';c.fillText(frame.label,x+10,y+20);
    }
    return stage.toDataURL('image/webp',.94).split(',')[1];
  },frames);
  assert.deepEqual(errors,[]);
  await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(sheet,'base64'));
  console.log(JSON.stringify({base,desktopReducedMotion:true,portraitResume:true,assets:assets.size,reports,output},null,2));
  await context.close();
}

try{await desktop();await mobile();}finally{await browser.close();}
