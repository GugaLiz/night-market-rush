import {beforeAll,describe,expect,it} from 'vitest';
import {build} from 'esbuild';
import path from 'node:path';
import {DEFAULT_SETTINGS} from '../cocos/assets/scripts/domain/shared/types';
import type {SaveStore} from '../cocos/assets/scripts/runtime/save-store';

type RemovableStorage = {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
type Api = {storageIsUsable(storage:RemovableStorage|null):boolean;createCocosStorage(override?:RemovableStorage|null):SaveStore};
let api:Api;

beforeAll(async()=>{
  // Creator's cc module is available only inside the engine. Bundle the actual
  // adapter with an inert cc shim and inject each host storage under test.
  const result=await build({entryPoints:[path.resolve('cocos/assets/scripts/runtime/cocos-storage.ts')],bundle:true,
    format:'esm',platform:'node',write:false,plugins:[{name:'cc-test-shim',setup(builder){
      builder.onResolve({filter:/^cc$/},()=>({path:'cc',namespace:'test-cc'}));
      builder.onLoad({filter:/.*/,namespace:'test-cc'},()=>({contents:'export const sys = {};',loader:'js'}));
    }}]});
  api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`) as Api;
});

class MemoryStorage implements RemovableStorage {
  readonly values=new Map<string,string>();
  getItem(key:string):string|null{return this.values.get(key)??null;}
  setItem(key:string,value:string):void{this.values.set(key,value);}
  removeItem(key:string):void{this.values.delete(key);}
}

describe('Cocos storage availability',()=>{
  it('probes and cleans an unused key while preserving existing saves',()=>{
    const storage=new MemoryStorage();const key='night-market-rush.save.v4';storage.setItem(key,'existing');
    expect(api.storageIsUsable(storage)).toBe(true);
    expect([...storage.values]).toEqual([[key,'existing']]);
  });
  it('does not treat Creator warning-only stubs or silent writes as durable',()=>{
    const creatorStub={getItem:()=>undefined,setItem:()=>{},removeItem:()=>{}} as unknown as RemovableStorage;
    const noop:RemovableStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    for(const storage of [creatorStub,noop]){
      const store=api.createCocosStorage(storage);
      expect(store.persistenceAvailable).toBe(false);
      expect(store.saveSettings({...DEFAULT_SETTINGS,muted:true})).toBe(false);
      expect(store.data.settings.muted).toBe(true);
    }
  });
  it('fails closed on quota, read denial, or inability to clean up the probe',()=>{
    const denied:RemovableStorage={getItem:()=>{throw Error('denied');},setItem:()=>{},removeItem:()=>{}};
    const full:RemovableStorage={getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}};
    const cleanup=new MemoryStorage();cleanup.removeItem=()=>{throw Error('blocked');};
    for(const storage of [denied,full,cleanup])expect(api.createCocosStorage(storage).persistenceAvailable).toBe(false);
  });
  it('never overwrites an existing probe-key collision',()=>{
    const keyValues=new Map<string,string>();
    const existing:RemovableStorage={getItem:key=>key.includes('.probe.')?'someone else':keyValues.get(key)??null,
      setItem:(key,value)=>keyValues.set(key,value),removeItem:key=>keyValues.delete(key)};
    expect(api.storageIsUsable(existing)).toBe(false);
    expect(keyValues.size).toBe(0);
  });
});
