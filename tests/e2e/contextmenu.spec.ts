import {test,expect,type Page} from '@playwright/test';

const intent=(page:Page)=>page.evaluate(()=>window.__gameTest.input());
const player=(page:Page)=>page.evaluate(()=>window.__gameTest.snapshot().player);

test.beforeEach(async({page})=>{
  const time=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time});
  await page.clock.pauseAt(new Date(+time+1000));
  await page.goto('/');
  await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
});

test('right-click stops held keyboard movement without firing the dash button',async({page})=>{
  const start=await player(page);
  await page.keyboard.down('d');
  await page.clock.runFor(96);
  expect((await player(page)).x).toBeGreaterThan(start.x);
  await page.locator('#dash-button').click({button:'right',force:true});
  expect(await intent(page)).toEqual({x:0,y:0});
  expect((await player(page)).dashReadyAt).toBe(start.dashReadyAt);
  // A held key can repeat before the browser ever delivers its release.
  await page.keyboard.down('d');
  await page.clock.runFor(100);
  const stopped=await player(page);
  await page.clock.runFor(160);
  expect((await player(page)).x).toBe(stopped.x);
  await page.keyboard.up('d');
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(96);
  expect((await player(page)).x).toBeLessThan(stopped.x);
  // Some context menu gestures deliver the menu event without a secondary pointer press.
  const menuCancelled=await page.locator('#game-canvas').evaluate(canvas=>
    !canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  expect(menuCancelled).toBe(true);
  expect(await intent(page)).toEqual({x:0,y:0});
  await page.keyboard.up('ArrowLeft');
});

test('pressing the right button during a left-button joystick drag releases the capture',async({page})=>{
  const surface=page.locator('#game-shell');
  const rect=(await surface.boundingBox())!;
  const x=rect.x+rect.width*.22,y=rect.y+rect.height*.65;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+65,y);
  expect((await intent(page)).x).toBeGreaterThan(.9);
  await page.mouse.down({button:'right'});
  expect(await intent(page)).toEqual({x:0,y:0});
  await expect(page.locator('#joystick')).not.toHaveClass(/is-active/);
  await page.mouse.up({button:'right'});
  await page.mouse.move(x+95,y);
  expect(await intent(page)).toEqual({x:0,y:0});
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.move(x,y);
  expect((await intent(page)).x).toBeLessThan(-.9);
  await page.mouse.up();
  expect(await intent(page)).toEqual({x:0,y:0});
});
