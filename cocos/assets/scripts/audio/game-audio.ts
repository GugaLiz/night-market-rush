import {AudioClip, AudioSource, Node, resources} from 'cc';
import {DEFAULT_SETTINGS, type Settings} from '../domain/shared/types';
import {CuePolicy, type AudioCue, type AudioScene, type SoundEvent} from './cue-policy';

interface Voice {source:AudioSource;group:'combat'|'skill';freeAt:number;gain:number}
interface Pending {timer:ReturnType<typeof setTimeout>;group:'combat'|'skill'}
const clamp=(value:number)=>Math.min(1,Math.max(0,value));

/** Platform-neutral Cocos audio host. Preload before the first user gesture and
 * call unlock() from that gesture. The host must call setScene on pause, app
 * interruption and resume. Gameplay works when loading/audio is unavailable. */
export class GameAudio {
  private readonly node:Node;
  private readonly music:AudioSource;
  private readonly voices:Voice[]=[];
  private readonly clips=new Map<string,AudioClip>();
  private readonly pending=new Set<Pending>();
  private readonly policy=new CuePolicy();
  private settings:Settings={...DEFAULT_SETTINGS};
  private loading:Promise<boolean>|null=null;
  private ready=false;private unlocked=false;private disposed=false;
  private ducked=false;private duckTimer:ReturnType<typeof setTimeout>|null=null;
  private lastNow=0;

  constructor(parent:Node,private readonly onError?:(message:string)=>void,private readonly clock:()=>number=()=>Date.now()/1000){
    this.node=new Node('Game audio');this.node.layer=parent.layer;parent.addChild(this.node);
    this.music=this.makeSource('Music');this.music.loop=true;
    // Avoid playOneShot: individual sources can be stopped on mute/interruption.
    for(let i=0;i<18;i++)this.voices.push({source:this.makeSource(`Voice ${i+1}`),group:'combat',freeAt:0,gain:1});
  }
  get available():boolean{return this.ready&&this.unlocked&&!this.disposed;}

  preload():Promise<boolean>{
    if(this.disposed)return Promise.resolve(false);
    if(this.ready)return Promise.resolve(true);
    if(this.loading)return this.loading;
    this.loading=new Promise(resolve=>{
      resources.loadDir('audio',AudioClip,(error,assets)=>{
        this.loading=null;
        if(this.disposed){resolve(false);return;}
        if(error){this.onError?.(`音频加载失败：${error.message}`);resolve(false);return;}
        for(const clip of assets)this.clips.set(clip.name,clip);
        const required=['music_home','music_play','ui','start','fail'];
        const missing=required.filter(name=>!this.clips.has(name));
        if(missing.length){this.onError?.(`缺少音频：${missing.join(', ')}`);resolve(false);return;}
        this.ready=true;this.syncMusic();resolve(true);
      });
    });
    return this.loading;
  }
  /** Invoke directly from a TOUCH_END/MOUSE_UP user gesture on Web. */
  unlock():void {if(this.disposed)return;this.unlocked=true;if(!this.ready)void this.preload();else this.syncMusic();}
  setSettings(settings:Settings):void {
    this.settings={...settings};
    if(settings.muted||settings.sfx<=0){this.cancelPending();this.stopVoices();}
    for(const voice of this.voices)this.applyVoiceVolume(voice);
    if(settings.muted||settings.music<=0)this.music.stop();else this.syncMusic();
  }
  setScene(scene:AudioScene):void {
    if(scene===this.policy.scene)return;
    this.policy.setScene(scene);this.music.stop();this.music.clip=null;
    this.cancelPending('skill');this.stopVoices('skill');this.clearDuck();
    if(scene==='paused'||scene==='silent'){this.cancelPending();this.stopVoices();}
    this.syncMusic();
  }
  play(event:SoundEvent):void {
    if(!this.available||this.settings.muted||this.settings.sfx<=0)return;
    const now=this.now(),cue=this.policy.select(event,now);if(!cue)return;
    if(cue.stopAll){this.cancelPending();this.stopVoices();this.music.stop();}
    else if(cue.stopCombat){this.cancelPending('combat');this.stopVoices('combat');}
    if(cue.duck)this.duck();
    if(cue.delay&&cue.delay>0){
      const pending:Pending={group:cue.group,timer:setTimeout(()=>{this.pending.delete(pending);this.playCue(cue);},cue.delay*1000)};
      this.pending.add(pending);
    }else this.playCue(cue);
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.cancelPending();this.clearDuck();this.stopVoices();this.music.stop();
    this.node.destroy();this.clips.clear();
    // resources may be shared by other consumers; do not blanket-release them.
  }
  private makeSource(name:string):AudioSource {
    const node=new Node(name);node.layer=this.node.layer;this.node.addChild(node);
    const source=node.addComponent(AudioSource);source.playOnAwake=false;return source;
  }
  private now():number {const current=this.clock();if(Number.isFinite(current))this.lastNow=Math.max(this.lastNow,current);return this.lastNow;}
  private syncMusic():void {
    if(!this.available||this.settings.muted||this.settings.music<=0)return;
    const scene=this.policy.scene;if(scene!=='home'&&scene!=='play')return;
    const clip=this.clips.get(`music_${scene}`);if(!clip){this.onError?.(`缺少音乐：${scene}`);return;}
    this.music.volume=clamp(this.settings.music*.72*(scene==='play'?.33:.25));
    if(this.music.clip!==clip){this.music.clip=clip;this.music.play();}
    else if(!this.music.playing)this.music.play();
  }
  private playCue(cue:AudioCue):void {
    if(!this.available||this.settings.muted||this.settings.sfx<=0||this.policy.scene==='silent')return;
    const clip=this.clips.get(cue.name);if(!clip){this.onError?.(`缺少音效：${cue.name}`);return;}
    const now=this.now();let voice=this.voices.find(item=>item.freeAt<=now);
    if(!voice)voice=this.voices.reduce((oldest,item)=>item.freeAt<oldest.freeAt?item:oldest);
    voice.source.stop();voice.group=cue.group;voice.gain=cue.gain??1;voice.freeAt=now+Math.max(.05,clip.getDuration())+.05;
    this.applyVoiceVolume(voice);voice.source.clip=clip;voice.source.play();
  }
  private applyVoiceVolume(voice:Voice):void {
    voice.source.volume=this.settings.muted?0:clamp(this.settings.sfx*.72*.7*voice.gain*(this.ducked&&voice.group==='combat'?.56:1));
  }
  private stopVoices(group?:Voice['group']):void {
    for(const voice of this.voices)if(!group||voice.group===group){voice.source.stop();voice.freeAt=0;}
  }
  private cancelPending(group?:Pending['group']):void {
    for(const item of [...this.pending])if(!group||item.group===group){clearTimeout(item.timer);this.pending.delete(item);}
  }
  private duck():void {
    this.clearDuck();this.ducked=true;for(const voice of this.voices)this.applyVoiceVolume(voice);
    this.duckTimer=setTimeout(()=>{this.duckTimer=null;this.ducked=false;for(const voice of this.voices)this.applyVoiceVolume(voice);},210);
  }
  private clearDuck():void {
    if(this.duckTimer!==null)clearTimeout(this.duckTimer);this.duckTimer=null;this.ducked=false;
    for(const voice of this.voices)this.applyVoiceVolume(voice);
  }
}
