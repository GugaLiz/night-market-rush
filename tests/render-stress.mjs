import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const output = new URL('../test-results/stress/', import.meta.url);
const quality = process.env.STRESS_QUALITY === 'simple' ? 'simple' : 'standard';
await mkdir(output, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 2});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/stress-fixture', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#222}canvas{display:block;width:1280px;height:720px}.label{position:absolute;left:18px;top:14px;background:#fff0d8ed;color:#59361e;padding:10px 16px;border-radius:10px;font:16px sans-serif}</style><canvas></canvas><div class="label">人为构造压力场景 · 60 个敌人 · 3 个道具 · 三种技能叠加 · ${quality === 'simple' ? '简化画质' : '标准画质'} · 屏幕 DPR 2</div>`}));
await page.goto('http://127.0.0.1:5173/stress-fixture');
const result = await page.evaluate(async quality => {
  const [{Renderer}, {loadAssets}, {Game}, {CONFIG}, {DEFAULT_SETTINGS}] = await Promise.all([
    import('/src/render/renderer.ts'), import('/src/render/assets.ts'), import('/src/core/game.ts'), import('/src/core/config.ts'), import('/src/shared/types.ts'),
  ]);
  const renderer = new Renderer(document.querySelector('canvas'), await loadAssets());
  renderer.setSettings({...DEFAULT_SETTINGS, quality});
  const state = new Game(42).state;
  state.time = 190;
  state.stage = 4;
  state.player.skateUntil = 999;
  state.player.x = 640;
  state.player.y = 380;
  state.player.vx = 100;
  state.enemies = Array.from({length: 60}, (_, i) => ({
    id: i + 1, kind: ['bun', 'box', 'bowl'][i % 3], x: 0, y: 0, px: 0, py: 0,
    radius: CONFIG.enemies[['bun', 'box', 'bowl'][i % 3]].radius, spawnAt: 0,
    slowUntil: i % 2 ? 999 : 0, phase: i === 1 || i === 4 ? 'warn' : 'chase', phaseUntil: 999,
    dashX: i === 1 ? 1 : -1, dashY: 0, facing: i % 2 ? 1 : -1,
  }));
  state.pickups = ['fan', 'skate', 'soda'].map((kind, i) => ({id: 100 + i, kind, x: 500 + 140 * i, y: 560, radius: 15, bornAt: 0}));
  const intervals = [], drawing = [];
  let previous = performance.now(), start = 0, warmup = 0, lastBurst = -1;
  await new Promise(resolve => {
    function frame(now) {
      const delta = now - previous;
      previous = now;
      state.time += Math.min(.05, delta / 1000);
      state.enemies.forEach((enemy, i) => {
        enemy.x = 155 + i % 10 * 105 + Math.sin(state.time * 2 + i) * 8;
        enemy.y = 180 + Math.floor(i / 10) * 75 + Math.cos(state.time * 2 + i) * 5;
      });
      const burst = Math.floor(state.time * 2.5);
      if (burst !== lastBurst) {
        lastBurst = burst;
        renderer.events([
          {type: 'pickup', kind: 'fan', x: 640, y: 380},
          {type: 'pickup', kind: 'soda', x: 640, y: 380},
          {type: 'pickup', kind: 'skate', x: 640, y: 380},
          ...Array.from({length: 12}, (_, i) => ({type: 'kill', kind: 'bun', x: 200 + i * 75, y: 220 + i % 3 * 100, points: 10})),
        ]);
      }
      const before = performance.now();
      renderer.render(state, delta / 1000, 'play');
      const drawMs = performance.now() - before;
      if (warmup++ >= 30) {
        if (!start) start = now;
        else { intervals.push(delta); drawing.push(drawMs); }
      }
      if (start && now - start >= 3000) resolve(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
  return {
    scenario: 'Artificial rendering stress fixture; not gameplay progression or a mobile-device benchmark.',
    viewport: '1280x720 at DPR 2', enemies: state.enemies.length, pickups: state.pickups.length,
    settings: {...DEFAULT_SETTINGS, quality}, renderDpr: document.querySelector('canvas').width / 1280, measuredFrames: intervals.length,
    averageFps: Number((1000 / mean(intervals)).toFixed(2)),
    averageFrameMs: Number(mean(intervals).toFixed(2)), p95FrameMs: Number(percentile(intervals, .95).toFixed(2)),
    slowFramesOver25ms: intervals.filter(ms => ms > 25).length,
    averageDrawSubmissionMs: Number(mean(drawing).toFixed(2)), p95DrawSubmissionMs: Number(percentile(drawing, .95).toFixed(2)),
  };
}, quality);
await page.screenshot({path: fileURLToPath(new URL(`60-enemies-three-skills-${quality}.png`, output))});
result.pageErrors = errors;
await writeFile(new URL(`metrics-${quality}.json`, output), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
