import {test,expect,type Page} from '@playwright/test';
import type {MarketStallKind,Vec} from '../../src/shared/types';
import {SAVE_KEY} from '../../src/platform/storage';

async function runToStall(page:Page,kind:MarketStallKind){
  const stall=await page.evaluate(k=>window.__gameTest.snapshot().market.offer!.stalls.find(s=>s.kind===k)!,kind);
  for(const axis of ['x','y'] as const){
    const start=await page.evaluate(a=>window.__gameTest.snapshot().player[a],axis);
    const sign=Math.sign(stall[axis]-start);
    if(Math.abs(stall[axis]-start)<10)continue;
    const key=axis==='x'?(sign>0?'ArrowRight':'ArrowLeft'):(sign>0?'ArrowDown':'ArrowUp');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({axis,goal,sign}:{axis:keyof Vec;goal:number;sign:number})=>{
        const s=window.__gameTest.snapshot();
        return !s.market.offer||(s.player[axis]-goal)*sign>=-7;
      },{axis,goal:stall[axis],sign},{polling:'raf',timeout:4000});
    }finally{await page.keyboard.up(key);}
  }
}

test('market sign, equipment sticker, pause instructions and a fresh attempt',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();
  for(const [kind,name,instruction] of [
    ['frost','碎冰箱','冲刺撞碎带裂纹的冻怪'],
    ['brine','泡菜箱','让回旋餐盘飞过毒雾'],
  ] as const){
    await page.getByRole('button',{name:'配送箱改装',exact:true}).click();
    await runToStall(page,kind);
    await expect(page.locator('#weapon-state .box-sticker')).toHaveText(name);
    await expect(page.getByRole('status').filter({hasText:instruction})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toContainText(instruction);
    await page.getByRole('button',{name:'继续挑战'}).click();
    await page.getByRole('button',{name:'试验工具'}).click();
  }
  await page.getByRole('button',{name:'重置试验'}).click();
  await expect(page.locator('.box-sticker')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__gameTest.snapshot().market.completed)).toBe(0);
});

test('guard releases the final stall, modal survives rotation, and both shift choices work',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();
  for(const choice of ['继续夜班','收摊结算'] as const){
    await page.getByRole('button',{name:'五分钟尾单'}).click();
    await page.waitForFunction(()=>window.__gameTest.snapshot().market.offer?.ready);
    await runToStall(page,'final');
    await expect(page.getByRole('heading',{name:'尾单已送达'})).toBeVisible();
    const signed=await page.evaluate(()=>window.__gameTest.snapshot());
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','rotate');
    await page.setViewportSize({width:844,height:390});
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','closing');
    expect(await page.evaluate(()=>window.__gameTest.snapshot().time)).toBe(signed.time);
    await page.getByRole('button',{name:choice,exact:true}).click();
    if(choice==='继续夜班'){
      await expect(page.locator('#game-shell')).toHaveAttribute('data-view','play');
      const night=await page.evaluate(()=>window.__gameTest.snapshot());
      expect(night.market.closing).toBe('night');
      expect(night.market.completed).toBe(signed.market.completed);
      expect(night.weapon.kind).toBe(signed.weapon.kind);
      await page.getByRole('button',{name:'试验工具'}).click();
    }else{
      await expect(page.locator('#game-shell')).toHaveAttribute('data-view','result');
      await expect(page.getByRole('heading',{name:'收摊结算'})).toBeVisible();
      await expect(page.locator('#result-orders')).toHaveText(String(signed.market.completed));
      await expect(page.locator('#result-kills')).toHaveText(String(signed.kills));
      await expect(page.locator('.failure-reason')).toHaveCount(0);
      expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{}')?.best??null,SAVE_KEY)).toBeNull();
    }
  }
});

test('a surviving courier can settle a normal challenge and save the kill record',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'开始挑战'}).click();
  // Skip the wait for wave nine. The live scheduler places the stall and spawns its guardian.
  await page.evaluate(()=>{
    const s=window.__gameTest.game().state;
    s.time=299.95;s.wave=9;s.waveStartedAt=274;
    s.player.invulnerableUntil=330;
  });
  await page.waitForFunction(()=>window.__gameTest.snapshot().market.offer?.group==='final');
  await page.waitForFunction(()=>window.__gameTest.snapshot().market.offer?.ready);
  await runToStall(page,'final');
  await page.getByRole('button',{name:'收摊结算'}).click();
  const result=await page.evaluate(()=>window.__gameTest.snapshot());
  expect(result.player.hp).toBeGreaterThan(0);
  expect(result.revivesUsed).toBe(0);
  await expect(page.locator('#result-orders')).toHaveText('1');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).best.score,SAVE_KEY)).toBe(result.kills);
});
