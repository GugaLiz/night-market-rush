import {expect, test, type Page} from '@playwright/test';
import {CONFIG, WORLD} from '../../src/core/config';
import {EXPRESS, WAVES} from '../../src/core/ultimates';
import type {UltimateKind} from '../../src/shared/types';

interface Pulse { pattern: number[]; time: number }
declare global {
  interface Window { skillProbe: {pulses: Pulse[]; cameraPeak: number} }
}

test.use({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true});
test.beforeEach(async ({page}) => {
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time: start});
  await page.clock.pauseAt(new Date(+start + 1000));
  await page.addInitScript(world => {
    const probe: Window['skillProbe'] = window.skillProbe = {pulses: [], cameraPeak: 0};
    Object.defineProperty(navigator, 'vibrate', {configurable: true, value(pattern: number | number[]) {
      probe.pulses.push({pattern: Array.isArray(pattern) ? [...pattern] : [pattern], time: window.__gameTest?.game().state.time ?? 0});
      return true;
    }});
    // Read the transform while the actual scenery is painted. Its canvas is restored before RAF returns.
    const proto = CanvasRenderingContext2D.prototype;
    proto.drawImage = new Proxy(proto.drawImage, {apply(draw, ctx: CanvasRenderingContext2D, args) {
      const image: unknown = args[0];
      if (ctx.canvas.id === 'game-canvas' && image instanceof HTMLImageElement && image.src.endsWith('clay-night-market.webp')) {
        const center = ctx.getTransform().transformPoint({x: world.width / 2, y: world.height / 2});
        probe.cameraPeak = Math.max(probe.cameraPeak, Math.hypot(center.x - ctx.canvas.width / 2, center.y - ctx.canvas.height / 2));
      }
      return Reflect.apply(draw, ctx, args);
    }});
  }, WORLD);
  await page.goto('/');
});

async function pulses(page: Page) {
  return page.evaluate(() => window.skillProbe.pulses.filter(call => call.pattern.some(value => value > 0)));
}

async function triggerInLab(page: Page, kind: UltimateKind) {
  await page.getByLabel('试验技能', {exact: true}).selectOption(kind, {force: true});
  await page.getByRole('button', {name: '触发并体验'}).tap({force: true});
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view', 'play');
}

test('collecting a wave in a normal challenge vibrates once at release', async ({page}) => {
  await page.getByRole('button', {name: '开始挑战', exact: true}).tap({force: true});
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view', 'play');
  for (const kind of ['icebox', 'steamer', 'berry'] as const) {
    // Place just the bubble. The normal movement, pickup, windup and damage systems still run.
    await page.evaluate(({kind, radius}) => {
      const s = window.__gameTest.game().state;
      s.pickups = [{id: 31000, kind, x: s.player.x, y: s.player.y, radius, bornAt: s.time}];
    }, {kind, radius: CONFIG.pickup.radius});
    const before = (await pulses(page)).length;
    await page.clock.runFor(80);
    const cast = await page.evaluate(k => window.__gameTest.game().state.ultimates?.find(c => c.kind === k), kind);
    expect(cast).toMatchObject({kind, released: false});
    expect(await pulses(page)).toHaveLength(before);
    await page.clock.runFor(950);
    const after = await pulses(page);
    expect(after).toHaveLength(before + 1);
    expect(Math.abs(after[before].time - cast!.bornAt - WAVES[kind].windup)).toBeLessThan(.035);
  }
});

test('express delivery pulses at each landing, accents signed orders and stops on pause', async ({page}) => {
  await page.getByRole('button', {name: '配送试验场', exact: true}).tap({force: true});
  await triggerInLab(page, 'express');
  const bornAt = await page.evaluate(() => window.__gameTest.game().state.ultimates![0].bornAt);
  await page.clock.runFor(900);
  expect(await pulses(page)).toHaveLength(0);
  await page.clock.runFor(13900);
  for (let i = 0; i < 30 && (await pulses(page)).length < EXPRESS.legs; i++) await page.clock.runFor(16);
  const landings = await pulses(page);
  expect(landings).toHaveLength(EXPRESS.legs);
  for (const [i, landing] of landings.entries()) {
    expect(Math.abs(landing.time - bornAt - EXPRESS.windup - (i + 1) * EXPRESS.leg)).toBeLessThan(.035);
  }
  expect(landings[3].pattern).not.toEqual(landings[0].pattern);
  expect(landings.at(-1)!.pattern).not.toEqual(landings[3].pattern);
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view', 'pause');
  expect(await page.evaluate(() => window.skillProbe.pulses.at(-1)?.pattern.every(value => value === 0))).toBe(true);
  await page.clock.runFor(500);
  expect(await pulses(page)).toHaveLength(EXPRESS.legs);
});

test('camera and device toggles work independently, and reduced motion suppresses both', async ({page}) => {
  await page.getByRole('button', {name: '配送试验场', exact: true}).tap({force: true});
  await page.getByRole('button', {name: '继续试验', exact: true}).tap({force: true});
  for (const profile of [
    {toggles: ['画面震动'], camera: false, device: true},
    {toggles: ['画面震动', '设备振动'], camera: true, device: false},
    {toggles: ['设备振动', '减少动态'], camera: false, device: false},
  ]) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: '设置', exact: true}).tap({force: true});
    await page.getByRole('tab', {name: '画面', exact: true}).tap({force: true});
    for (const label of profile.toggles) await page.getByRole('switch', {name: label, exact: true}).tap({force: true});
    await page.getByRole('button', {name: '应用', exact: true}).tap({force: true});
    await page.getByRole('button', {name: '继续挑战', exact: true}).tap({force: true});
    await page.getByRole('button', {name: '试验工具', exact: true}).tap({force: true});
    await page.evaluate(() => { window.skillProbe.pulses.length = 0; window.skillProbe.cameraPeak = 0; });
    await triggerInLab(page, 'berry');
    await page.clock.runFor(850);
    expect(await pulses(page)).toHaveLength(profile.device ? 1 : 0);
    const peak = await page.evaluate(() => window.skillProbe.cameraPeak);
    if (profile.camera) expect(peak).toBeGreaterThan(1);
    else expect(peak).toBeLessThan(.01);
  }
});

test('changing the system motion preference during play updates both feedback channels', async ({page}) => {
  await page.getByRole('button', {name: '配送试验场', exact: true}).tap({force: true});
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    await page.emulateMedia({reducedMotion});
    await page.clock.runFor(40);
    await page.evaluate(() => { window.skillProbe.pulses.length = 0; window.skillProbe.cameraPeak = 0; });
    await triggerInLab(page, 'steamer');
    await page.clock.runFor(1150);
    const enabled = reducedMotion === 'no-preference';
    expect(await pulses(page)).toHaveLength(enabled ? 1 : 0);
    expect(await page.evaluate(() => window.skillProbe.cameraPeak > 1)).toBe(enabled);
    await page.getByRole('button', {name: '试验工具', exact: true}).tap({force: true});
  }
});
