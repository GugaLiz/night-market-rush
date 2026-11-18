import { DEFAULT_SETTINGS, RULES_VERSION, type BestRecord, type SaveData, type Settings } from '../shared/types';

export interface StorageLike { getItem(key:string):string|null; setItem(key:string,value:string):void }
export const SAVE_KEY='night-market-rush.save.v1';
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

/** The browser adapter is optional: storage denial never prevents play. */
export class WebStorage {
  private current:SaveData=defaults();
  private storage:StorageLike|null;
  private loaded=false;
  private protectedData=false;
  private backupCounter=0;
  constructor(storage?:StorageLike|null){
    if(storage!==undefined){this.storage=storage;return;}
    try{this.storage=typeof window!=='undefined'?window.localStorage:null;}catch{this.storage=null;}
  }
  get data():SaveData {if(!this.loaded)this.load();return clone(this.current);}
  get persistenceAvailable():boolean {return !!this.storage&&!this.protectedData;}
  private preserve(raw:string,label:string):boolean {
    try{this.storage?.setItem(`${SAVE_KEY}.${label}.${Date.now()}.${this.backupCounter++}`,raw);return !!this.storage;}
    catch{return false;}
  }
  load():SaveData {
    if(this.loaded)return clone(this.current);
    this.loaded=true;
    if(!this.storage)return clone(this.current);
    let raw:string|null;
    try{raw=this.storage.getItem(SAVE_KEY);}catch{this.storage=null;return clone(this.current);}
    if(raw===null)return clone(this.current);
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
      if(JSON.stringify(this.current.settings)!==JSON.stringify(parsed.settings)){
        this.protectedData=!this.preserve(raw,'settings-recovery')||this.protectedData;
      }
    }catch{this.protectedData=!this.preserve(raw,'recovery');}
    return clone(this.current);
  }
  private persist():boolean {
    if(!this.storage||this.protectedData)return false;
    try{
      // A second tab or a newer build must never be overwritten blindly.
      const raw=this.storage.getItem(SAVE_KEY);
      if(raw){
        let parsed:unknown;
        try{parsed=JSON.parse(raw);}catch{if(!this.preserve(raw,'recovery'))return false;}
        if(isObject(parsed)){
          if(typeof parsed.version==='number'&&parsed.version>1){this.protectedData=true;return false;}
          if(parsed.version!==1&&!this.preserve(raw,'unsupported'))return false;
          if(validBest(parsed.best)&&parsed.best.rulesVersion!==RULES_VERSION&&!this.preserve(raw,'previous-rules'))return false;
          if(validBest(parsed.best)&&parsed.best.rulesVersion===RULES_VERSION&&wins(parsed.best,this.current.best))this.current.best=clone(parsed.best);
        }else if(parsed!==undefined&&!this.preserve(raw,'recovery'))return false;
      }
      this.storage.setItem(SAVE_KEY,JSON.stringify(this.current));return true;
    }catch{return false;}
  }
  saveSettings(settings:Settings):boolean {if(!this.loaded)this.load();this.current.settings=sanitizeSettings(settings);return this.persist();}
  saveBest(record:BestRecord):boolean {
    if(!this.loaded)this.load();
    if(!validBest(record)||record.rulesVersion!==RULES_VERSION)return false;
    if(wins(record,this.current.best))this.current.best=clone(record);
    return this.persist();
  }
  setTutorialSeen():boolean {if(!this.loaded)this.load();this.current.tutorialSeen=true;return this.persist();}
}
