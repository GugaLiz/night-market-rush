import {test, expect, type Page} from '@playwright/test';
import {RULES_VERSION, type GameState, type Vec} from '../../src/shared/types';
import type {Game} from '../../src/core/game';
import {SAVE_KEY} from '../../src/platform/storage';
interface TestHook {
  game(): Game;
  snapshot(): GameState; view(): string; input(): Vec; audioAvailable(): boolean;
  scenario(kind: 'fan'|'skate'|'soda'|'fail'|'showcase'): void; freeze(): void;
}
declare global {interface Window {__gameTest: TestHook; __resolveMotion?: (permission: string) => void}}
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY);
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
  await page.getByRole('button', {name: '玩法说明'}).click();
  await view(page, 'tutorial');
  await expect(page.getByRole('heading', {name: '走位取道具，清出路线收金币'})).toBeVisible();
  await page.getByRole('button', {name: '返回首页'}).click();
  await page.getByRole('button', {name: /开始挑战/}).click();
  await view(page, 'play');
  await expect(page.locator('#opening-hint')).toBeVisible();
  await expect(page.locator('#joystick')).toBeHidden();
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
  await view(page, 'revive');
  expect((await saved(page)).best).toBeNull();
  await page.getByRole('button', {name: '放弃复活，查看成绩'}).click();
  await view(page, 'result');
  await expect(page.locator('.failure-reason')).toBeVisible();
  expect((await saved(page)).best.rulesVersion).toBe(RULES_VERSION);
  await page.screenshot({path: info.outputPath('02-result.png')});
  await page.getByRole('button', {name: '再来一局'}).click();
  await view(page, 'play');
  expect((await snapshot(page)).ended).toBe(false);
  expect((await snapshot(page)).time).toBeLessThan(1);
  await expect(page.locator('#opening-hint')).toBeHidden();
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
      await expect.poll(async () => (await snapshot(page)).kills).toBeGreaterThanOrEqual(1);
      const cleared=await snapshot(page);
      expect(cleared.score).toBe(cleared.kills);
      expect(cleared.fields.some(field=>field.kind==='fire')).toBe(true);
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
  await scenario(page, 'fail'); await view(page, 'revive');
  const offer=await snapshot(page);
  await page.setViewportSize({width: 390, height: 844}); await view(page, 'rotate');
  await page.setViewportSize({width: 844, height: 390}); await view(page, 'revive');
  expect(await snapshot(page)).toEqual(offer);
  await page.getByRole('button',{name:'放弃复活，查看成绩'}).click();await view(page,'result');
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

test('one revival preserves the run and saves the final kill count only after the second defeat', async ({page}) => {
  await page.getByRole('button',{name:/开始挑战/}).click();
  await view(page,'play');
  // Position two active enemies in the normal game. The skill, coins, contact damage
  // and score all run through the production simulation.
  await page.evaluate(()=>{
    const game=window.__gameTest.game(),{player}=game.state;
    for(const dy of [-20,20])game.spawnEnemy('bun',{x:player.x+20,y:player.y+dy}).spawnAt=-1;
    game.triggerSkill('fan');
  });
  await expect(page.locator('#score-value')).toHaveText('2');
  await expect(page.locator('#combo-value')).toHaveText('×2');
  await expect(page.locator('#coin-value')).toHaveText('2');
  async function lethalContact() {
    await page.evaluate(()=>{
      const game=window.__gameTest.game(),s=game.state;
      s.player.hp=1;s.player.invulnerableUntil=0;
      game.spawnEnemy('bowl',s.player).spawnAt=s.time-2;
    });
  }
  await lethalContact();await view(page,'revive');
  const fallen=await snapshot(page);
  expect((await saved(page)).best).toBeNull();
  await page.getByRole('button',{name:'免费复活',exact:true}).click();
  await view(page,'countdown');
  const revived=await snapshot(page);
  expect(revived.revivesUsed).toBe(1);
  expect(revived.player.hp).toBe(revived.player.maxHp);
  expect([revived.time,revived.wave,revived.kills,revived.collectedCoins]).toEqual([fallen.time,fallen.wave,fallen.kills,fallen.collectedCoins]);
  await view(page,'play');
  expect((await saved(page)).best).toBeNull();
  await lethalContact();await view(page,'result');
  const final=await snapshot(page);
  await expect(page.locator('#result-kills')).toHaveText(String(final.kills));
  await expect(page.locator('#result-coins')).toHaveText(String(final.collectedCoins));
  expect((await saved(page)).best.score).toBe(final.kills);
});

test('practice pickup and wave samples reset independently and do not carry rewards to the main run', async ({page}) => {
  await page.setViewportSize({width:844,height:390});
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();await view(page,'lab');
  await page.getByRole('button',{name:'取卡清场',exact:true}).click();await view(page,'play');
  const initial=await snapshot(page);
  expect(initial.practice).toBe(true);
  expect(initial.pickups.some(p=>p.kind==='fan')).toBe(true);
  await page.keyboard.down('ArrowRight');
  try {
    await expect.poll(async()=>(await snapshot(page)).fields.some(f=>f.kind==='fire')).toBe(true);
    await expect(page.locator('.combo-count')).toBeVisible();
    await expect(page.locator('#burst-value')).toBeVisible();
    await expect(page.locator('#burst-value')).toHaveText(/瞬间击败 \d+/);
    await expect.poll(async()=>(await snapshot(page)).collectedCoins).toBeGreaterThan(0);
  } finally { await page.keyboard.up('ArrowRight'); }
  const cleared=await snapshot(page);
  expect(cleared.kills).toBeGreaterThan(0);expect(cleared.enemies.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'试验工具',exact:true}).click();
  await page.getByRole('button',{name:'连续换波',exact:true}).click();
  const before=await snapshot(page);
  expect(before.wave).toBe(1);expect(before.coins.length).toBeGreaterThan(0);expect(before.pickups.length).toBeGreaterThan(0);
  await expect(page.locator('#wave-value')).toHaveText('2');
  await expect(page.locator('#wave-banner')).toHaveText('WAVE 2');
  await expect(page.locator('#wave-banner')).toBeVisible();
  const after=await snapshot(page);
  expect(after.player.x).toBe(before.player.x);expect(after.coins).toEqual(before.coins);expect(after.pickups).toEqual(before.pickups);
  await page.getByRole('button',{name:'试验工具',exact:true}).click();
  await page.getByRole('button',{name:'取卡清场',exact:true}).click();
  const repeated=await snapshot(page);
  expect([repeated.wave,repeated.collectedCoins,repeated.seed]).toEqual([1,0,initial.seed]);
  await page.keyboard.press('Escape');await view(page,'pause');
  await page.getByRole('button',{name:'返回首页',exact:true}).click();
  await page.getByRole('button',{name:'结束本局',exact:true}).click();await view(page,'home');
  await page.getByRole('button',{name:/开始挑战/}).click();
  await view(page,'play');
  expect((await snapshot(page)).practice).toBe(false);
  await expect(page.locator('#score-value')).toHaveText('0');await expect(page.locator('#coin-value')).toHaveText('0');
  await expect(page.locator('#lab-button')).toBeHidden();expect((await saved(page)).best).toBeNull();
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

