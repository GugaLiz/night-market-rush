import {expect,test,type Page} from '@playwright/test';

// Exercise the built Cocos game, not an isolated recreation of the bridge.
async function openPrototype(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__a11yGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__a11yGame)throw new Error('Cocos prototype component unavailable');
  });
  return errors;
}
async function currentView(page:Page){return page.evaluate(()=>(window as any).__a11yGame.view as string);}
async function activeFocusRing(page:Page){return page.evaluate(()=>{
  const root=(window as any).__a11yGame.ui.node;
  const find=(node:any):boolean=>node.name==='Semantic focus ring'&&node.activeInHierarchy||node.children.some(find);
  return find(root);
});}

test('keyboard uses home, gameplay, pause and settings without sending UI keys to the game',async({page})=>{
  const errors=await openPrototype(page);
  const start=page.getByRole('button',{name:'开始挑战',exact:true});
  await expect(start).toBeFocused();
  await expect.poll(()=>activeFocusRing(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('play');
  await expect(page.locator('#GameCanvas')).toBeFocused();
  await page.keyboard.press('p');
  await expect.poll(()=>currentView(page)).toBe('pause');
  const settings=page.getByRole('button',{name:'设置',exact:true});
  await expect(settings).toBeAttached();await settings.focus();
  await expect.poll(()=>activeFocusRing(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('settings');
  const sound=page.getByRole('button',{name:'声音',exact:true});
  await sound.focus();await page.keyboard.press('Enter');
  const music=page.getByRole('slider',{name:'音乐音量'});
  await expect(music).toBeAttached();await music.focus();
  const before=await music.inputValue();
  await page.keyboard.down('ArrowRight');
  const heldCount=await page.evaluate(()=>(window as any).__a11yGame.held.size);
  await page.keyboard.up('ArrowRight');
  expect(heldCount).toBe(0);
  await expect.poll(()=>music.inputValue()).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'放弃修改',exact:true})).toBeAttached();
  await page.getByRole('button',{name:'放弃修改',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('pause');
  await page.getByRole('button',{name:'继续挑战',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('play');
  await expect(page.locator('#GameCanvas')).toBeFocused();
  expect(errors).toEqual([]);
});

test('keyboard opens catalog, switches category, returns and enters practice',async({page})=>{
  const errors=await openPrototype(page);
  const catalog=page.getByRole('button',{name:'夜市图鉴',exact:true});
  await catalog.focus();await expect.poll(()=>activeFocusRing(page)).toBe(true);
  await page.keyboard.press('Enter');await expect.poll(()=>currentView(page)).toBe('catalog');
  const skills=page.getByRole('button',{name:'21 种技能',exact:true});
  await skills.focus();await page.keyboard.press('Enter');
  await expect(skills).toHaveAttribute('aria-pressed','true');
  // Catalog descriptions must be available to assistive technology, not just
  // represented by an image in the canvas.
  await expect(page.getByText(/迎着怪群接住电扇/)).toBeAttached();
  await page.getByRole('button',{name:'图鉴向下滚动',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).__a11yGame.ui.catalogScroll.getScrollOffset().y)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');await expect.poll(()=>currentView(page)).toBe('home');
  const practice=page.getByRole('button',{name:'配送试验场',exact:true});
  await practice.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('lab');
  const selections=[
    {button:'下一武器',label:'武器',before:'伸缩取餐夹',after:'纸袋气炮'},
    {button:'下一技能',label:'技能',before:'旋风电扇',after:'滑板环绕'},
    {button:'下一敌人',label:'敌人',before:'包子怪',after:'三角饭团'},
    {button:'下一试打',label:'试打',before:'取卡清场',after:'连续换波'},
  ];
  for(const selection of selections){
    const content=page.locator('section[role="dialog"] p').filter({hasText:`当前${selection.label} `});
    const button=page.getByRole('button',{name:selection.button,exact:true});
    await expect(content).toContainText(selection.before);
    await button.focus();await page.keyboard.press('Enter');
    await expect(button).toBeFocused();
    await expect(content).toContainText(selection.after);
    await expect(page.getByRole('status')).toHaveText(`当前${selection.label} ${selection.after}`);
  }
  const close=page.getByRole('button',{name:'继续试验',exact:true});
  await expect(close).toBeAttached();await close.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('play');
  await expect(page.locator('#GameCanvas')).toBeFocused();
  expect(errors).toEqual([]);
});

test('keyboard operates revive, closing settlement and retry against real session state',async({page})=>{
  const errors=await openPrototype(page);
  await page.keyboard.press('Enter');await expect.poll(()=>currentView(page)).toBe('play');
  // Set up boundary states directly so this test does not depend on a random,
  // long combat run; all subsequent buttons invoke the real host handlers.
  await page.evaluate(()=>{const game=(window as any).__a11yGame;game.session.pause();game.session.state.ended=true;game.session.state.player.hp=0;game.show('revive');});
  await expect.poll(()=>currentView(page)).toBe('revive');
  const revive=page.getByRole('button',{name:'免费复活',exact:true});
  await revive.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('play');
  expect(await page.evaluate(()=>(window as any).__a11yGame.session.state.revivesUsed)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__a11yGame.session.state.player.hp)).toBeGreaterThan(0);
  await page.evaluate(()=>{const game=(window as any).__a11yGame;game.session.pause();game.session.state.market.closing='choice';game.show('closing');});
  const settle=page.getByRole('button',{name:'收摊结算',exact:true});
  await settle.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('result');
  expect(await page.evaluate(()=>(window as any).__a11yGame.session.state.market.closing)).toBe('settled');
  const retry=page.getByRole('button',{name:'再来一局',exact:true});
  await retry.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>currentView(page)).toBe('play');
  expect(await page.evaluate(()=>(window as any).__a11yGame.session.state.revivesUsed)).toBe(0);
  expect(errors).toEqual([]);
});
