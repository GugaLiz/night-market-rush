import {expect,test,type Page} from '@playwright/test';

// The two background textures are independent resources; holding one lets the
// remaining artwork finish. Release candidates may request WebP instead of PNG.
const night=/\/assets\/resources\/native\/67\/6718ff84-3f8e-47fa-a72e-95114eafa74d\.(?:png|webp)(?:\?.*)?$/;
const river=/\/assets\/resources\/native\/e1\/e1838951-7675-417b-bbe8-42621ec0b3e7\.(?:png|webp)(?:\?.*)?$/;
const battle=/\/assets\/resources\/native\/69\/694d6f53-2f68-4a66-84ba-990eb6de4731\.(?:png|webp)(?:\?.*)?$/;
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
  return {view:game.view,progress:game.ui.data.progress??0,message:game.loadError,worldReady:game.worldReady,running:game.session.isRunning};
});}
async function activate(page:Page,name:string){
  const button=page.getByRole('button',{name,exact:true});await expect(button).toBeAttached();await button.focus();await page.keyboard.press('Enter');
}

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

test('home is usable before battle assets, and starting waits through rotation',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    expect((await state(page)).worldReady).toBe(false);
    await activate(page,'操作设置');await expect.poll(async()=>(await state(page)).view).toBe('settings');
    await activate(page,'取消');await expect.poll(async()=>(await state(page)).view).toBe('home');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    expect((await state(page)).running).toBe(false);
    await page.setViewportSize({width:430,height:932});await expect.poll(async()=>(await state(page)).view).toBe('rotate');
    release();await expect.poll(async()=>(await state(page)).worldReady,{timeout:45000}).toBe(true);
    expect((await state(page)).view).toBe('rotate');expect((await state(page)).running).toBe(false);
    await page.setViewportSize({width:1280,height:720});await expect.poll(async()=>(await state(page)).view).toBe('home');
    expect((await state(page)).running).toBe(false);
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('play');
  }finally{release();}
});

test('catalog waits for its artwork and does not open a partial view',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'夜市图鉴');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    release();await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('catalog');
    await activate(page,'返回');await expect.poll(async()=>(await state(page)).view).toBe('home');
  }finally{release();}
});

test('a later battle asset failure offers retry without starting a game',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let fail=true;
  await page.route(battle,async route=>{await held;if(fail)await route.abort('failed');else await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    release();await expect.poll(async()=>(await state(page)).message,{timeout:45000}).toContain('资源加载失败');
    expect((await state(page)).running).toBe(false);fail=false;
    await activate(page,'重试');await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('play');
  }finally{release();}
});

test('background completion keeps settings controls and draft intact',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'操作设置');const cancel=await page.getByRole('button',{name:'取消',exact:true}).elementHandle();
    release();await expect.poll(async()=>(await state(page)).worldReady,{timeout:45000}).toBe(true);
    expect((await state(page)).view).toBe('settings');expect(await cancel?.evaluate(el=>el.isConnected)).toBe(true);
    await activate(page,'取消');await expect.poll(async()=>(await state(page)).view).toBe('home');
  }finally{release();}
});

test('background completion does not replace focused home controls',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    const button=page.getByRole('button',{name:'开始挑战',exact:true});await button.focus();const control=await button.elementHandle();
    release();await expect.poll(async()=>(await state(page)).worldReady,{timeout:45000}).toBe(true);
    expect((await state(page)).view).toBe('home');expect(await control?.evaluate(el=>el.isConnected)).toBe(true);await expect(button).toBeFocused();
  }finally{release();}
});

test('catalog requested from tutorial returns to tutorial after background loading',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'玩法说明');await expect.poll(async()=>(await state(page)).view).toBe('tutorial');
    await activate(page,'查看全部图鉴');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    release();await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('catalog');
    await activate(page,'返回');await expect.poll(async()=>(await state(page)).view).toBe('tutorial');
  }finally{release();}
});

test('backgrounding cancels a queued start and does not resume into play',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    await page.evaluate(async()=>{const cc=await (window as any).System.import('cc');cc.game.emit(cc.Game.EVENT_HIDE);});
    release();await expect.poll(async()=>(await state(page)).worldReady,{timeout:45000}).toBe(true);
    expect((await state(page)).running).toBe(false);
    await page.evaluate(async()=>{const cc=await (window as any).System.import('cc');cc.game.emit(cc.Game.EVENT_SHOW);});
    await expect.poll(async()=>(await state(page)).view).toBe('home');expect((await state(page)).running).toBe(false);
  }finally{release();}
});

test('losing focus cancels a queued start',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));release();
    await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');expect((await state(page)).running).toBe(false);
  }finally{release();}
});

for(const inSettings of [false,true])test(`background asset failure preserves ${inSettings?'settings':'home'} and allows retry`,async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let fail=true;
  await page.route(battle,async route=>{await held;if(fail)await route.abort('failed');else await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    if(inSettings){await activate(page,'操作设置');await expect.poll(async()=>(await state(page)).view).toBe('settings');}
    release();await expect.poll(async()=>(await state(page)).message,{timeout:45000}).toContain('资源加载失败');
    expect((await state(page)).view).toBe(inSettings?'settings':'home');
    expect(await page.evaluate(()=>{const g=(window as any).__loadingGame;return g.feedback.node.active;})).toBe(true);
    expect(await page.evaluate(()=>{const g=(window as any).__loadingGame;for(let i=0;i<55;i++)g.update(.1);return g.feedback.node.active;})).toBe(false);
    if(inSettings)await activate(page,'取消');
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    expect((await state(page)).running).toBe(false);fail=false;await activate(page,'重试');
    await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
  }finally{release();}
});

test('tilt permission is requested in the original start gesture while battle loads',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(battle,async route=>{await held;await route.continue();});
  try{
    await initialize(page);await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('home');
    await page.evaluate(()=>{const w=window as any,g=w.__loadingGame;g.settings.mode='tilt';w.__tiltCalls=[];
      g.motion.request=()=>{w.__tiltCalls.push(navigator.userActivation.isActive);return Promise.resolve(true);};
      g.motion.calibrate=()=>true;g.motion.getVector=()=>({x:0,y:0});});
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view).toBe('loading');
    expect(await page.evaluate(()=>(window as any).__tiltCalls)).toEqual([true]);
    await page.setViewportSize({width:430,height:932});await expect.poll(async()=>(await state(page)).view).toBe('rotate');
    release();await expect.poll(async()=>(await state(page)).worldReady,{timeout:45000}).toBe(true);
    await page.setViewportSize({width:1280,height:720});await expect.poll(async()=>(await state(page)).view).toBe('home');
    expect((await state(page)).running).toBe(false);
    await activate(page,'开始挑战');await expect.poll(async()=>(await state(page)).view,{timeout:45000}).toBe('play');
    expect(await page.evaluate(()=>(window as any).__tiltCalls)).toEqual([true,true]);
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
