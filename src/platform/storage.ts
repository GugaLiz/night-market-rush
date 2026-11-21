import {SaveStore, type StorageLike} from '../../cocos/assets/scripts/runtime/save-store';
export {SAVE_KEY, sanitizeSettings} from '../../cocos/assets/scripts/runtime/save-store';
export type {StorageLike} from '../../cocos/assets/scripts/runtime/save-store';

/** Browser host supplies its own storage; the save rules are platform-independent. */
export class WebStorage extends SaveStore {
  constructor(storage?:StorageLike|null){
    if(storage!==undefined){super(storage);return;}
    let browserStorage:StorageLike|null=null;
    try{browserStorage=typeof window!=='undefined'?window.localStorage:null;}catch{/* storage unavailable */}
    super(browserStorage);
  }
}
