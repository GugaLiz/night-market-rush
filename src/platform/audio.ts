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
  private combatBus:GainNode|null=null;
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
  private weaponContacts=new Map<number,{count:number;lastCueAt:number;firstHitAt:number}>();
  private lastFanHit=-Infinity;
  private lastPickup=-Infinity;
  private lastCoin=-Infinity;
  private lastAttack=-Infinity;
  private lastCast=new Map<SkillKind,number>();
  private lastShatter=-Infinity;
  private lastClear=-Infinity;
  private lastEnemyShot=-Infinity;
  private lastDash=-Infinity;
  private damageTime=0;
  private recentKills:number[]=[];
  private lastCrowdTime=-Infinity;
  private coinNote=0;
  private sfxVoices=new Set<AudioScheduledSourceNode>();
  private skillVoices=new Set<AudioScheduledSourceNode>();
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
        this.combatBus=c.createGain();this.combatBus.connect(this.sfxBus);
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
    if(settings.muted||settings.sfx===0){
      this.stopSources(this.skillVoices);this.stopSources(this.sfxVoices);
      this.weaponContacts.clear();
    }
  }
  setScene(scene:Scene):void{
    if(this.scene===scene)return;
    this.scene=scene;this.stopSources(this.musicVoices);
    this.stopSources(this.skillVoices);
    this.lastCast.clear();this.lastShatter=-Infinity;this.lastClear=-Infinity;
    this.weaponContacts.clear();this.lastFanHit=-Infinity;this.lastWeaponHit=-Infinity;
    if(this.context&&this.combatBus){
      this.combatBus.gain.cancelScheduledValues(this.context.currentTime);
      this.combatBus.gain.setValueAtTime(1,this.context.currentTime);
    }
    if(scene==='paused'||scene==='silent')this.stopSources(this.sfxVoices);
    this.recentKills=[];this.lastCrowdTime=-Infinity;this.coinNote=0;
    if(this.context){this.nextBeat=this.context.currentTime+.05;this.beat=0;}
    this.setSettings(this.settings);
  }
  play(event:SoundEvent):void{
    const c=this.context;if(!c||c.state!=='running'||this.disposed||this.settings.muted||this.settings.sfx===0||this.scene==='silent')return;
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
      if(this.scene!=='play'||now-this.lastShatter<.075)return;
      this.lastShatter=now;
      this.skillFoley(now,.10,.24,4300,1700);
      this.skillTone(1430,now,.12,.16,'triangle',710);
      return;
    }
    if(event.type==='iceShards'){
      if(this.scene==='play')this.skillFoley(now,.18,.24,1800,5200);
      return;
    }
    if(event.type==='dispatchClear'){
      if(this.scene!=='play'||now-this.lastClear<.12)return;
      this.lastClear=now;
      this.skillTone(1420,now,.055,.14,'sine',720);
      this.skillFoley(now,.06,.18,3200,1600);
      return;
    }
    if(event.type==='dash'){
      if(this.scene!=='play'||now-this.lastDash<.15)return;
      this.lastDash=now;
      this.note(275,now,.050,.16,'triangle',130);
      this.friction(now,.105,.23,2500,670);return;
    }
    if(event.type==='enemyShot'){if(now-this.lastEnemyShot<.08)return;this.lastEnemyShot=now;this.note(490,now,.095,.16,'sine',165);this.noiseBurst(now,.055,.075,1550,550);return;}
    if(event.type==='giantLand'){
      const heavy=event.hop===3;
      this.note(heavy?118:143,now,heavy?.29:.15,heavy?.29:.19,'sine',49);
      this.noiseBurst(now+.012,heavy?.32:.15,.16,1450,300);
      return;
    }
    if(event.type==='elementalBurst'){
      if(this.scene!=='play')return;
      this.makeRoomForSkill(now);
      if(event.kind==='vortex'){
        this.skillTone(138,now,.38,.31,'sine',38);
        this.skillFoley(now,.19,.27,1850,340);
        this.skillTone(418,now+.025,.25,.20,'triangle',178);
      }else{
        this.skillFoley(now,.14,.29,5800,1500);
        [1480,2230,2920].forEach((f,i)=>this.skillTone(f,now+i*.028,.19-i*.03,.17-i*.022,'sine',f*.83));
      }
      return;
    }
    if(event.type==='guardBeat'){
      if(this.scene!=='play')return;
      if(event.beat==='summon'){
        // The stall bell answers when the first helper actually arrives.
        this.skillTone(734,now,.14,.19,'triangle',699);
        this.skillTone(981,now+.105,.19,.18,'sine',948);
        return;
      }
      switch(event.kind){
        case 'epicHotpot':
          this.skillTone(207,now,.25,.22,'sine',72);
          this.skillFoley(now+.015,.24,.17,1600,510);break;
        case 'epicDragon':
          this.skillTone(415,now,.16,.13,'triangle',910);
          this.skillFoley(now+.045,.22,.21,900,3600);break;
        case 'epicOpera':
          this.skillTone(1073,now,.14,.15,'triangle',545);
          this.skillTone(895,now+.082,.12,.13,'triangle',388);break;
        case 'epicPearl':
          [261,358,312].forEach((pitch,i)=>this.skillTone(pitch,now+i*.067,.105,.18,'sine',pitch*1.7));break;
        case 'epicSteamer':
          this.skillTone(149,now,.21,.23,'triangle',69);
          this.skillFoley(now+.035,.30,.22,780,2450);break;
      }
      return;
    }
    if(event.type==='ultimateBeat'){
      if(this.scene!=='play')return;
      if(event.kind!=='express'||event.beat%EXPRESS.legsPerOrder===0)this.makeRoomForSkill(now);
      switch(event.kind){
        case 'icebox':
          [1260,1640,2210].forEach((pitch,i)=>this.skillTone(pitch,now+i*.045,.15,.17,'triangle',pitch*.64));
          this.skillFoley(now,.32,.31,3200,820);break;
        case 'steamer':
          this.skillTone(470,now,.16,.24,'triangle',190);this.skillTone(126,now,.32,.29,'sine',52);
          this.skillFoley(now+.024,.50,.35,1100,3150);break;
        case 'express':{
          const last=event.beat===EXPRESS.legs;
          const delivered=event.beat%EXPRESS.legsPerOrder===0;
          this.skillTone(delivered?210:380,now,delivered?.20:.095,delivered?.29:.15,'triangle',delivered?72:156);
          this.skillFoley(now,delivered?.17:.09,delivered?.24:.17,2300,610);
          if(delivered){
            const receipt=(event.beat/EXPRESS.legsPerOrder)-1;
            this.skillTone(midi(72+receipt*2),now+.055,.14,.18,'sine');
            this.skillTone(midi(last?84:79),now+.15,last?.32:.16,.16,'sine');
          }
          break;
        }
        case 'berry':
          this.skillTone(970,now,.075,.30,'triangle',278);this.skillTone(188,now+.022,.32,.33,'sine',49);
          this.skillFoley(now+.034,.32,.35,2900,760);
          [520,790,630].forEach((f,i)=>this.skillTone(f,now+.11+i*.060,.105,.14,'sine',f*1.4));break;
      }
      return;
    }
    if(event.type==='kill'){
      // Keep the weapon's contact audible when its first victim also dies on this beat.
      const weaponKill=WEAPON_KINDS.includes(event.source as WeaponKind)&&now-this.lastWeaponHit<.09;
      const killGain=weaponKill ? .58 : 1;
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
      // Leave the first instant to the material contact, especially for one-hit snacks.
      const tailAt=weaponKill&&(event.source==='tongs'||event.source==='chopsticks')?now+.035:now;
      this.note(event.kind==='bowl'?180:340,tailAt,.07,.14*killGain,'triangle',100);
      this.noiseBurst(tailAt,.065,.08*killGain,1500);return;
    }
    if(event.type==='warn'){
      if(now-this.lastWarn<.18)return;this.lastWarn=now;
      this.note(740,now,.09,.15,'triangle');this.note(880,now+.1,.08,.12,'triangle');return;
    }
    if(event.type==='pickup'){
      if(event.kind==='fan'){
        if(this.scene!=='play')return;
        // The delivery latch sounds on collection, even when the fan hits empty paving.
        this.skillTone(1740,now,.036,.23,'triangle',810);
        this.skillFoley(now+.014,.037,.19,2650,1050);
        return;
      }
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
      if(this.scene!=='play'||now-this.lastAttack<.035)return;this.lastAttack=now;
      this.weaponRelease(event.kind,now);return;
    }
    if(event.type==='damage'){
      if(event.amount<=0||(this.scene!=='play'&&event.victimId!==0))return;
      if(event.time<this.damageTime){this.recentKills=[];this.lastCrowdTime=-Infinity;this.weaponContacts.clear();}
      this.damageTime=event.time;
      if(event.victimId===0){
        this.stopSources(this.sfxVoices);this.note(145,now,.16,.28,'triangle',80);this.noiseBurst(now,.13,.18,650,280);
      }else if(event.source==='fan'){
        if(now-this.lastFanHit<.14)return;
        const castAt=this.lastCast.get('fan')??-Infinity;
        const first=this.lastFanHit<castAt;
        this.lastFanHit=now;
        if(first){
          // A point-blank hit shares a tick with pickup. Let the latch and rotor speak first.
          const at=Math.max(now,castAt+.058);
          this.skillFoley(at,.09,.25,1400,510);
          this.skillTone(425,at,.10,.25,'triangle',165);
        }else{
          this.noiseBurst(now,.10,.14,1750,700);
          this.note(260,now,.075,.12,'triangle',125);
        }
      }else if(event.source==='poison'){
        if(now-this.lastHit<.16)return;
        this.lastHit=now;
        this.note(354,now,.083,.11,'sine',650);
        this.noiseBurst(now+.03,.067,.07,760,1480);
      }else if(WEAPON_KINDS.includes(event.source as WeaponKind)){
        if((event.burstIndex??1)!==1)return;
        if(event.attackId!==undefined&&(event.source==='tongs'||event.source==='chopsticks')){
          this.playWeaponContacts(event.source,event.attackId,event.time,now);
          return;
        }
        if(now-this.lastWeaponHit<.085)return;
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
      if(this.scene!=='play'||now-(this.lastCast.get(event.kind)??-Infinity)<.09)return;
      this.lastCast.set(event.kind,now);
      if(event.kind==='fan')this.lastFanHit=-Infinity;
      this.makeRoomForSkill(now);
      const motorDelay=event.kind==='fan'&&event.pickupFrom ? .026 : 0;
      this.skillSound(event.kind,now+motorDelay);return;
    }
    if(event.type==='fail'){
      this.stopSources(this.sfxVoices);this.stopSources(this.musicVoices);this.stopSources(this.skillVoices);
      this.note(180,now,.22,.33,'triangle',70);this.noiseBurst(now,.18,.2,600);
      [64,60,55].forEach((n,i)=>this.note(midi(n),now+.16+i*.12,.25,.21,'triangle'));return;
    }
    if(event.type==='wave'){
      [62,69,74].forEach((n,i)=>this.note(midi(n),now+i*.085,.21,.13,'triangle'));return;
    }
    if(event.type==='stage'){
      [67,72].forEach((n,i)=>this.note(midi(n),now+i*.08,.16,.11,'sine'));return;
    }
    if(event.type==='skillEnd'&&this.scene==='play'){
      switch(event.kind){
        case 'skate':this.skillFoley(now,.14,.14,1600,480);break;
        case 'bubble':this.skillTone(625,now,.12,.14,'sine',178);break;
        case 'heat':this.skillFoley(now,.20,.13,2400,640);break;
        case 'stamp':this.skillTone(420,now,.08,.14,'triangle',192);break;
        case 'hook':this.skillFoley(now,.10,.15,3400,790);this.skillTone(704,now+.08,.05,.12,'triangle');break;
        case 'dispatch':this.skillTone(784,now,.12,.13,'sine',523);break;
      }
    }
  }
  private weaponRelease(kind:WeaponKind,at:number):void{
    switch(kind){
      case 'tongs': // An unloaded spring and a little air. The jaws clap only on contact.
        this.friction(at,.083,.115,1450,3250);
        this.note(1390,at+.007,.041,.085,'sine',1160);
        break;
      case 'bag': // Air pressure behind a crinkling kraft bag.
        this.friction(at,.043,.31,3100,1250);
        this.note(172,at+.024,.16,.32,'sine',48);
        this.friction(at+.026,.20,.30,1300,260);
        break;
      case 'chopsticks': // The bundle slides out in one stroke; targets supply the subsequent taps.
        this.note(1210,at,.039,.14,'triangle',890);
        this.friction(at,.063,.10,3500,1900);
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
  private playWeaponContacts(kind:'tongs'|'chopsticks',attackId:number,time:number,now:number):void{
    let contact=this.weaponContacts.get(attackId);
    if(!contact){
      // Both weapons finish their flight in under one simulation second, including the windup.
      for(const [id,other] of this.weaponContacts)if(time-other.firstHitAt>1)this.weaponContacts.delete(id);
      contact={count:0,lastCueAt:-Infinity,firstHitAt:time};
      this.weaponContacts.set(attackId,contact);
    }
    if(contact.count>=3)return;
    // Reserve the last bamboo knock for the back row. At flight speed this is about
    // 100 world units beyond the first target, regardless of how many lanes hit at once.
    if(kind==='chopsticks'&&contact.count===2&&time-contact.firstHitAt<.14)return;
    const at=Math.max(now,contact.lastCueAt+.038);
    contact.count++;
    contact.lastCueAt=at;
    this.lastWeaponHit=now;
    if(contact.count===1){
      this.weaponImpact(kind,at);
    }else if(kind==='chopsticks'){
      // A dry wooden reply at the next real penetration. Dense lanes fit in three short taps.
      const middle=contact.count===2;
      this.note(middle ? 710 : 520,at,.052,middle ? .17 : .21,'triangle',middle ? 395 : 280);
      this.friction(at,.033,.10,2050,960);
    }else{
      const last=contact.count===3;
      this.note(last ? 390 : 510,at,last ? .11 : .073,last ? .28 : .18,'triangle',last ? 145 : 270);
      this.friction(at,.065,last ? .23 : .15,1250,510);
    }
  }
  private weaponImpact(kind:WeaponKind,at:number):void{
    switch(kind){
      case 'tongs':
        this.note(1830,at,.039,.19,'triangle',920);
        this.friction(at+.005,.078,.31,1550,530);
        this.note(438,at+.008,.115,.34,'triangle',146);
        break;
      case 'bag':
        this.note(132,at,.145,.30,'sine',44);
        this.friction(at,.083,.34,2300,620);
        break;
      case 'chopsticks':
        this.note(1020,at,.045,.27,'triangle',540);
        this.friction(at,.047,.18,2300,980);
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
    this.noiseBurst(at,duration,volume,cutoff,endCutoff,this.sfxVoices,this.frictionNoise);
  }
  private makeRoomForSkill(at:number):void{
    // Give the attack a brief gap in the combat mix without cutting the weapon or music.
    const gain=this.combatBus?.gain;
    if(!gain)return;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(.56,at,.012);
    gain.setTargetAtTime(1,at+.21,.075);
  }
  private skillTone(frequency:number,at:number,duration:number,volume:number,wave:OscillatorType='triangle',endFrequency?:number):void{
    this.note(frequency,at,duration,volume,wave,endFrequency,this.skillVoices);
  }
  private skillFoley(at:number,duration:number,volume:number,cutoff:number,endCutoff:number):void{
    this.noiseBurst(at,duration,volume,cutoff,endCutoff,this.skillVoices,this.frictionNoise);
  }
  private skillSound(kind:SkillKind,at:number):void{
    switch(kind){
      case 'icebox': // Two lid latches release before the ice front moves.
        this.skillTone(780,at,.061,.22,'triangle',410);
        this.skillTone(1670,at+.043,.13,.19,'sine');
        this.skillFoley(at+.065,.15,.25,970,3900);
        break;
      case 'steamer':
        this.skillTone(326,at,.085,.26,'triangle',132);
        this.skillFoley(at+.034,.12,.25,540,2500);
        break;
      case 'express': // Scanner answers, then the first parcel leaves.
        this.skillTone(1130,at,.068,.18,'sine');
        this.skillTone(1510,at+.078,.11,.18,'sine');
        this.skillFoley(at+.12,.26,.30,920,3100);
        break;
      case 'berry': // Opening the bottle and the actual burst are separate core events.
        this.skillTone(1270,at,.044,.20,'triangle',510);
        this.skillFoley(at+.018,.17,.32,1300,4700);
        break;
      case 'vortex':
        this.skillTone(485,at,.19,.22,'triangle',156);
        this.skillFoley(at+.04,.67,.32,460,2300);
        this.skillTone(132,at+.06,.85,.23,'sine',242);
        this.skillTone(512,at+.29,.49,.13,'sine',171);
        break;
      case 'poison':
        this.skillTone(390,at,.09,.22,'sine',125);
        this.skillFoley(at+.035,.46,.24,790,2350);
        [230,340,280].forEach((f,i)=>this.skillTone(f,at+.075+i*.082,.12,.18,'sine',f*1.8));
        break;
      case 'frost':
        this.skillFoley(at,.34,.28,1540,4500);
        [660,990,1320,1980].forEach((f,i)=>this.skillTone(f,at+.025+i*.073,.30,.15,'sine'));
        break;
      case 'fan':
        this.skillTone(159,at,.35,.21,'triangle',320);
        this.skillFoley(at,.29,.26,620,2450);
        this.skillFoley(at+.18,.36,.18,2100,730);
        break;
      case 'skate':
        this.skillFoley(at,.27,.28,2500,550);
        [420,550,685].forEach((f,i)=>this.skillTone(f,at+i*.072,.16,.15,'triangle',f*1.22));
        break;
      case 'soda':
        this.skillTone(890,at,.05,.22,'triangle',370);
        this.skillFoley(at+.034,.34,.28,3100,1700);
        [.14,.24,.32].forEach((t,i)=>this.skillTone(420+i*80,at+t,.078,.13,'sine',680+i*110));
        break;
      case 'lure':
        this.skillTone(325,at,.075,.22,'triangle',143);
        this.skillFoley(at+.035,.09,.19,1250,510);
        this.skillTone(915,at+.12,.25,.18,'sine',1080);
        break;
      case 'bubble':
        this.skillFoley(at,.21,.21,4000,1700);
        [450,600,750].forEach((f,i)=>this.skillTone(f,at+i*.061,.18,.17,'sine',f*1.6));
        break;
      case 'cones':
        [0,.074,.17,.31].forEach((t,i)=>{
          this.skillTone(310-i*26,at+t,.095,.20,'triangle',86);
          this.skillFoley(at+t,.052,.15,1170,540);
        });
        break;
      case 'bell':
        [0,.19].forEach((t,i)=>{
          this.skillTone(1319,at+t,.47,.23-i*.05,'sine');
          this.skillTone(2135,at+t+.008,.29,.12-i*.025,'sine');
        });
        break;
      case 'route':
        this.skillFoley(at,.23,.23,2300,4200);
        this.skillTone(659,at+.09,.13,.18,'sine');this.skillTone(988,at+.22,.22,.18,'sine');
        break;
      case 'hook':
        this.skillTone(562,at,.062,.25,'triangle',292);
        this.skillFoley(at+.035,.26,.25,1480,4500);
        this.skillTone(1350,at+.26,.12,.17,'sine',880);
        break;
      case 'heat':
        this.skillFoley(at,.12,.26,2500,730);
        this.skillTone(230,at+.04,.32,.18,'triangle',475);
        this.skillFoley(at+.14,.41,.19,1600,3800);
        break;
      case 'dispatch':
        [1046,784,1319].forEach((f,i)=>this.skillTone(f,at+i*.105,.11,.21,'sine'));
        this.skillFoley(at+.22,.13,.12,2800,1400);
        break;
      case 'stamp':
        this.skillTone(410,at,.07,.26,'triangle',138);
        this.skillTone(158,at+.015,.18,.28,'sine',62);
        this.skillFoley(at,.082,.28,1890,550);
        this.skillTone(830,at+.14,.13,.14,'sine');
        break;
      case 'supply':
        this.skillFoley(at,.16,.22,3200,1300);
        [1280,1680].forEach((f,i)=>this.skillTone(f,at+.12+i*.09,.105,.18,'sine'));
        this.skillTone(590,at+.31,.12,.14,'triangle',320);
        break;
      case 'health': // Spoon against a soup bowl. The healing amount has its own rising answer.
        this.skillTone(946,at,.22,.22,'sine');
        this.skillTone(2150,at+.014,.12,.10,'sine');
        this.skillTone(396,at+.105,.14,.14,'sine',545);
        break;
      default:return kind satisfies never;
    }
  }
  dispose():void{
    this.disposed=true;if(this.scheduler)clearInterval(this.scheduler);this.scheduler=null;
    this.stopSources(this.musicVoices);this.stopSources(this.sfxVoices);this.stopSources(this.skillVoices);
    if(this.context)this.setPlaybackSession(false);
    void this.context?.close().catch(()=>{});this.context=null;
  }
  private stopSources(sources:Set<AudioScheduledSourceNode>):void{for(const source of sources){try{source.stop();}catch{/* already stopped */}}sources.clear();}
  private track(source:AudioScheduledSourceNode,set:Set<AudioScheduledSourceNode>):void{
    if(set!==this.musicVoices&&set.size>=18){const first=set.values().next().value as AudioScheduledSourceNode|undefined;if(first){try{first.stop();}catch{}set.delete(first);}}
    set.add(source);source.onended=()=>{set.delete(source);source.disconnect();};
  }
  private voiceBus(voices:Set<AudioScheduledSourceNode>):GainNode|null{
    if(voices===this.musicVoices)return this.musicBus;
    return voices===this.skillVoices?this.sfxBus:this.combatBus;
  }
  private note(frequency:number,at:number,duration:number,volume:number,wave:OscillatorType='triangle',endFrequency?:number,voices=this.sfxVoices):void{
    const c=this.context,bus=this.voiceBus(voices);if(!c||!bus)return;
    const o=c.createOscillator(),gain=c.createGain();o.type=wave;o.frequency.setValueAtTime(frequency,at);
    if(endFrequency)o.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.009);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(gain);gain.connect(bus);this.track(o,voices);const old=o.onended;o.onended=(e)=>{if(typeof old==='function')old.call(o,e);gain.disconnect();};
    o.start(at);o.stop(at+duration+.02);
  }
  private noiseBurst(at:number,duration:number,volume:number,cutoff:number,endCutoff?:number,voices=this.sfxVoices,buffer=this.noise):void{
    const c=this.context,bus=this.voiceBus(voices);if(!c||!bus||!buffer)return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;
    filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(cutoff,at);
    if(endCutoff)filter.frequency.exponentialRampToValueAtTime(endCutoff,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus);this.track(source,voices);
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
      if(melody[i]){this.note(midi(melody[i]),at,spacing*1.4,.14,'triangle',undefined,this.musicVoices);this.note(midi(melody[i]+12),at+.005,spacing*.65,.025,'sine',undefined,this.musicVoices);}
      if(i%4===0)this.note(midi(bass[Math.floor(i/8)]),at,spacing*3,.22,'sine',undefined,this.musicVoices);
      if(this.scene==='play'&&i%2===1)this.noiseBurst(at,.05,.08,4500,undefined,this.musicVoices);
      this.beat++;this.nextBeat+=spacing;
    }
  }
}
