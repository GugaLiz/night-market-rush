import {DEFAULT_SETTINGS,WEAPON_KINDS,type WeaponKind,type SkillKind,type GameEvent,type Settings} from '../shared/types';
import {EXPRESS} from '../core/ultimates';

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
  private frictionNoise:AudioBuffer|null=null;
  private settings:Settings={...DEFAULT_SETTINGS};
  private scene:Scene='home';
  private scheduler:ReturnType<typeof setInterval>|null=null;
  private nextBeat=0;
  private beat=0;
  private lastKill=-Infinity;
  private lastWarn=-Infinity;
  private lastUI=-Infinity;
  private lastHit=-Infinity;
  private lastWeaponHit=-Infinity;
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
    if(this.disposed||this.settings.muted)return;
    try{
      if(!this.context){
        const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!Constructor)return;
        const c=this.context=new Constructor();
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-7;limiter.knee.value=12;limiter.ratio.value=7;limiter.attack.value=.003;limiter.release.value=.15;
        this.master=c.createGain();this.musicBus=c.createGain();this.sfxBus=c.createGain();
        this.musicBus.connect(this.master);this.sfxBus.connect(this.master);this.master.connect(limiter);limiter.connect(c.destination);
        this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
        this.frictionNoise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
        const friction=this.frictionNoise.getChannelData(0);
        const samples=this.noise.getChannelData(0);let last=0;
        for(let i=0;i<samples.length;i++){
          friction[i]=Math.random()*2-1;
          last=(last+friction[i]*.05)/1.03;samples[i]=last*3.5;
        }
        this.setSettings(this.settings);
      }
      const context=this.context;
      if(context.state!=='running')await context.resume();
      if(this.disposed||context.state!=='running'||this.scheduler!==null)return;
      this.nextBeat=context.currentTime+.04;
      this.scheduler=setInterval(()=>this.scheduleMusic(),40);
    }catch{/* Muted gameplay is valid when browser audio is unavailable. */}
  }
  private setPlaybackSession(active:boolean):void{
    // On iPhone the default ambient session follows the ringer switch.
    try{
      const session=(navigator as Navigator&{audioSession?:{type:string}}).audioSession;
      const type=active?'playback':'auto';
      if(session&&session.type!==type)session.type=type;
    }catch{/* The browser may manage the session itself. */}
  }
  setSettings(settings:Settings):void{
    this.settings={...settings};if(!this.context||!this.master||!this.musicBus||!this.sfxBus)return;
    this.setPlaybackSession(!settings.muted&&(settings.music>0||settings.sfx>0)&&this.scene!=='silent');
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
    if(event.type==='market'){
      if(event.action==='open'){
        const pitches=event.group==='final'?[74,69,62]:[74,81];
        pitches.forEach((pitch,i)=>this.note(midi(pitch),now+i*.15,.34,.16,'sine'));
      }else if(event.action==='sign'){
        this.friction(now,.06,.18,1500,420);
        this.note(160,now,.09,.22,'triangle',75);
        this.note(1175,now+.06,.31,.15,'sine');
      }else if(event.action==='closing'){
        [69,74,78,81].forEach((pitch,i)=>this.note(midi(pitch),now+.18+i*.11,.29,.14,'triangle'));
      }
      return;
    }
    if(event.type==='frostShatter'){
      this.friction(now,.10,.19,4300,1700);
      this.note(1430,now,.12,.11,'triangle',710);
      return;
    }
    if(event.type==='dash'){if(now-this.lastDash<.15)return;this.lastDash=now;this.noiseBurst(now,.18,.2,900,3800);this.note(180,now,.12,.16,'triangle',420);return;}
    if(event.type==='enemyShot'){if(now-this.lastEnemyShot<.08)return;this.lastEnemyShot=now;this.note(490,now,.095,.16,'sine',165);this.noiseBurst(now,.055,.075,1550,550);return;}
    if(event.type==='giantLand'){
      const heavy=event.hop===3;
      this.note(heavy?118:143,now,heavy?.29:.15,heavy?.29:.19,'sine',49);
      this.noiseBurst(now+.012,heavy?.32:.15,.16,1450,300);
      return;
    }
    if(event.type==='elementalBurst'){
      if(event.kind==='vortex'){
        this.note(138,now,.38,.31,'sine',38);
        this.friction(now,.19,.24,1850,340);
        this.note(418,now+.025,.25,.11,'triangle',178);
      }else{
        this.friction(now,.14,.26,5800,1500);
        [1480,2230,2920].forEach((f,i)=>this.note(f,now+i*.028,.19-i*.03,.13-i*.022,'sine',f*.83));
      }
      return;
    }
    if(event.type==='ultimateBeat'){
      switch(event.kind){
        case 'icebox':
          [1260,1640,2210].forEach((pitch,i)=>this.note(pitch,now+i*.045,.11,.11,'triangle',pitch*.64));
          this.noiseBurst(now,.28,.19,3200,1100);break;
        case 'steamer':
          this.note(470,now,.10,.17,'triangle',190);this.note(107,now,.28,.22,'sine',52);
          this.noiseBurst(now+.024,.42,.22,800,2200);break;
        case 'express':{
          const last=event.beat===EXPRESS.legs;
          const stamp=(event.beat-1)%EXPRESS.legsPerOrder+1;
          this.note(last?130:260+stamp*45,now,last?.23:.085,last?.25:.16,'triangle',last?55:155);
          this.noiseBurst(now,last?.14:.055,.14,2300,610);break;
        }
        case 'berry':
          this.note(970,now,.065,.23,'triangle',278);this.note(142,now+.022,.25,.28,'sine',45);
          this.noiseBurst(now+.034,.28,.21,2400,760);
          [520,790,630].forEach((f,i)=>this.note(f,now+.08+i*.052,.08,.08,'sine',f*1.4));break;
      }
      return;
    }
    if(event.type==='kill'){
      // Keep the weapon's contact audible when its first victim also dies on this beat.
      const killGain=WEAPON_KINDS.includes(event.source as WeaponKind)&&now-this.lastWeaponHit<.09?.58:1;
      this.recentKills=this.recentKills.filter(t=>t>=this.damageTime-.15);
      this.recentKills.push(this.damageTime);
      if(this.recentKills.length>=3&&this.damageTime-this.lastCrowdTime>.28){
        this.lastCrowdTime=this.damageTime;this.lastKill=now;
        // One pot-lid crack, a short low drum and a scattering tail for the whole cluster.
        this.note(265,now,.14,.26*killGain,'triangle',79);
        this.note(106,now+.015,.27,.31*killGain,'sine',44);
        this.noiseBurst(now,.085,.22*killGain,3100,850);
        this.noiseBurst(now+.075,.19,.17*killGain,1300,380);
        this.note(492,now+.11,.11,.065*killGain,'triangle',305);return;
      }
      if(this.damageTime-this.lastCrowdTime<.15)return;
      if(now-this.lastKill<.055)return;this.lastKill=now;
      this.note(event.kind==='bowl'?180:340,now,.07,.14*killGain,'triangle',100);
      this.noiseBurst(now,.065,.08*killGain,1500);return;
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
      this.weaponRelease(event.kind,now);return;
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
      }else if(event.source==='poison'){
        if(now-this.lastHit<.16)return;
        this.lastHit=now;
        this.note(354,now,.083,.11,'sine',650);
        this.noiseBurst(now+.03,.067,.07,760,1480);
      }else if(WEAPON_KINDS.includes(event.source as WeaponKind)){
        // One contact for a volley or a cluster. A later bounce can still answer the first hit.
        if((event.burstIndex??1)!==1||now-this.lastWeaponHit<.085)return;
        this.lastWeaponHit=now;
        this.weaponImpact(event.source as WeaponKind,now);
      }else if(now-this.lastHit>=.065){
        this.lastHit=now;
        this.note(event.source==='skate'?260:190,now,.07,.12,'triangle',100);this.noiseBurst(now,.055,.065,1600);
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
  private weaponRelease(kind:WeaponKind,at:number):void{
    switch(kind){
      case 'tongs': // Spring hinge, two steel jaws meeting over the swish.
        this.friction(at,.095,.18,1650,5300);
        this.note(1270,at+.008,.038,.19,'triangle',1040);
        this.note(2060,at+.045,.073,.14,'sine',1930);
        break;
      case 'bag': // Air pressure behind a crinkling kraft bag.
        this.friction(at,.043,.31,3100,1250);
        this.note(172,at+.024,.16,.32,'sine',48);
        this.friction(at+.026,.20,.30,1300,260);
        break;
      case 'chopsticks': // Three dry bamboo taps across the fan.
        [1120,855,1420].forEach((f,i)=>this.note(f,at+i*.028,.036,.20-i*.026,'triangle',f*.55));
        break;
      case 'spirit': // Pour, then two bubbles emerging from the thermos.
        this.friction(at,.19,.14,640,1740);
        this.note(285,at,.14,.24,'sine',620);
        this.note(525,at+.068,.095,.17,'sine',988);
        break;
      case 'knife': // Zipper-like tear of a packaging seal.
        this.friction(at,.115,.39,1600,7200);
        this.friction(at+.045,.065,.17,5900,2900);
        this.note(1790,at+.008,.041,.10,'triangle',810);
        break;
      case 'tray': // A spinning piece of crockery, with an inharmonic overtone.
        this.note(745,at,.19,.18,'sine',1090);
        this.note(1670,at,.12,.09,'sine',1980);
        this.friction(at+.048,.14,.17,2150,650);
        break;
      case 'umbrella': // Lock opens, canopy fills with air, last rib clicks into place.
        this.note(730,at,.036,.18,'triangle',310);
        this.friction(at+.020,.19,.37,780,1850);
        this.note(178,at+.070,.14,.24,'triangle',91);
        this.note(560,at+.103,.035,.115,'triangle',355);
        break;
      case 'sword': // A broad swing followed by the flexing steel ruler.
        this.friction(at,.20,.27,2950,440);
        this.note(225,at+.011,.21,.25,'triangle',120);
        this.note(581,at+.014,.15,.13,'sine',331);
        break;
      case 'lunchbox': // The two latches rattle before the parcel leaves the spring.
        this.note(830,at,.034,.20,'triangle',440);
        this.note(610,at+.031,.042,.17,'triangle',375);
        this.note(155,at+.060,.14,.27,'sine',445);
        break;
      case 'talisman': // Paper leaves riffle in quick succession.
        [3700,4400,3300].forEach((f,i)=>this.friction(at+i*.027,.051,.31-i*.035,f,1600));
        this.note(1220,at+.055,.059,.12,'sine',1580);
        break;
    }
  }
  private weaponImpact(kind:WeaponKind,at:number):void{
    switch(kind){
      case 'tongs':
        this.note(715,at,.057,.26,'triangle',330);
        this.note(1650,at+.009,.092,.13,'sine',1430);
        break;
      case 'bag':
        this.note(132,at,.145,.30,'sine',44);
        this.friction(at,.083,.34,2300,620);
        break;
      case 'chopsticks':
        this.note(685,at,.046,.25,'triangle',380);
        this.note(440,at+.018,.055,.15,'sine',240);
        break;
      case 'spirit':
        this.note(490,at,.10,.24,'sine',178);
        this.note(790,at+.048,.097,.16,'sine',390);
        this.friction(at,.09,.15,1800,610);
        break;
      case 'knife':
        this.friction(at,.065,.43,6900,1500);
        this.note(1030,at,.058,.20,'sawtooth',390);
        break;
      case 'tray':
        this.note(925,at,.20,.23,'sine');
        this.note(2370,at,.12,.09,'sine');
        break;
      case 'umbrella':
        this.friction(at,.095,.34,1220,330);
        this.note(250,at,.12,.28,'triangle',105);
        this.note(540,at+.032,.052,.12,'triangle',270);
        break;
      case 'sword':
        this.note(124,at,.22,.32,'triangle',55);
        this.note(694,at+.009,.19,.16,'sine',605);
        this.friction(at,.075,.22,2800,750);
        break;
      case 'lunchbox':
        this.note(104,at,.205,.34,'sine',39);
        this.friction(at,.11,.31,1600,370);
        this.note(610,at+.052,.062,.14,'triangle',320);
        break;
      case 'talisman': // Rubber stamp on paper followed by an order chime.
        this.note(310,at,.062,.24,'triangle',115);
        this.friction(at,.043,.28,2400,1020);
        this.note(1380,at+.040,.115,.13,'sine');
        break;
    }
  }
  private friction(at:number,duration:number,volume:number,cutoff:number,endCutoff:number):void{
    this.noiseBurst(at,duration,volume,cutoff,endCutoff,false,this.frictionNoise);
  }
  private skillSound(kind:SkillKind,at:number):void{
    switch(kind){
      case 'icebox':this.note(640,at,.045,.12,'triangle',340);break;
      case 'steamer':this.note(250,at,.07,.11,'triangle',165);break;
      case 'express':this.noiseBurst(at,.08,.13,850,2750);break;
      case 'berry':this.noiseBurst(at,.16,.11,1000,3100);break;
      case 'vortex':
        this.note(485,at,.15,.15,'triangle',156);
        this.noiseBurst(at+.04,.65,.18,430,2300);
        this.note(72,at+.06,.85,.20,'sine',135);
        break;
      case 'poison':
        this.note(390,at,.08,.16,'sine',125);
        this.noiseBurst(at+.035,.46,.14,790,2350);
        [230,340,280].forEach((f,i)=>this.note(f,at+.075+i*.082,.09,.13,'sine',f*1.8));
        break;
      case 'frost':
        this.friction(at,.32,.19,1540,4500);
        [660,990,1320,1980].forEach((f,i)=>this.note(f,at+.025+i*.073,.28,.105,'sine'));
        break;
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
    if(this.context)this.setPlaybackSession(false);
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
  private noiseBurst(at:number,duration:number,volume:number,cutoff:number,endCutoff?:number,music=false,buffer=this.noise):void{
    const c=this.context,bus=music?this.musicBus:this.sfxBus;if(!c||!bus||!buffer)return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;
    filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(cutoff,at);
    if(endCutoff)filter.frequency.exponentialRampToValueAtTime(endCutoff,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus);this.track(source,music);
    const old=source.onended;source.onended=(e)=>{if(typeof old==='function')old.call(source,e);filter.disconnect();gain.disconnect();};
    source.start(at);source.stop(at+duration+.02);
  }
  private scheduleMusic():void{
    const c=this.context;if(!c||c.state!=='running'||this.settings.muted||this.settings.music===0||(this.scene!=='home'&&this.scene!=='play'))return;
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
