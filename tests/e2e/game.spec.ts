import {test, expect, type Page} from '@playwright/test';
import type {GameState, Vec} from '../../src/shared/types';
interface TestHook {
  snapshot(): GameState; view(): string; input(): Vec; audioAvailable(): boolean;
  scenario(kind: 'fan'|'skate'|'soda'|'fail'|'showcase'): void; freeze(): void;
}
declare global {interface Window {__gameTest: TestHook; __resolveMotion?: (permission: string) => void}}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('night-market-rush.save.v1') ?? 'null'));
const snapshot = (page: Page) => page.evaluate(() => window.__gameTest.snapshot());
const view = (page: Page, name: string) => expect(page.locator('#game-shell')).toHaveAttribute('data-view', name);
const scenario = (page: Page, name: Parameters<TestHook['scenario']>[0]) => page.evaluate(kind => window.__gameTest.scenario(kind), name);
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({page}) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game-shell')).not.toHaveAttribute('data-view', 'loading');
});
test.afterEach(async ({page}) => {expect(errors.get(page), 'uncaught browser exceptions').toEqual([]);});

test('first session, keyboard, pause, settings transactions, result persistence and retry', async ({page}, info) => {
  await view(page, 'home');
  await page.screenshot({path: info.outputPath('01-home.png')});
  await page.getByRole('button', {name: /开始挑战/}).click();
  await view(page, 'tutorial');
  await expect(page.getByRole('heading', {name: '移动躲避，自动反击'})).toBeVisible();
  const began = Date.now();
  await page.getByRole('button', {name: '开始挑战', exact: true}).click();
  await view(page, 'countdown');
  expect((await snapshot(page)).time).toBe(0);
  await view(page, 'play');
  expect(Date.now() - began).toBeGreaterThanOrEqual(2700);
  expect(await page.evaluate(() => window.__gameTest.audioAvailable())).toBe(true);
  expect((await saved(page)).tutorialSeen).toBe(true);
  const before = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).player.x).toBeGreaterThan(before.player.x + 30);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  await view(page, 'pause');
  const paused = await snapshot(page);
  await page.waitForTimeout(350); // Confirm wall time does not advance a paused simulation.
  expect(await snapshot(page)).toEqual(paused);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  await view(page, 'settings');
  await page.getByRole('tab', {name: '声音'}).click();
  await page.getByRole('switch', {name: '总静音'}).click();
  await expect(page.getByRole('slider', {name: '音乐音量'})).toBeDisabled();
  await page.getByRole('button', {name: '应用', exact: true}).click();
  await view(page, 'pause');
  expect((await saved(page)).settings.muted).toBe(true);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  await page.getByRole('tab', {name: '画面'}).click();
  await page.getByRole('switch', {name: '减少动态'}).click();
  await expect(page.getByRole('switch', {name: '画面震动'})).toBeDisabled();
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('放弃未应用的修改');
  await page.getByRole('button', {name: '放弃修改'}).click();
  await view(page, 'pause');
  expect((await saved(page)).settings.reduceMotion).toBe(false);
  await expect(page.locator('#game-shell')).toHaveAttribute('data-motion', 'full');
  await page.getByRole('button', {name: '继续挑战'}).click();
  await view(page, 'countdown');
  expect((await snapshot(page)).time).toBe(paused.time);
  await view(page, 'play');
  await scenario(page, 'fail');
  await view(page, 'result');
  await expect(page.locator('.failure-reason')).toBeVisible();
  expect((await saved(page)).best.rulesVersion).toBe('night-market-3.0');
  await page.screenshot({path: info.outputPath('02-result.png')});
  await page.getByRole('button', {name: '再来一局'}).click();
  await view(page, 'countdown');
  expect((await snapshot(page)).ended).toBe(false);
  expect((await snapshot(page)).time).toBe(0);
  await view(page, 'play');
  await page.reload();
  await view(page, 'home');
  expect((await saved(page)).settings.muted).toBe(true);
  await expect(page.getByText('等待你的第一单')).toHaveCount(0);
});

for (const skill of ['fan', 'skate', 'soda'] as const) {
  test(`${skill} pickup drives actual simulation and battle feedback`, async ({page}, info) => {
    await scenario(page, skill);
    await expect.poll(async () => (await snapshot(page)).pickups.length).toBe(0);
    const state = await snapshot(page);
    expect(state.ended).toBe(false);
    if (skill === 'soda') {
      expect(state.enemies.length).toBeGreaterThan(0);
      expect(state.enemies.every(enemy => enemy.slowUntil > state.time + 2)).toBe(true);
    } else if (skill === 'fan') {
      expect(state.kills).toBeGreaterThanOrEqual(1); expect(state.score).toBeGreaterThanOrEqual(10);
    } else {
      expect(state.player.skateUntil).toBeGreaterThan(state.time + 3);
      const bun=state.enemies.find(e=>e.kind==='bun');
      expect(bun?bun.hp<=18:state.kills>=1).toBe(true);
      await expect(page.locator('[data-status="skate"]')).toBeVisible();
      await expect(page.locator('[data-status="skate"]')).toContainText('秒');
    }
    await page.screenshot({path: info.outputPath(`skill-${skill}.png`)});
    await page.evaluate(() => window.__gameTest.freeze());
    await view(page, 'pause');
  });
}

