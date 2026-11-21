import {expect,test,type Page} from '@playwright/test';

// Browser-side inspection uses the real Creator build and its Cocos nodes.
// Injecting time, kills, and mocked sensor responses exercises boundary paths;
// it is not a physical-device or natural-play verification.
async function openPrototype(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__hintGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__hintGame)throw new Error('Cocos prototype component unavailable');
  });
  return errors;
}
async function hint(page:Page){return page.evaluate(()=>{
  const g=(window as any).__hintGame;
  return {view:g.view,text:g.openingHint?.string??'',visible:!!g.openingHint?.node.activeInHierarchy,mode:g.settings.mode,time:g.session.state.time};
});}
async function startByTouch(page:Page){
  const viewport=page.viewportSize()!;
  const scale=Math.min(viewport.width/1280,viewport.height/720),x=(viewport.width-1280*scale)/2+320*scale,y=(viewport.height-720*scale)/2+402*scale;
  await page.touchscreen.tap(x,y);
  await expect.poll(async()=>(await hint(page)).view).toBe('play');
}

test('desktop first-battle hint uses keyboard guidance and disappears at three simulation seconds',async({page})=>{
  const errors=await openPrototype(page);
  await expect.poll(()=>page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(false);
  await page.keyboard.press('Enter');
  await expect.poll(async()=>(await hint(page)).view).toBe('play');
  await page.evaluate(()=>{const g=(window as any).__hintGame;g.session.pause();g.session.state.time=2.99;g.session.state.kills=0;g.update(0);});
  await expect.poll(()=>hint(page)).toMatchObject({visible:true,mode:'joystick'});
  expect((await hint(page)).text).toMatch(/方向键\s*\/\s*WASD/);
  expect((await hint(page)).text).toContain('青色泡');expect((await hint(page)).text).toContain('金箱');
  await page.evaluate(()=>{const g=(window as any).__hintGame;g.session.state.time=3;g.update(0);});
  await expect.poll(async()=>(await hint(page)).visible).toBe(false);
  expect(errors).toEqual([]);
});

test('first defeat hides the hint before three seconds',async({page})=>{
  const errors=await openPrototype(page);await page.keyboard.press('Enter');
  await expect.poll(async()=>(await hint(page)).view).toBe('play');
  await page.evaluate(()=>{const g=(window as any).__hintGame;g.session.pause();g.session.state.time=1;g.session.state.kills=1;g.update(0);});
  await expect.poll(async()=>(await hint(page)).visible).toBe(false);
  expect(errors).toEqual([]);
});

test.describe('touch-first browser',()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:932,height:430}});

  test('first-battle joystick mode uses touch guidance',async({page})=>{
    const errors=await openPrototype(page);
    await expect.poll(()=>page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);
    await startByTouch(page);
    await expect.poll(()=>hint(page)).toMatchObject({visible:true,mode:'joystick'});
    expect((await hint(page)).text).toContain('拖动摇杆');
    expect((await hint(page)).text).not.toContain('倾斜设备');
    expect(errors).toEqual([]);
  });

  test('rejected tilt permission falls back before choosing the displayed hint',async({page})=>{
    const errors=await openPrototype(page);
    await page.evaluate(()=>{
      const g=(window as any).__hintGame;
      if(!g.motion)throw new Error('Browser motion adapter unavailable');
      g.settings.mode='tilt';g.motion.request=async()=>false;
    });
    await startByTouch(page);
    await expect.poll(()=>hint(page)).toMatchObject({visible:true,mode:'joystick'});
    const text=(await hint(page)).text;
    expect(text).toContain('拖动摇杆');expect(text).not.toContain('倾斜设备');
    expect(errors).toEqual([]);
  });

  test('allowed tilt mode describes tilting rather than joystick movement',async({page})=>{
    const errors=await openPrototype(page);
    await page.evaluate(()=>{
      const g=(window as any).__hintGame;
      if(!g.motion)throw new Error('Browser motion adapter unavailable');
      g.settings.mode='tilt';g.motion.request=async()=>true;g.motion.calibrate=()=>true;
      g.motion.getVector=()=>({x:0,y:0});
    });
    await startByTouch(page);
    await expect.poll(()=>hint(page)).toMatchObject({visible:true,mode:'tilt'});
    const text=(await hint(page)).text;
    expect(text).toContain('倾斜设备');expect(text).not.toContain('拖动摇杆');
    expect(errors).toEqual([]);
  });
});
