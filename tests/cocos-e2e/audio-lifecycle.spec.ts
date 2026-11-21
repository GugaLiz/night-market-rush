import {expect,test} from '@playwright/test';

test('menu audio returns after foregrounding while a run remains paused',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__audioLifecycle={cc,app:cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke')};
    if(!w.__audioLifecycle.app)throw new Error('Cocos prototype component unavailable');
  });
  // The home screen initially focuses the semantic Start button, so ordinary
  // letter keys are intentionally not forwarded to the game. Activate a real
  // menu control to unlock audio, then return to the home screen.
  await page.getByRole('button',{name:'玩法说明',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'返回首页',exact:true}).focus();
  await page.keyboard.press('Enter');
  const state=()=>page.evaluate(()=>{
    const {app}= (window as any).__audioLifecycle;
    return {view:app.view,scene:app.audio.policy.scene,available:app.audio.available,playing:app.audio.music.playing,running:app.session.isRunning};
  });
  const lifecycle=(kind:'hide'|'show')=>page.evaluate(kind=>{
    const {cc}=(window as any).__audioLifecycle;cc.game.emit(kind==='hide'?cc.Game.EVENT_HIDE:cc.Game.EVENT_SHOW);
  },kind);
  await expect.poll(async()=>(await state()).available,{timeout:30000}).toBe(true);
  await expect.poll(async()=>(await state()).playing).toBe(true);
  await lifecycle('hide');expect(await state()).toMatchObject({view:'home',scene:'paused',playing:false});
  await lifecycle('show');await expect.poll(state).toMatchObject({view:'home',scene:'home',playing:true});

  await page.getByRole('button',{name:'玩法说明',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(async()=>(await state()).view).toBe('tutorial');
  await lifecycle('hide');expect(await state()).toMatchObject({view:'tutorial',scene:'paused',playing:false});
  await lifecycle('show');await expect.poll(state).toMatchObject({view:'tutorial',scene:'home',playing:true});

  await page.getByRole('button',{name:'开始挑战',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(state).toMatchObject({view:'play',scene:'play',running:true});
  await lifecycle('hide');expect(await state()).toMatchObject({view:'pause',scene:'paused',running:false});
  await lifecycle('show');expect(await state()).toMatchObject({view:'pause',scene:'paused',running:false,playing:false});
  expect(errors).toEqual([]);
});
