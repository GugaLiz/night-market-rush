import {expect,test,type Page} from '@playwright/test';

const key='night-market-rush.save.v4',legacyKey='night-market-rush.save.v1';
const build=process.env.COCOS_STORAGE_BUILD??'web-mobile-check1121';
const settings={mode:'joystick',joystickSize:'medium',hand:'right',sensitivity:'medium',music:.35,sfx:.7,muted:true,reduceMotion:false,shake:true,quality:'standard',haptics:true};
const record={score:246,time:19,rulesVersion:'night-market-4.0',date:'2026-11-18T00:00:00Z'};

async function openCocos(page:Page,query=''){
  const ready=page.waitForEvent('console',{predicate:m=>m.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto(`/cocos/build/${build}/${query}`);await ready;
  // Creator debug modules expose their actual exports via SystemJS; no game
  // test switch or source mutation is needed, and release storage stays gated.
  return page.evaluate(async()=>{
    const w=window as any;
    const cc=await w.System.import('cc');
    const module=await w.System.import('chunks:///_virtual/cocos-storage.ts');
    w.__storageTest={cc,module};
    const probe='night-market-rush.test.creator-storage-bridge';
    cc.sys.localStorage.setItem(probe,'creator');
    const same=localStorage.getItem(probe)==='creator';
    cc.sys.localStorage.removeItem(probe);
    return same;
  });
}

test('Creator storage imports v1 preferences without overwriting v1 and rollback reads the v4 result',async({page})=>{
  await page.goto('/dist/');
  const legacy={version:1,settings,best:{...record,score:999,rulesVersion:'night-market-3.0'},tutorialSeen:true};
  await page.evaluate(({legacyKey,legacy})=>{localStorage.clear();localStorage.setItem(legacyKey,JSON.stringify(legacy));},{legacyKey,legacy});
  expect(await openCocos(page)).toBe(true);
  expect(await page.evaluate(({key,legacyKey})=>({v4:localStorage.getItem(key),legacy:JSON.parse(localStorage.getItem(legacyKey)!)}),{key,legacyKey})).toEqual({v4:null,legacy});
  const result=await page.evaluate(({key,legacyKey,record})=>{
    const store=(window as any).__storageTest.module.createCocosStorage();
    const loaded=store.load();const written=store.saveBest(record);
    return {loaded,written,v4:JSON.parse(localStorage.getItem(key)!),legacy:JSON.parse(localStorage.getItem(legacyKey)!)};
  },{key,legacyKey,record});
  expect(result.loaded).toMatchObject({settings:{hand:'right',muted:true},tutorialSeen:true,best:null});
  expect(result.written).toBe(true);expect(result.v4.best).toEqual(record);expect(result.legacy).toEqual(legacy);
  // Roll back to the previously built old site at the same origin.
  await page.goto('/dist/');
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view','home',{timeout:45000});
  await expect(page.getByText('246 只',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'操作设置',exact:true}).click();
  await page.getByRole('tab',{name:'声音'}).click();
  await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','true');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).toMatchObject({best:record,tutorialSeen:true});
});

test('development prototype cannot enable real saves through URL parameters',async({page})=>{
  await page.goto('/dist/');
  const original={version:1,settings,best:record,tutorialSeen:true};
  await page.evaluate(({key,original})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(original));},{key,original});
  expect(await openCocos(page,'?release=1&save=1&candidate=1')).toBe(true);
  await page.getByRole('button',{name:'操作设置',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'声音',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','false');
  await page.getByRole('switch',{name:'总静音'}).focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'应用',exact:true}).focus();await page.keyboard.press('Enter');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).toEqual(original);
});

test('Creator storage preserves v4, guards future versions and backs up malformed data',async({page})=>{
  await page.goto('/dist/');
  const original={version:1,settings,best:record,tutorialSeen:true};
  await page.evaluate(({key,original})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(original));},{key,original});
  expect(await openCocos(page)).toBe(true);
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).toEqual(original);
  const result=await page.evaluate(({key,original})=>{
    const create=(window as any).__storageTest.module.createCocosStorage;
    const existing=create();const loaded=existing.load();
    const updated=existing.saveSettings({...loaded.settings,muted:false});
    const saved=JSON.parse(localStorage.getItem(key)!);
    const future=JSON.stringify({...original,version:99});localStorage.setItem(key,future);
    const futureStore=create();futureStore.load();const futureWrite=futureStore.setTutorialSeen();
    const futureAfter=localStorage.getItem(key);
    localStorage.setItem(key,'{corrupt');const bad=create();bad.load();
    const backup=Object.keys(localStorage).filter(k=>k.startsWith(key+'.recovery.')).map(k=>localStorage.getItem(k));
    const badWrite=bad.setTutorialSeen();
    return {loaded,updated,saved,future,futureWrite,futureAfter,backup,badWrite};
  },{key,original});
  expect(result.loaded).toEqual(original);expect(result.updated).toBe(true);
  expect(result.saved).toMatchObject({settings:{muted:false},best:record,tutorialSeen:true});
  expect(result.futureWrite).toBe(false);expect(result.futureAfter).toBe(result.future);
  expect(result.backup).toContain('{corrupt');expect(result.badWrite).toBe(true);
});
