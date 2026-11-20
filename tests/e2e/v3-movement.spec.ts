import {test,expect,type Page} from '@playwright/test';
import type {GameState} from '../../src/shared/types';
const state=(page:Page)=>page.evaluate(()=>(window as unknown as {__gameTest:{snapshot():GameState}}).__gameTest.snapshot());
const view=(page:Page,name:string)=>expect(page.locator('#game-shell')).toHaveAttribute('data-view',name);
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',error=>found.push(error.message));});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
async function practice(page:Page){await page.goto('/');await view(page,'home');await page.getByRole('button',{name:'配送试验场',exact:true}).click();await page.getByRole('button',{name:'继续试验',exact:true}).click();await view(page,'play');}

test('a missed foreground frame resumes movement without a menu or a catch-up jump', async ({page}) => {
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time: start});
  await page.clock.pauseAt(new Date(+start + 1000));
  await page.goto('/');
  await page.getByRole('button', {name:'开始挑战', exact:true}).click({force:true});
  await page.keyboard.down('ArrowRight');
  await page.clock.runFor(96);
  const before = await state(page);
  await page.clock.fastForward(400);
  await view(page, 'play');
  const stalled = await state(page);
  expect(stalled.time).toBe(before.time);
  expect(stalled.player.x).toBe(before.player.x);
  await page.clock.runFor(48);
  expect((await state(page)).player.x).toBeGreaterThan(before.player.x);
  await page.keyboard.up('ArrowRight');
});

test('Space and Shift dash uses last direction, respects cooldown, and freezes in menus',async({page})=>{
  await practice(page);
  // No enemy is needed for forward-facing automatic attacks.
  await expect.poll(async()=>(await state(page)).weapon.readyAt).toBeGreaterThan(0);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(150);await page.keyboard.up('ArrowRight');
  const before=await state(page);await page.keyboard.press('Space');
  const launched=await state(page);expect(launched.player.dashReadyAt).toBeGreaterThan(launched.time+2.7);
  await expect(page.locator('#dash-button')).toBeDisabled();await page.waitForTimeout(210);
  const after=await state(page);expect(after.player.x-before.player.x).toBeGreaterThan(70);
  const readyAt=after.player.dashReadyAt;
  await page.keyboard.press('Shift');expect((await state(page)).player.dashReadyAt).toBe(readyAt);
  await page.keyboard.press('Escape');await view(page,'pause');const paused=await state(page);
  // Space on the focused resume button is a valid menu action. Exercise gameplay keys off the buttons.
  const resume=page.getByRole('button',{name:'继续挑战',exact:true});
  await expect(resume).toBeFocused();
  await page.getByRole('heading',{name:'已暂停'}).click();
  await expect(resume).not.toBeFocused();
  await page.keyboard.press('Space');await page.keyboard.press('Shift');await page.waitForTimeout(80);expect(await state(page)).toEqual(paused);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.keyboard.press('Shift');expect(await state(page)).toEqual(paused);
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'继续挑战',exact:true}).click();
  await expect(page.locator('#dash-button')).toBeEnabled();await page.keyboard.down('ArrowLeft');await page.waitForTimeout(120);await page.keyboard.up('ArrowLeft');
  const leftBefore=(await state(page)).player.x;await page.keyboard.press('Shift');await page.waitForTimeout(210);expect((await state(page)).player.x).toBeLessThan(leftBefore-70);
  await page.keyboard.press('Escape');const stopped=await state(page);await page.waitForTimeout(100);expect(await state(page)).toEqual(stopped);
});

test.describe('touch dash',()=>{
  test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  test('canceling a touch stops the rider while their parcel keeps delivering, and the next touch can reverse',async({page,context})=>{
    const start=new Date('2026-01-01T00:00:00Z');
    await page.clock.install({time:start});
    await page.clock.pauseAt(new Date(+start+1000));
    await page.goto('/');
    await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
    await page.getByRole('button',{name:'加急三连送',exact:true}).click({force:true});
    const rect=(await page.locator('#game-shell').boundingBox())!;
    const cdp=await context.newCDPSession(page);
    const origin={x:rect.x+rect.width*.25,y:rect.y+rect.height*.70,id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...origin,x:origin.x+75}]});
    await page.clock.runFor(224);
    const moving=await state(page);
    expect(moving.ultimates?.some(c=>c.kind==='express')).toBe(true);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.clock.runFor(64);
    const stopped=(await state(page)).player;
    expect(stopped.x-moving.player.x).toBeLessThan(2);
    await page.clock.runFor(1440);
    const inFlight=await state(page);
    expect(inFlight.player.x).toBe(stopped.x);
    expect(inFlight.ultimates?.some(c=>c.kind==='express'&&c.landings.length>=2)).toBe(true);
    await expect(page.locator('[data-status="express"]')).toContainText('急送第 1 单');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...origin,id:2,x:origin.x-65}]});
    await page.clock.runFor(112);
    expect((await state(page)).player.x).toBeLessThan(stopped.x-20);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  });
  test('second finger dashes without releasing joystick and portrait blocks dash',async({page,context},info)=>{
    await practice(page);
    const rect=(await page.locator('#game-shell').boundingBox())!,button=(await page.locator('#dash-button').boundingBox())!;
    const cdp=await context.newCDPSession(page);
    const origin={x:rect.x+rect.width*.2,y:rect.y+rect.height*.72,id:1};
    const moved={x:origin.x+55,y:origin.y,id:1},tap={x:button.x+button.width/2,y:button.y+button.height/2,id:2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
    await page.waitForTimeout(70);const before=await state(page);
    const knob=(await page.locator('.joystick-knob').boundingBox())!;
    expect(Math.abs(knob.x+knob.width/2-moved.x)).toBeLessThan(2);
    expect(Math.abs(knob.y+knob.height/2-moved.y)).toBeLessThan(2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moved,tap]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[tap]});
    await expect.poll(async()=>(await state(page)).player.dashReadyAt??0).toBeGreaterThan(0);
    await expect(page.locator('#joystick')).toHaveClass(/is-active/);
    await page.waitForTimeout(200);expect((await state(page)).player.x-before.player.x).toBeGreaterThan(70);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#joystick')).not.toHaveClass(/is-active/);
    await page.screenshot({animations:'disabled',path:info.outputPath('v3-mobile-dash.png')});
    await page.setViewportSize({width:390,height:844});await view(page,'rotate');const paused=await state(page);await page.locator('#game-canvas').focus();
    await page.keyboard.press('Space');await page.keyboard.press('Shift');await page.waitForTimeout(100);expect(await state(page)).toEqual(paused);
    await cdp.detach();
  });
});
