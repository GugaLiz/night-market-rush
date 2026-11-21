import {expect,test,type Page} from '@playwright/test';

const courier=/\/assets\/resources\/native\/91\/910566c9-132d-4683-8c8a-e147903ee7a1\.(?:png|webp)(?:\?.*)?$/;
const bun=/\/assets\/resources\/native\/f1\/f1f385d0-7fe6-4113-a145-34a261d784dd\.(?:png|webp)(?:\?.*)?$/;
const brand=/\/assets\/resources\/native\/d1\/d1580fab-ac81-4cfd-a79f-3a92f9faac44\.png(?:\?.*)?$/;

async function openHome(page:Page){
  const home=page.waitForEvent('console',{predicate:m=>m.text().includes('[AtlasSmoke] view=home'),timeout:45000});
  await page.goto('/',{waitUntil:'domcontentloaded'});await home;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__homeGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__homeGame)throw new Error('Cocos game unavailable');
  });
}
async function art(page:Page,name:'Home courier'|'Home bun'|'Brand icon'){
  return page.evaluate(async name=>{
    const w=window as any,cc=await w.System.import('cc'),ui=w.__homeGame.ui;
    const parent=name==='Brand icon'?ui.node.getChildByName('Overlay')?.getChildByName('Home card'):ui.node;
    const node=parent?.getChildByName(name),sprite=node?.getComponent(cc.Sprite);
    return {view:w.__homeGame.view,visible:!!sprite?.enabled,hasFrame:!!sprite?.spriteFrame,
      placeholder:!!node?.getChildByName(`${name} placeholder`)?.active};
  },name);
}
async function activate(page:Page,name:string){
  const button=page.getByRole('button',{name,exact:true});await expect(button).toBeAttached();await button.focus();await page.keyboard.press('Enter');
}

test('home controls work while its artwork arrives independently',async({page},info)=>{
  test.setTimeout(90000);
  let releaseCourier!:()=>void,releaseBun!:()=>void,releaseBrand!:()=>void;
  const heldCourier=new Promise<void>(resolve=>{releaseCourier=resolve;});
  const heldBun=new Promise<void>(resolve=>{releaseBun=resolve;});
  const heldBrand=new Promise<void>(resolve=>{releaseBrand=resolve;});
  await page.route(courier,async route=>{await heldCourier;await route.continue();});
  await page.route(bun,async route=>{await heldBun;await route.continue();});
  await page.route(brand,async route=>{await heldBrand;await route.continue();});
  try{
    await openHome(page);
    for(const name of ['Home courier','Home bun','Brand icon'] as const){
      const state=await art(page,name);expect(state.view).toBe('home');expect(state.visible).toBe(false);expect(state.placeholder).toBe(true);
    }
    await page.screenshot({path:info.outputPath('home-art-placeholders.png'),animations:'disabled'});
    const start=page.getByRole('button',{name:'开始挑战',exact:true});await start.focus();const focused=await start.elementHandle();
    releaseCourier();await expect.poll(async()=>(await art(page,'Home courier')).hasFrame,{timeout:45000}).toBe(true);
    expect((await art(page,'Home courier')).placeholder).toBe(false);
    expect(await focused?.evaluate(el=>el.isConnected&&el===document.activeElement)).toBe(true);
    await activate(page,'操作设置');await activate(page,'右手');
    const cancel=page.getByRole('button',{name:'取消',exact:true});await cancel.focus();const setting=await cancel.elementHandle();
    releaseBun();releaseBrand();await expect.poll(async()=>(await art(page,'Home bun')).hasFrame,{timeout:45000}).toBe(true);
    expect(await setting?.evaluate(el=>el.isConnected&&el===document.activeElement)).toBe(true);
    expect(await page.evaluate(()=>(window as any).__homeGame.ui.draft.hand)).toBe('right');
    await activate(page,'取消');await activate(page,'放弃修改');
    await expect.poll(async()=>(await art(page,'Brand icon')).hasFrame,{timeout:45000}).toBe(true);
  }finally{releaseCourier();releaseBun();releaseBrand();}
});

test('artwork arriving behind portrait guidance is present after rotation',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(courier,async route=>{await held;await route.continue();});
  try{
    await openHome(page);expect((await art(page,'Home courier')).placeholder).toBe(true);
    await page.setViewportSize({width:430,height:932});
    await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.view)).toBe('rotate');
    release();await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.ui.artwork.has('courierHome')),{timeout:45000}).toBe(true);
    expect(await page.evaluate(()=>(window as any).__homeGame.view)).toBe('rotate');
    await page.setViewportSize({width:1280,height:720});
    await expect.poll(async()=>(await art(page,'Home courier')).hasFrame,{timeout:45000}).toBe(true);
    expect((await art(page,'Home courier')).view).toBe('home');
  }finally{release();}
});

test('artwork arriving between pointer down and up does not interrupt starting',async({page})=>{
  let releaseCourier!:()=>void,releaseBun!:()=>void;
  const heldCourier=new Promise<void>(resolve=>{releaseCourier=resolve;});
  const heldBun=new Promise<void>(resolve=>{releaseBun=resolve;});
  await page.route(courier,async route=>{await heldCourier;await route.continue();});
  await page.route(bun,async route=>{await heldBun;await route.continue();});
  try{
    await openHome(page);
    // The configured 1280 x 720 viewport matches the game's design resolution.
    await page.mouse.move(320,405);await page.mouse.down();
    releaseCourier();await expect.poll(async()=>(await art(page,'Home courier')).hasFrame,{timeout:45000}).toBe(true);
    await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.view)).toBe('loading');
    expect(await page.evaluate(()=>(window as any).__homeGame.session.isRunning)).toBe(false);
    releaseBun();await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.view),{timeout:45000}).toBe('play');
  }finally{releaseCourier();releaseBun();}
});

test('failed home artwork keeps the menu usable and allows loading retry',async({page})=>{
  test.setTimeout(90000);
  let fail=true;
  await page.route(courier,route=>fail?route.abort('failed'):route.continue());
  await openHome(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.loadError),{timeout:45000}).toContain('资源加载失败');
  expect((await art(page,'Home courier')).placeholder).toBe(true);
  expect((await art(page,'Home courier')).view).toBe('home');
  fail=false;await activate(page,'开始挑战');
  await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.view)).toBe('loading');
  await activate(page,'重试');
  await expect.poll(()=>page.evaluate(()=>(window as any).__homeGame.worldReady),{timeout:45000}).toBe(true);
  await expect.poll(async()=>(await art(page,'Home courier')).hasFrame,{timeout:45000}).toBe(true);
});
