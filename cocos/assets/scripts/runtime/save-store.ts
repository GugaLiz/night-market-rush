import { DEFAULT_SETTINGS, RULES_VERSION, type BestRecord, type SaveData, type Settings } from '../domain/shared/types';

export interface StorageLike { getItem(key:string):string|null; setItem(key:string,value:string):void }
export const SAVE_KEY='night-market-rush.save.v4';
const LEGACY_SAVE_KEY='night-market-rush.save.v1';
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const isObject=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const clamp=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback;

export function sanitizeSettings(value:unknown):Settings {
  const s=isObject(value)?value:{};
  const pick=<T extends string>(key:string,choices:readonly T[],fallback:T):T=>choices.includes(s[key] as T)?s[key] as T:fallback;
  const bool=(key:string,fallback:boolean)=>typeof s[key]==='boolean'?s[key] as boolean:fallback;
  return {
    mode:pick('mode',['joystick','tilt'],DEFAULT_SETTINGS.mode),
    joystickSize:pick('joystickSize',['small','medium','large'],DEFAULT_SETTINGS.joystickSize),
    hand:pick('hand',['left','right'],DEFAULT_SETTINGS.hand),
    sensitivity:pick('sensitivity',['low','medium','high'],DEFAULT_SETTINGS.sensitivity),
    music:clamp(s.music,DEFAULT_SETTINGS.music),sfx:clamp(s.sfx,DEFAULT_SETTINGS.sfx),
    muted:bool('muted',DEFAULT_SETTINGS.muted),reduceMotion:bool('reduceMotion',DEFAULT_SETTINGS.reduceMotion),
    shake:bool('shake',DEFAULT_SETTINGS.shake),quality:pick('quality',['standard','simple'],DEFAULT_SETTINGS.quality),
    haptics:bool('haptics',bool('shake',DEFAULT_SETTINGS.haptics)),
  };
}

function validBest(value:unknown):value is BestRecord {
  return isObject(value)&&Number.isSafeInteger(value.score)&&Number(value.score)>=0&&
    typeof value.time==='number'&&Number.isFinite(value.time)&&value.time>=0&&
    typeof value.rulesVersion==='string'&&value.rulesVersion.length>0&&
    typeof value.date==='string'&&Number.isFinite(Date.parse(value.date));
}
function defaults():SaveData { return {version:1,settings:{...DEFAULT_SETTINGS},best:null,tutorialSeen:false}; }
function wins(a:BestRecord,b:BestRecord|null):boolean {return !b||a.score>b.score||(a.score===b.score&&a.time>b.time);}