test('orientation preserves the result receipt and unapplied settings draft', async ({page}, info) => {
  await scenario(page, 'fail'); await view(page, 'result');
  const result = await snapshot(page);
  await page.setViewportSize({width: 390, height: 844}); await view(page, 'rotate');
  await page.setViewportSize({width: 1280, height: 720}); await view(page, 'result');
  expect(await snapshot(page)).toEqual(result);
  await expect(page.locator('.failure-reason')).toBeVisible();
  await page.getByRole('button', {name: '返回首页'}).click(); await view(page, 'home');
  await page.getByRole('button', {name: /操作设置/}).click(); await view(page, 'settings');
  await page.getByRole('button', {name: '右手'}).click();
  await expect(page.locator('[data-setting="hand"][data-value="right"]')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({width: 390, height: 844}); await view(page, 'rotate');
  await page.setViewportSize({width: 1280, height: 720}); await view(page, 'settings');
  await expect(page.locator('[data-setting="hand"][data-value="right"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({path: info.outputPath('05-settings-restored.png')});
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('放弃未应用的修改');
  await page.getByRole('button', {name: '放弃修改'}).click(); await view(page, 'home');
  expect((await saved(page)).settings.hand).toBe('left');
});

test('late motion permission cannot replace a newly opened settings page with battle', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('night-market-rush.save.v1', JSON.stringify({version: 1, settings: {mode: 'tilt'}, best: null, tutorialSeen: true}));
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {configurable: true, value: () => new Promise<string>(resolve => {window.__resolveMotion = resolve;})});
  });
  await page.reload(); await view(page, 'home');
  await page.getByRole('button', {name: /开始挑战/}).click();
  await expect.poll(() => page.evaluate(() => typeof window.__resolveMotion)).toBe('function');
  await page.getByRole('button', {name: /操作设置/}).click(); await view(page, 'settings');
  await page.evaluate(async () => {
    window.__resolveMotion?.('granted');
    await new Promise(resolve => setTimeout(resolve, 0));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {beta: 0, gamma: 0}));
  });
  await page.waitForTimeout(350); // Let the delayed permission continuation settle.
  await view(page, 'settings');
  expect((await snapshot(page)).time).toBe(0);
});

test.describe('touch device', () => {
  test.use({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  test('floating joystick, UI tap isolation, portrait pause and landscape resume', async ({page, context}, info) => {
    await view(page, 'home'); await scenario(page, 'showcase'); await view(page, 'play');
    const initial = await snapshot(page);
    const rect = await page.locator('#game-shell').boundingBox(); expect(rect).not.toBeNull();
    const start = {x: rect!.x + rect!.width * .22, y: rect!.y + rect!.height * .68};
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...start, id: 1}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: start.x + 80, y: start.y, id: 1}]});
    await expect(page.locator('#joystick')).toHaveClass(/is-active/);
    await expect.poll(async () => (await snapshot(page)).player.x).toBeGreaterThan(initial.player.x + 20);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await expect(page.locator('#joystick')).not.toHaveClass(/is-active/);
    expect(await page.evaluate(() => window.__gameTest.input())).toEqual({x: 0, y: 0});
    await page.getByRole('button', {name: '暂停游戏'}).tap(); await view(page, 'pause');
    expect(await page.evaluate(() => window.__gameTest.input())).toEqual({x: 0, y: 0});
    await scenario(page, 'showcase');
    await page.screenshot({path: info.outputPath('03-mobile-battle.png')});
    await page.setViewportSize({width: 390, height: 844}); await view(page, 'rotate');
    const portraitState = await snapshot(page);
    await page.waitForTimeout(300); expect(await snapshot(page)).toEqual(portraitState);
    await page.screenshot({path: info.outputPath('04-portrait-paused.png')});
    await page.setViewportSize({width: 844, height: 390}); await view(page, 'pause');
    await page.getByRole('button', {name: '继续挑战'}).tap(); await view(page, 'countdown'); await view(page, 'play');
    expect((await snapshot(page)).time).toBeGreaterThanOrEqual(portraitState.time);
    await cdp.detach();
  });
});

