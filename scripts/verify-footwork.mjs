// Measures what the canvas actually draws while walking, including on production builds.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
try {
  const page = await browser.newPage({viewport: {width: 960, height: 540}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.footPositions = [];
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (x, y, rx, ry, ...args) {
      if (this.canvas.id === 'game-canvas' && this.strokeStyle === '#fff1bc' && ry === 4) {
        window.footPositions.push({time: performance.now(), x, y});
      }
      return ellipse.call(this, x, y, rx, ry, ...args);
    };
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:4173', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: '开始挑战', exact: true}).click();
  await page.locator('[data-view="play"]').waitFor();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  await page.evaluate(() => { window.footPositions = []; });
  await page.waitForTimeout(900);
  const frames = await page.evaluate(() => window.footPositions);
  await page.keyboard.up('ArrowRight');
  const last = frames.at(-1);
  assert.ok(frames.length >= 15 && last.x - frames[0].x > 160, 'Expected sustained movement below the right boundary');
  const steps = frames.slice(1).map((sample, i) => sample.x - frames[i].x);
  assert.ok(steps.every(s => s >= 0));
  const repeats = steps.filter(s => Math.abs(s) < .0001).length;
  const hz = 1000 * steps.length / (last.time - frames[0].time);
  console.log(JSON.stringify({browser: browser.version(), frames: frames.length, hz: +hz.toFixed(1),
    repeatedPositions: repeats, intervals: steps.length, distance: +(last.x - frames[0].x).toFixed(2), errors}));
  assert.deepEqual(errors, []);
  if (hz > 85) assert.ok(repeats <= 1, 'Moving courier repeated positions on a high-refresh display');
} finally {
  await browser.close();
}
