/**
 * Bake the project's own procedural Web Audio synthesis into Cocos AudioClip
 * assets. Requires the already-installed esbuild/Playwright dependencies and a
 * local Chromium browser. No network access or third-party samples are used.
 *
 * Run from the project root: node scripts/generate-cocos-audio.mjs
 * The output is deterministic 32 kHz mono PCM WAV; source is src/platform/audio.ts.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'cocos','assets','resources','audio');
const chromiumPath=process.env.COCOS_AUDIO_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const weaponKinds=['tongs','bag','chopsticks','spirit','knife','tray','umbrella','sword','lunchbox','talisman'];
const skillKinds=['fan','skate','soda','lure','bubble','cones','bell','route','hook','heat','dispatch','stamp','supply','health','icebox','steamer','express','berry','vortex','poison','frost'];
const guardKinds=['epicHotpot','epicDragon','epicOpera','epicPearl','epicSteamer'];
const event=(type,extra={})=>({type,x:0,y:0,...extra});
const specs=[
  ...['ui','start','record'].map(name=>({name,event:name})),
  {name:'market_open',event:event('market',{action:'open',group:'food',kind:null})},
  {name:'market_final',event:event('market',{action:'open',group:'final',kind:null})},
  {name:'market_sign',event:event('market',{action:'sign',group:'food',kind:'soup'})},
  {name:'market_closing',event:event('market',{action:'closing',group:'final',kind:'final'})},
  ...['frostShatter','iceShards','dispatchClear','dash','enemyShot'].map(type=>({name:type,event:event(type,{angle:0,reach:0,kind:'bun'})})),
  ...[1,3].map(hop=>({name:`giant_${hop}`,event:event('giantLand',{hop})})),
  ...['vortex','frost'].map(kind=>({name:`elemental_${kind}`,event:event('elementalBurst',{kind})})),
  {name:'guard_summon',event:event('guardBeat',{kind:'epicHotpot',beat:'summon'})},
  ...guardKinds.map(kind=>({name:`guard_${kind}`,event:event('guardBeat',{kind,beat:'strike'})})),
  ...['icebox','steamer','berry'].map(kind=>({name:`ultimate_${kind}`,event:event('ultimateBeat',{kind,beat:1})})),
  ...[1,4,8,12].map(beat=>({name:`ultimate_express_${beat}`,event:event('ultimateBeat',{kind:'express',beat})})),
  {name:'kill',event:event('kill',{kind:'bun',points:1})},
  {name:'kill_bowl',event:event('kill',{kind:'bowl',points:1})},
  {name:'kill_crowd',event:event('kill',{kind:'bun',points:1}),setup:'crowd'},
  {name:'warn',event:event('warn')},{name:'pickup',event:event('pickup',{kind:'soda'})},
  {name:'pickup_fan',event:event('pickup',{kind:'fan'})},
  ...Array.from({length:5},(_,i)=>({name:`coin_${i}`,event:event('coin',{amount:1}),setup:`coin:${i}`})),
  ...Array.from({length:5},(_,i)=>({name:`coin_large_${i}`,event:event('coin',{amount:2}),setup:`coin:${i}`})),
  {name:'weapon',event:event('weapon',{kind:'tongs',previous:'bag'})},
  ...weaponKinds.map(kind=>({name:`attack_${kind}`,event:event('attack',{kind,id:1,angle:0})})),
  ...weaponKinds.map(kind=>({name:`impact_${kind}`,method:'weaponImpact',kind})),
  ...['tongs','chopsticks'].flatMap(kind=>[2,3].map(contact=>({name:`impact_${kind}_${contact}`,method:'weaponContact',kind,contact}))),
  {name:'damage_player',event:event('damage',{victimId:0,source:'bun',amount:8,time:0,id:1,nominal:8})},
  {name:'damage_fan_first',event:event('damage',{victimId:2,source:'fan',amount:8,time:0,id:1,nominal:8}),setup:'fan_first'},
  {name:'damage_fan',event:event('damage',{victimId:2,source:'fan',amount:8,time:0,id:1,nominal:8})},
  {name:'damage_poison',event:event('damage',{victimId:2,source:'poison',amount:8,time:0,id:1,nominal:8})},
  {name:'damage_generic',event:event('damage',{victimId:2,source:'soda',amount:8,time:0,id:1,nominal:8})},
  {name:'damage_skate',event:event('damage',{victimId:2,source:'skate',amount:8,time:0,id:1,nominal:8})},
  ...['bubble','umbrella'].map(kind=>({name:`defend_${kind}`,event:event('defend',{kind,victimId:0})})),
  {name:'heal',event:event('heal',{id:1,amount:25})},
  ...skillKinds.map(kind=>({name:`skill_${kind}`,event:event('skill',{kind,time:0,facing:{x:1,y:0}})})),
  {name:'fail',event:event('fail',{kind:'bun'})},{name:'wave',event:event('wave',{wave:2})},
  {name:'stage',event:event('stage',{stage:2})},
  ...['skate','bubble','heat','stamp','hook','dispatch'].map(kind=>({name:`end_${kind}`,event:event('skillEnd',{kind})})),
  {name:'music_home',music:'home'}, {name:'music_play',music:'play'},
];

const bundle=await build({stdin:{contents:"export {GameAudio} from './src/platform/audio.ts';",resolveDir:root,sourcefile:'cocos-audio-bake.ts',loader:'ts'},bundle:true,write:false,format:'iife',globalName:'OriginalGameAudio'});
const browser=await chromium.launch({headless:true,executablePath:chromiumPath,args:['--no-sandbox']});
try {
  const page=await browser.newPage();await page.addScriptTag({content:bundle.outputFiles[0].text});
  await mkdir(output,{recursive:true});
  for(const spec of specs){
    const encoded=await page.evaluate(async spec=>{
      const rate=32000,spacing=spec.music==='home'?.32:.235;
      const duration=spec.music?32*spacing:2;
      const ctx=new OfflineAudioContext(1,Math.ceil(rate*duration),rate);
      Object.defineProperty(ctx,'state',{get:()=> 'running'});
      let clock=0;Object.defineProperty(ctx,'currentTime',{get:()=>clock});
      const audio=new OriginalGameAudio.GameAudio();
      audio.context=ctx;audio.master=ctx.createGain();audio.musicBus=ctx.createGain();audio.sfxBus=ctx.createGain();audio.combatBus=ctx.createGain();
      audio.combatBus.connect(audio.sfxBus);audio.musicBus.connect(audio.master);audio.sfxBus.connect(audio.master);audio.master.connect(ctx.destination);
      audio.noise=ctx.createBuffer(1,rate*2,rate);audio.frictionNoise=ctx.createBuffer(1,rate*2,rate);
      const samples=audio.noise.getChannelData(0),friction=audio.frictionNoise.getChannelData(0);let filtered=0,seed=0x16c72a31;
      for(let i=0;i<samples.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;friction[i]=((seed>>>0)/4294967296)*2-1;filtered=(filtered+friction[i]*.05)/1.03;samples[i]=filtered*3.5;}
      audio.scene=spec.music||'play';
      if(spec.setup==='crowd'){audio.recentKills=[0,0];audio.damageTime=0;}
      if(spec.setup==='fan_first')audio.lastCast.set('fan',0);
      if(spec.setup?.startsWith('coin:')){const index=Number(spec.setup.slice(5));audio.lastCoin=index===0?-1:-.1;audio.coinNote=index===0?0:index-1;}
      if(spec.music){audio.nextBeat=0;audio.beat=0;while(clock<duration-.12){audio.scheduleMusic();clock+=.025;}}
      else if(spec.method==='weaponImpact')audio.weaponImpact(spec.kind,0);
      else if(spec.method==='weaponContact'){
        if(spec.kind==='chopsticks'){
          const middle=spec.contact===2;audio.note(middle?710:520,0,.052,middle?.17:.21,'triangle',middle?395:280);
          audio.friction(0,.033,.10,2050,960);
        }else{
          const last=spec.contact===3;audio.note(last?390:510,0,last?.11:.073,last?.28:.18,'triangle',last?145:270);
          audio.friction(0,.065,last?.23:.15,1250,510);
        }
      }
      else audio.play(spec.event);
      const rendered=await ctx.startRendering(),samplesOut=rendered.getChannelData(0);
      // Preserve all audible tails plus 20 ms. Music keeps its exact loop length.
      let count=samplesOut.length;
      if(!spec.music){while(count>0&&Math.abs(samplesOut[count-1])<1e-5)count--;if(count===0)throw new Error(`Silent cue: ${spec.name}`);count=Math.min(samplesOut.length,count+Math.floor(rate*.02));}
      else if(!samplesOut.some(sample=>Math.abs(sample)>=1e-5))throw new Error(`Silent music: ${spec.name}`);
      const wav=new ArrayBuffer(44+count*2),view=new DataView(wav);const ascii=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
      ascii(0,'RIFF');view.setUint32(4,36+count*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,count*2,true);
      for(let i=0;i<count;i++){const value=Math.max(-1,Math.min(1,samplesOut[i]));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}
      const bytes=new Uint8Array(wav);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
    },spec);
    await writeFile(path.join(output,`${spec.name}.wav`),Buffer.from(encoded,'base64'));
    console.log(spec.name);
  }
  console.log(`Baked ${specs.length} cues into ${output}`);
} finally {await browser.close();}
