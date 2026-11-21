import {expect,test,type Page} from '@playwright/test';

// The two background textures are independent resources; holding one lets the
// remaining artwork finish. Release candidates may request WebP instead of PNG.
const night=/\/assets\/resources\/native\/67\/6718ff84-3f8e-47fa-a72e-95114eafa74d\.(?:png|webp)(?:\?.*)?$/;
const river=/\/assets\/resources\/native\/e1\/e1838951-7675-417b-bbe8-42621ec0b3e7\.(?:png|webp)(?:\?.*)?$/;
async function initialize(page:Page){
  const loading=page.waitForEvent('console',{predicate:m=>m.text().includes('[AtlasSmoke] view=loading'),timeout:45000});
  await page.goto('/',{waitUntil:'domcontentloaded'});await loading;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__loadingGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__loadingGame)throw new Error('Cocos game unavailable');
  });
}
async function state(page:Page){return page.evaluate(()=>{
  const game=(window as any).__loadingGame;
  return {view:game.view,progress:game.ui.data.progress??0,message:game.loadError};
});}

test('slow assets advance loading and preserve progress behind portrait guidance',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(night,async route=>{await held;await route.continue();});
  try{
    await initialize(page);
    await expect.poll(async()=>(await state(page)).progress,{timeout:30000}).toBeGreaterThan(0);
    const before=await state(page);expect(before.view).toBe('loading');expect(before.progress).toBeLessThan(1);
    await page.setViewportSize({width:430,height:932});
    await expect.poll(async()=>(await state(page)).view).toBe('rotate');
    const portrait=await state(page);expect(portrait.progress).toBeGreaterThanOrEqual(before.progress);
    await page.setViewportSize({width:1280,height:720});
    await expect.poll(async()=>(await state(page)).view).toBe('loading');
    expect((await state(page)).progress).toBeGreaterThanOrEqual(portrait.progress);
    release();await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
  }finally{release();}
});

test('failed load keeps its progress stable when stale assets finish and retry recovers after rotation',async({page})=>{
  test.setTimeout(90000);
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let fail=true;
  await page.route(night,route=>fail?route.abort('failed'):route.continue());
  await page.route(river,async route=>{await held;await route.continue();});
  try{
    await initialize(page);
    await page.setViewportSize({width:430,height:932});
    await expect.poll(async()=>(await state(page)).view).toBe('rotate');
    await expect.poll(async()=>(await state(page)).message,{timeout:45000}).toContain('资源加载失败');
    const failed=await state(page);expect(failed.progress).toBeLessThan(1);
    release();await page.waitForTimeout(300);
    expect((await state(page)).progress).toBe(failed.progress);
    fail=false;
    await page.setViewportSize({width:1280,height:720});
    await expect.poll(async()=>(await state(page)).view).toBe('loading');
    await page.getByRole('button',{name:'重试',exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    expect((await state(page)).message).toBe('');
  }finally{release();}
});
