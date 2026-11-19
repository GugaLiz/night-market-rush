import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
const button=name=>page.getByRole('button',{name,exact:true}).click();

try{
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    // Use the same Vite module instance as the running game, including its HMR timestamp.
    const moduleUrl=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/platform/audio.ts').name;
    const {GameAudio}=await import(moduleUrl);
    const probe=window.weaponAudioProbe={kind:'',release:[],contact:[],fragments:0,peak:0,attacks:0,contactsAt:{}};
    let active;
    const play=GameAudio.prototype.play;
    GameAudio.prototype.play=function(event){
      const release=event.type==='attack'&&event.kind===probe.kind;
      const contact=event.type==='damage'&&event.source===probe.kind&&event.victimId>0;
      if(!release&&!contact)return play.call(this,event);
      active=[];
      try{
        const result=play.call(this,event);
        if(release)probe.attacks++;
        if(contact&&event.burstIndex===1){
          const group=probe.contactsAt[event.time]??={targets:0,voices:0};
          group.targets++;
          if(active.length)group.voices++;
        }
        if(contact&&event.burstIndex>1){
          if(active.length)throw Error('A damage fragment restarted the weapon contact sound');
          probe.fragments++;
        }
        if(active.length)probe[release?'release':'contact'].push(active.join('/'));
        return result;
      }finally{active=undefined;}
    };
    const rates=new WeakMap();
    for(const [method,type] of [['createOscillator','tone'],['createBiquadFilter','noise']]){
      const create=BaseAudioContext.prototype[method];
      BaseAudioContext.prototype[method]=function(...args){
        const node=create.apply(this,args);
        rates.set(node.frequency,type);
        return node;
      };
    }
    const set=AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime=function(value,time){
      if(active&&rates.has(this))active.push(rates.get(this)+value);
      return set.call(this,value,time);
    };
    const compressor=BaseAudioContext.prototype.createDynamicsCompressor;
    BaseAudioContext.prototype.createDynamicsCompressor=function(){
      const limiter=compressor.call(this),meter=this.createAnalyser();
      meter.fftSize=4096;limiter.connect(meter);
      const samples=new Float32Array(meter.fftSize);
      function measure(){
        meter.getFloatTimeDomainData(samples);
        for(const sample of samples)probe.peak=Math.max(probe.peak,Math.abs(sample));
        requestAnimationFrame(measure);
      }
      requestAnimationFrame(measure);
      return limiter;
    };
  });
  await button('操作设置');
  await page.getByRole('tab',{name:'声音'}).click();
  const music=page.getByRole('slider',{name:'音乐音量'});
  await music.focus();await page.keyboard.press('Home');await button('应用');
  await button('配送试验场');
  const signatures=new Set();
  const kinds=await page.getByLabel('试验武器',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value));
  assert.equal(kinds.length,10);
  for(const kind of kinds){
    await button('清空场地');
    await page.getByLabel('试验武器',{exact:true}).selectOption(kind);
    await page.evaluate(kind=>Object.assign(window.weaponAudioProbe,{kind,release:[],contact:[],fragments:0,peak:0}),kind);
    await button('装备并体验');
    await button('试验工具');
    await page.getByLabel('敌人类型',{exact:true}).selectOption('bowl');
    await button('生成单只');
    await page.waitForFunction(()=>{
      const p=window.weaponAudioProbe;
      return p.release.length>0&&p.contact.length>0&&p.fragments>0&&p.peak>.01;
    },null,{timeout:7000});
    const result=await page.evaluate(()=>window.weaponAudioProbe);
    for(const phase of ['release','contact']){
      const distinct=[...new Set(result[phase])];
      assert.equal(distinct.length,1,kind+' has a consistent '+phase+' motif');
      assert.ok(!signatures.has(distinct[0]),kind+' has a unique '+phase+' motif');
      signatures.add(distinct[0]);
    }
    console.log(kind,JSON.stringify({release:result.release[0],contact:result.contact[0],suppressedFragments:result.fragments,peak:result.peak.toFixed(3)}));
    await button('试验工具');
  }
  await button('清空场地');
  await page.getByLabel('试验武器',{exact:true}).selectOption('lunchbox');
  await button('装备并体验');
  await button('试验工具');
  await page.evaluate(async()=>{
    const {WEAPONS}=await import('/src/core/weapons.ts');
    const game=window.__gameTest.game(),p=game.state.player;
    game.clearArena();
    Object.assign(p,{x:220,px:220,y:340,py:340,moveDirection:{x:1,y:0}});
    for(let i=0;i<8;i++){
      const e=game.spawnEnemy('bowl',{x:p.x+WEAPONS.lunchbox.range+(i%4)*12,y:p.y+Math.floor(i/4)*18});
      e.stunUntil=game.state.time+4;
    }
    Object.assign(window.weaponAudioProbe,{kind:'lunchbox',contactsAt:{}});
  });
  await button('继续试验');
  await page.waitForFunction(()=>Object.values(window.weaponAudioProbe.contactsAt).some(g=>g.targets>=6),null,{timeout:7000});
  const group=await page.evaluate(()=>Object.values(window.weaponAudioProbe.contactsAt).find(g=>g.targets>=6));
  assert.equal(group.voices,1);
  await button('暂停游戏');
  await button('设置');
  await page.getByRole('tab',{name:'声音'}).click();
  await page.getByRole('switch',{name:'总静音'}).click();
  await button('应用');
  await button('继续挑战');
  // Let the volume ramp and the analyser's pre-mute sample history drain.
  await page.waitForTimeout(300);
  await page.evaluate(()=>Object.assign(window.weaponAudioProbe,{attacks:0,release:[],peak:0}));
  await page.waitForFunction(()=>window.weaponAudioProbe.attacks>=2,null,{timeout:7000});
  const mute=await page.evaluate(()=>({voices:window.weaponAudioProbe.release.length,peak:window.weaponAudioProbe.peak}));
  assert.equal(mute.voices,0);
  assert.ok(mute.peak<.001,'muted audio reached the output');
  console.log(JSON.stringify({group,mute}));
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