/** The host storage is optional: storage denial never prevents play. */
export class SaveStore {
  private current:SaveData=defaults();
  private storage:StorageLike|null;
  private loaded=false;
  private protectedData=false;
  // Preserve an explicit settings change until some later persistence succeeds.
  private pendingSettings=false;
  private lastWriteFailed=false;
  private backupCounter=0;
  constructor(storage:StorageLike|null){this.storage=storage;}
  get data():SaveData {if(!this.loaded)this.load();return clone(this.current);}
  get persistenceAvailable():boolean {return !!this.storage&&!this.protectedData&&!this.lastWriteFailed;}
  private preserve(raw:string,label:string):boolean {
    if(!this.storage)return false;
    try{
      const stamp=Date.now();
      for(let attempt=0;attempt<1024;attempt++){
        const key=`${SAVE_KEY}.${label}.${stamp}.${this.backupCounter++}`;
        const existing=this.storage.getItem(key);
        if(existing===null){this.storage.setItem(key,raw);return true;}
        if(typeof existing!=='string')return false;
      }
      return false;
    }
    catch{return false;}
  }
  load():SaveData {
    if(this.loaded)return clone(this.current);
    this.loaded=true;
    if(!this.storage)return clone(this.current);
    let raw:string|null;
    try{raw=this.storage.getItem(SAVE_KEY);}catch{this.storage=null;return clone(this.current);}
    if(raw===null){
      // Older releases may still be open. They own the old key and its time-based high score.
      try{
        const legacy=this.storage.getItem(LEGACY_SAVE_KEY);
        const data:unknown=legacy===null?null:JSON.parse(legacy);
        if(isObject(data)&&data.version===1){
          this.current.settings=sanitizeSettings(data.settings);
          this.current.tutorialSeen=data.tutorialSeen===true;
        }
      }catch{/* Unreadable legacy preferences can be left in place. */}
      return clone(this.current);
    }
    try{
      const parsed:unknown=JSON.parse(raw);
      if(!isObject(parsed))throw new Error('Malformed save');
      if(typeof parsed.version==='number'&&parsed.version>1){this.protectedData=true;return clone(this.current);}
      if(parsed.version!==1){this.protectedData=!this.preserve(raw,'unsupported');return clone(this.current);}
      this.current.settings=sanitizeSettings(parsed.settings);
      this.current.tutorialSeen=parsed.tutorialSeen===true;
      if(validBest(parsed.best)){
        if(parsed.best.rulesVersion===RULES_VERSION)this.current.best=clone(parsed.best);
        else this.protectedData=!this.preserve(raw,'previous-rules');
      } else if(parsed.best!==null&&parsed.best!==undefined){
        this.protectedData=!this.preserve(raw,'recovery');
      }
      // Keep the original raw record if any settings had to be repaired.
      // Previous saves predate the separate motor preference. Adding its default is a normal upgrade.
      const storedSettings=isObject(parsed.settings)&&!Object.hasOwn(parsed.settings,'haptics')
        ? {...parsed.settings,haptics:this.current.settings.haptics} : parsed.settings;
      if(JSON.stringify(this.current.settings)!==JSON.stringify(storedSettings)){
        this.protectedData=!this.preserve(raw,'settings-recovery')||this.protectedData;
      }
    }catch{this.protectedData=!this.preserve(raw,'recovery');}
    return clone(this.current);
  }
  private persist():boolean {
    const saved=this.persistData();this.lastWriteFailed=!saved;return saved;
  }
  private persistData():boolean {
    if(!this.storage||this.protectedData)return false;
    try{
      // A second tab or a newer build must never be overwritten blindly.
      const raw=this.storage.getItem(SAVE_KEY);
      if(raw!==null){
        let parsed:unknown;
        try{parsed=JSON.parse(raw);}catch{if(!this.preserve(raw,'recovery'))return false;}
        if(isObject(parsed)){
          if(typeof parsed.version==='number'&&parsed.version>1){this.protectedData=true;return false;}
          if(parsed.version!==1&&!this.preserve(raw,'unsupported'))return false;
          if(validBest(parsed.best)&&parsed.best.rulesVersion!==RULES_VERSION&&!this.preserve(raw,'previous-rules'))return false;
          if(validBest(parsed.best)&&parsed.best.rulesVersion===RULES_VERSION&&wins(parsed.best,this.current.best))this.current.best=clone(parsed.best);
          if(parsed.version===1){
            if(parsed.best!==null&&parsed.best!==undefined&&!validBest(parsed.best)&&!this.preserve(raw,'recovery'))return false;
            const repaired=sanitizeSettings(parsed.settings);
            const originalSettings=isObject(parsed.settings)&&!Object.hasOwn(parsed.settings,'haptics')
              ? {...parsed.settings,haptics:repaired.haptics}:parsed.settings;
            if(JSON.stringify(repaired)!==JSON.stringify(originalSettings)&&!this.preserve(raw,'settings-recovery'))return false;
            // Saving a record or tutorial must not silently restore a stale tab's preferences.
            if(!this.pendingSettings)this.current.settings=repaired;
            this.current.tutorialSeen=this.current.tutorialSeen||parsed.tutorialSeen===true;
          }
        }else if(parsed!==undefined&&!this.preserve(raw,'recovery'))return false;
      }
      this.storage.setItem(SAVE_KEY,JSON.stringify(this.current));this.pendingSettings=false;return true;
    }catch{return false;}
  }
  saveSettings(settings:Settings):boolean {if(!this.loaded)this.load();this.current.settings=sanitizeSettings(settings);this.pendingSettings=true;return this.persist();}
  saveBest(record:BestRecord):boolean {
    if(!this.loaded)this.load();
    if(!validBest(record)||record.rulesVersion!==RULES_VERSION)return false;
    if(wins(record,this.current.best))this.current.best=clone(record);
    return this.persist();
  }
  setTutorialSeen():boolean {if(!this.loaded)this.load();this.current.tutorialSeen=true;return this.persist();}
}
