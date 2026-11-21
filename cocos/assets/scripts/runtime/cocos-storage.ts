import {sys} from 'cc';
import {SAVE_KEY, SaveStore, type StorageLike} from './save-store';

export interface RemovableStorage extends StorageLike {removeItem(key:string):void}

/** Probe an unused key without touching an existing save. Some Creator Web
 * versions substitute a warning-only storage stub which does not throw. */
export function storageIsUsable(storage:RemovableStorage|null):boolean {
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function')return false;
  // Four random words make accidental collisions across tabs negligible.
  const nonce=Array.from({length:4},()=>Math.floor(Math.random()*0x100000000).toString(36)).join('-');
  const key=`${SAVE_KEY}.probe.${Date.now()}.${nonce}`;
  const value=`probe:${nonce}`;
  let attempted=false;
  try {
    // An undefined result from a warning-only stub is not an empty slot.
    if(storage.getItem(key)!==null)return false;
    attempted=true;
    storage.setItem(key,value);
    if(storage.getItem(key)!==value)return false;
    storage.removeItem(key);
    if(storage.getItem(key)!==null)return false;
    attempted=false;
    return true;
  } catch {
    return false;
  } finally {
    // Only clean up the value we wrote. Preserve any unexpected replacement.
    if(attempted)try{if(storage.getItem(key)===value)storage.removeItem(key);}catch{/* Unavailable or full storage stays session-only. */}
  }
}

/** Creator supplies target-specific storage; unavailable storage remains session-only. */
export function createCocosStorage(override?:RemovableStorage|null):SaveStore {
  let storage:RemovableStorage|null=null;
  try {storage=override===undefined?sys.localStorage:override;} catch {/* Storage can be unavailable. */}
  return new SaveStore(storageIsUsable(storage)?storage:null);
}
