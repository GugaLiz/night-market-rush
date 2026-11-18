import {DEFAULT_SETTINGS,WEAPON_KINDS,type WeaponKind,type SkillKind,type GameEvent,type Settings} from '../shared/types';

type Scene='home'|'play'|'paused'|'silent';
type SoundEvent=GameEvent|'ui'|'start'|'record';
const midi=(note:number)=>440*Math.pow(2,(note-69)/12);

/** Original procedural audio. No network requests and no unlicensed samples. */
export class GameAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private musicBus:GainNode|null=null;
  private sfxBus:GainNode|null=null;
  private noise:AudioBuffer|null=null;
  private settings:Settings={...DEFAULT_SETTINGS};
  private scene:Scene='home';
  private scheduler:ReturnType<typeof setInterval>|null=null;
  private nextBeat=0;
  private beat=0;
  private lastKill=-Infinity;
  private lastWarn=-Infinity;
  private lastUI=-Infinity;
  private lastHit=-Infinity;
  private lastFanHit=-Infinity;
  private lastPickup=-Infinity;
  private lastCoin=-Infinity;
  private lastAttack=-Infinity;
  private lastSkill=-Infinity;
  private lastEnemyShot=-Infinity;
  private lastDash=-Infinity;
  private damageTime=0;
  private recentKills:number[]=[];
  private lastCrowdTime=-Infinity;
  private coinNote=0;
  private sfxVoices=new Set<AudioScheduledSourceNode>();
  private musicVoices=new Set<AudioScheduledSourceNode>();
  private disposed=false;

  get available():boolean{return this.context?.state==='running';}
  async unlock():Promise<void>{
    if(this.disposed)return;
    try{
      if(!this.context){
        const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!Constructor)return;
        const c=this.context=new Constructor();
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-7;limiter.knee.value=12;limiter.ratio.value=7;limiter.attack.value=.003;limiter.release.value=.15;
        this.master=c.createGain();this.musicBus=c.createGain();this.sfxBus=c.createGain();
        this.musicBus.connect(this.master);this.sfxBus.connect(this.master);this.master.connect(limiter);limiter.connect(c.destination);
        this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
        const samples=this.noise.getChannelData(0);let last=0;
        for(let i=0;i<samples.length;i++){last=(last+(Math.random()*2-1)*.05)/1.03;samples[i]=last*3.5;}
        this.setSettings(this.settings);
      }
      if(this.context.state!=='running')await this.context.resume();
      if(!this.scheduler){this.nextBeat=this.context.currentTime+.04;this.scheduler=setInterval(()=>this.scheduleMusic(),40);}
    }catch{/* Muted gameplay is valid when browser audio is unavailable. */}
  }
  setSettings(settings:Settings):void{
    this.settings={...settings};if(!this.context||!this.master||!this.musicBus||!this.sfxBus)return;
    const now=this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.muted?0:.72,now,.02);
    this.musicBus.gain.setTargetAtTime(Math.max(0,Math.min(1,settings.music))*(this.scene==='play'?.33:.25),now,.035);
    this.sfxBus.gain.setTargetAtTime(Math.max(0,Math.min(1,settings.sfx))*.7,now,.02);
  }
  setScene(scene:Scene):void{
    if(this.scene===scene)return;
    this.scene=scene;this.stopSources(this.musicVoices);
    if(scene==='paused'||scene==='silent')this.stopSources(this.sfxVoices);
    this.recentKills=[];this.lastCrowdTime=-Infinity;this.coinNote=0;
    if(this.context){this.nextBeat=this.context.currentTime+.05;this.beat=0;}
    this.setSettings(this.settings);
  }
  play(event:SoundEvent):void{
    const c=this.context;if(!c||c.state!=='running'||this.disposed||this.settings.muted)return;
    const now=c.currentTime;
    if(event==='ui'){
      if(now-this.lastUI<.075)return;this.lastUI=now;
      this.note(620,now,.085,.16,'sine');this.note(930,now+.018,.05,.08,'sine');return;
    }
    if(event==='start'){[60,64,67,72].forEach((n,i)=>this.note(midi(n),now+i*.065,.19,.2,'triangle'));return;}
    if(event==='record'){[72,76,79,84,79,84].forEach((n,i)=>this.note(midi(n),now+i*.105,.24,.22,'triangle'));return;}
    if(event.type==='dash'){if(now-this.lastDash<.15)return;this.lastDash=now;this.noiseBurst(now,.18,.2,900,3800);this.note(180,now,.12,.16,'triangle',420);return;}
    if(event.type==='enemyShot'){if(now-this.lastEnemyShot<.08)return;this.lastEnemyShot=now;this.note(310,now,.13,.15,'square',155);this.noiseBurst(now,.075,.1,1700,450);return;}
    if(event.type==='kill'){
      this.recentKills=this.recentKills.filter(t=>t>=this.damageTime-.15);
      this.recentKills.push(this.damageTime);
      if(this.recentKills.length>=3&&this.damageTime-this.lastCrowdTime>.28){
        this.lastCrowdTime=this.damageTime;this.lastKill=now;
        // One pot-lid crack, a short low drum and a scattering tail for the whole cluster.
        this.note(265,now,.14,.26,'triangle',79);
        this.note(106,now+.015,.27,.31,'sine',44);
        this.noiseBurst(now,.085,.22,3100,850);
        this.noiseBurst(now+.075,.19,.17,1300,380);
        this.note(492,now+.11,.11,.065,'triangle',305);return;
      }
      if(this.damageTime-this.lastCrowdTime<.15)return;
      if(now-this.lastKill<.055)return;this.lastKill=now;
      this.note(event.kind==='bowl'?180:340,now,.07,.14,'triangle',100);
      this.noiseBurst(now,.065,.08,1500);return;
    }
    if(event.type==='warn'){
      if(now-this.lastWarn<.18)return;this.lastWarn=now;
      this.note(740,now,.09,.15,'triangle');this.note(880,now+.1,.08,.12,'triangle');return;
    }
    if(event.type==='pickup'){
      if(now-this.lastPickup<.06)return;this.lastPickup=now;
      this.noiseBurst(now,.055,.07,1100,2700);
      this.note(720,now+.035,.035,.075,'triangle',490);return;
    }
    if(event.type==='coin'){
      const gap=now-this.lastCoin;
      if(gap<.075)return;
      this.coinNote=gap>.42?0:(this.coinNote+1)%5;this.lastCoin=now;
      const pitch=midi([79,81,83,86,88][this.coinNote]);
      this.note(pitch,now,.093,.17,'triangle');
      this.note(pitch*2,now+.014,.12,.078,'sine');
      if(event.amount>1)this.note(pitch*1.5,now+.052,.1,.062,'sine');return;
    }
    if(event.type==='weapon'){
      this.stopSources(this.sfxVoices);this.noiseBurst(now,.09,.14,1600,450);
      this.note(440,now+.035,.1,.14,'triangle',880);return;
    }
    if(event.type==='attack'){
      if(now-this.lastAttack<.035)return;this.lastAttack=now;
      this.weaponSound(event.kind,now,false);return;
    }
    if(event.type==='damage'){
      if(event.amount<=0)return;
      if(event.time<this.damageTime){this.recentKills=[];this.lastCrowdTime=-Infinity;}
      this.damageTime=event.time;
      if(event.victimId===0){
        this.stopSources(this.sfxVoices);this.note(145,now,.16,.28,'triangle',80);this.noiseBurst(now,.13,.18,650,280);
      }else if(event.source==='fan'){
        if(now-this.lastFanHit<.14)return;this.lastFanHit=now;
        this.noiseBurst(now+.025,.12,.115,1850,710);
        this.note(184,now+.04,.08,.09,'triangle',112);
      }else if((event.burstIndex===undefined||event.burstIndex===1)&&now-this.lastHit>=.065){
        this.lastHit=now;
        if(WEAPON_KINDS.includes(event.source as WeaponKind)){this.weaponSound(event.source as WeaponKind,now,true);this.note(event.source==='sword'||event.source==='lunchbox'?80:125,now,.095,.09,'sine',55);}
        else{this.note(event.source==='skate'?260:190,now,.07,.12,'triangle',100);this.noiseBurst(now,.055,.065,1600);}
      }return;
    }
    if(event.type==='defend'){
      this.stopSources(this.sfxVoices);
      if(event.kind==='bubble'){this.note(620,now,.07,.23,'sine',170);this.note(840,now+.065,.09,.2,'sine',230);}
      else{this.noiseBurst(now,.075,.22,3300,1100);this.note(360,now,.14,.2,'triangle',800);}
      return;
    }
    if(event.type==='heal'){
      if(event.amount>0)[60,67,72].forEach((n,i)=>this.note(midi(n),now+i*.06,.16,.13,'sine'));return;
    }
    if(event.type==='skill'){
      if(now-this.lastSkill<.035&&event.kind!=='bubble')return;this.lastSkill=now;
      this.skillSound(event.kind,now);return;
    }
    if(event.type==='fail'){
      this.stopSources(this.sfxVoices);this.stopSources(this.musicVoices);
      this.note(180,now,.22,.33,'triangle',70);this.noiseBurst(now,.18,.2,600);
      [64,60,55].forEach((n,i)=>this.note(midi(n),now+.16+i*.12,.25,.21,'triangle'));return;
    }
    if(event.type==='wave'){
      [62,69,74].forEach((n,i)=>this.note(midi(n),now+i*.085,.21,.13,'triangle'));return;
    }
    if(event.type==='stage'){
      [67,72].forEach((n,i)=>this.note(midi(n),now+i*.08,.16,.11,'sine'));return;
    }
    if(event.type==='skillEnd'){this.note(680,now,.11,.09,'sine',340);}
  }
  private weaponSound(kind:WeaponKind,at:number,hit:boolean):void{
    // Each release has a recognizable short material sound; only real damage adds impact.
    const impact=hit?1:.68;
    switch(kind){
      case 'tongs':
        this.note(hit?810:590,at,.055,.13*impact,'triangle',hit?420:750);
        this.noiseBurst(at,.035,.04*impact,2800);
        if(!hit){this.noiseBurst(at+.025,.12,.075,2300,740);this.noiseBurst(at+.067,.095,.050,2700,850);}
        break;
      case 'bag':this.noiseBurst(at,hit?.13:.18,.17*impact,hit?900:1700,380);this.note(110,at,.1,.12*impact,'sine',65);break;
      case 'chopsticks':this.note(hit?1250:960,at,.045,.14*impact,'triangle',470);this.note(1770,at+.025,.04,.05*impact,'sine');break;
      case 'spirit':this.noiseBurst(at,.19,.09*impact,2800,1100);this.note(hit?660:400,at,.17,.12*impact,'sine',hit?330:740);break;
      case 'knife':this.noiseBurst(at,hit?.055:.125,.12*impact,4200,hit?1800:1100);this.note(hit?970:1300,at,.065,.09*impact,'triangle',520);break;
      case 'tray':this.note(hit?470:310,at,.18,.12*impact,'sine',hit?230:510);this.note(930,at,.12,.035*impact,'triangle');break;
      case 'umbrella':this.noiseBurst(at,hit?.09:.22,.17*impact,2100,600);this.note(hit?390:220,at,.09,.13*impact,'triangle',140);break;
      case 'sword':this.noiseBurst(at,hit?.12:.24,.17*impact,hit?1200:3200,400);this.note(hit?165:220,at,.16,.16*impact,'triangle',70);break;
      case 'lunchbox':this.note(hit?120:420,at,hit?.22:.08,.2*impact,'triangle',hit?55:650);this.noiseBurst(at,hit?.17:.07,.16*impact,hit?700:1900,350);break;
      case 'talisman':this.note(hit?1040:790,at,.085,.12*impact,'sine',hit?680:1180);this.noiseBurst(at+.025,.05,.06*impact,3600);break;
    }
  }
  private skillSound(kind:SkillKind,at:number):void{
    switch(kind){
      case 'fan':
        // A switch clicks, the little motor spins up, then hot air rattles the order slip.
        this.note(610,at+.018,.033,.11,'triangle',310);
        this.note(103,at+.045,.33,.13,'triangle',205);
        this.noiseBurst(at+.065,.26,.17,650,2450);
        this.noiseBurst(at+.22,.32,.13,2150,730);
        this.noiseBurst(at+.25,.06,.055,3450,1900);
        break;
      case 'skate':this.noiseBurst(at,.24,.12,2500,550);[67,72,76].forEach((n,i)=>this.note(midi(n),at+i*.055,.23,.13,'triangle',midi(n+2)));break;
      case 'soda':
        this.note(890,at+.04,.05,.13,'triangle',370);
        this.noiseBurst(at+.07,.31,.14,3100,1700);
        [.16,.25,.31].forEach((t,i)=>this.note(420+i*80,at+t,.065,.08,'sine',680+i*110));
        break;
      case 'lure':this.noiseBurst(at,.1,.1,1200,500);this.note(330,at+.08,.11,.13,'triangle',420);break;
      case 'bubble':this.noiseBurst(at,.2,.12,4000,1700);[450,600,750].forEach((f,i)=>this.note(f,at+i*.05,.12,.11,'sine',f*1.6));break;
      case 'cones':[0,.075,.16].forEach((t,i)=>{this.note(150-i*20,at+t,.075,.15,'triangle',70);this.noiseBurst(at+t,.045,.06,600);});break;
      case 'bell':this.note(1568,at,.42,.14,'sine');this.note(2352,at+.02,.3,.055,'sine');break;
      case 'route':this.noiseBurst(at,.25,.07,2200,4000);this.note(660,at+.12,.13,.11,'sine');this.note(990,at+.23,.15,.1,'sine');break;
      case 'hook':this.note(480,at,.055,.12,'triangle');this.noiseBurst(at+.04,.23,.11,1800,3800);this.note(700,at+.25,.055,.1,'triangle');break;
      case 'heat':this.noiseBurst(at,.12,.12,2100,900);this.noiseBurst(at+.08,.3,.07,4000,1800);this.note(220,at,.16,.08,'sine',330);break;
      case 'dispatch':this.note(1046,at,.095,.13,'sine');this.note(784,at+.1,.095,.11,'sine');this.noiseBurst(at+.18,.12,.055,1700);break;
      case 'stamp':this.note(130,at,.11,.22,'triangle',70);this.noiseBurst(at,.07,.15,800,350);break;
      case 'supply':this.noiseBurst(at,.13,.11,3200,1300);[520,660,820].forEach((f,i)=>this.note(f,at+.12+i*.08,.13,.1,'triangle'));break;
    }
  }
  dispose():void{
    this.disposed=true;if(this.scheduler)clearInterval(this.scheduler);this.scheduler=null;
    this.stopSources(this.musicVoices);this.stopSources(this.sfxVoices);
    void this.context?.close().catch(()=>{});this.context=null;
  }
  private stopSources(sources:Set<AudioScheduledSourceNode>):void{for(const source of sources){try{source.stop();}catch{/* already stopped */}}sources.clear();}
  private track(source:AudioScheduledSourceNode,music:boolean):boolean{
    const set=music?this.musicVoices:this.sfxVoices;
    if(!music&&set.size>=18){const first=set.values().next().value as AudioScheduledSourceNode|undefined;if(first){try{first.stop();}catch{}set.delete(first);}}
    set.add(source);source.onended=()=>{set.delete(source);source.disconnect();};return true;
  }
  private note(frequency:number,at:number,duration:number,volume:number,wave:OscillatorType='triangle',endFrequency?:number,music=false):void{
    const c=this.context,bus=music?this.musicBus:this.sfxBus;if(!c||!bus)return;
    const o=c.createOscillator(),gain=c.createGain();o.type=wave;o.frequency.setValueAtTime(frequency,at);
    if(endFrequency)o.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.009);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(gain);gain.connect(bus);this.track(o,music);const old=o.onended;o.onended=(e)=>{if(typeof old==='function')old.call(o,e);gain.disconnect();};
    o.start(at);o.stop(at+duration+.02);
  }
  private noiseBurst(at:number,duration:number,volume:number,cutoff:number,endCutoff?:number,music=false):void{
    const c=this.context,bus=music?this.musicBus:this.sfxBus;if(!c||!bus||!this.noise)return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;
    filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(cutoff,at);
    if(endCutoff)filter.frequency.exponentialRampToValueAtTime(endCutoff,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus);this.track(source,music);
    const old=source.onended;source.onended=(e)=>{if(typeof old==='function')old.call(source,e);filter.disconnect();gain.disconnect();};
    source.start(at);source.stop(at+duration+.02);
  }
  private scheduleMusic():void{
    const c=this.context;if(!c||c.state!=='running'||(this.scene!=='home'&&this.scene!=='play'))return;
    const spacing=this.scene==='home'?.32:.235;
    if(this.nextBeat<c.currentTime-.1)this.nextBeat=c.currentTime+.03;
    // A compact original pentatonic phrase with alternating bass and brushed percussion.
    const melody=[72,0,76,79,76,0,74,72,69,0,72,76,74,0,67,0,72,76,79,84,79,0,76,74,72,0,69,67,64,0,67,0];
    const bass=[48,48,53,55];
    while(this.nextBeat<c.currentTime+.12){
      const i=this.beat%melody.length,at=this.nextBeat;
      if(melody[i]){this.note(midi(melody[i]),at,spacing*1.4,.14,'triangle',undefined,true);this.note(midi(melody[i]+12),at+.005,spacing*.65,.025,'sine',undefined,true);}
      if(i%4===0)this.note(midi(bass[Math.floor(i/8)]),at,spacing*3,.22,'sine',undefined,true);
      if(this.scene==='play'&&i%2===1)this.noiseBurst(at,.05,.08,4500,undefined,true);
      this.beat++;this.nextBeat+=spacing;
    }
  }
}
