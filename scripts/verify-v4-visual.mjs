// Run against the Vite development server. Only the public practice controls change gameplay.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rmdir, unlink, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.V4_VISUAL_OUTPUT || fileURLToPath(new URL('../docs/verification/v4/', import.meta.url));
const width = 1280, height = 720, fps = 25;
const frames = [], panels = [], errors = [];
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
const report = {
  browser: browser.version(), viewport: [width, height], fps,
  method: '三个对照均通过首页配送试验场的正常按钮进入。方向键控制移动，无冲刺。开发快照仅读。逐帧推进浏览器时钟，每 40 ms 采集真实页面；视频以 25 fps 编码，无音轨，不能测量设备帧率、手感或音画延迟。',
  limits: '选定样例供项目内复查，敌人数、速度、换波时长、蓝区减速、金币算法均为项目调校。原片只确定可见现象。未测得原作的输入、判定半径或内部触发条件。',
};

async function openDemo(name) {
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time: start});
  await page.clock.pauseAt(new Date(+start + 1000));
  await page.goto(baseURL, {waitUntil: 'networkidle'});
  // A paused clock has no automatic animation frames for Playwright's actionability wait.
  for (const label of ['配送试验场', name]) {
    const button = page.getByRole('button', {name: label, exact: true});
    await button.waitFor({state: 'visible'});
    await button.click({force: true});
  }
  assert.equal(await page.evaluate(() => window.__gameTest.view()), 'play');
  return page;
}

const state = page => page.evaluate(() => window.__gameTest.snapshot());
const shot = page => page.screenshot({type: 'jpeg', quality: 82, scale: 'css'});
const advance = page => page.clock.runFor(1000 / fps);
const round = value => Math.round(value * 1000) / 1000;
function location(item) { return {x: round(item.x), y: round(item.y)}; }
function stats(s) {
  return {
    t: round(s.time), player: location(s.player), wave: s.wave, hp: s.player.hp, kills: s.kills,
    survivors: s.enemies.length, collected: s.collectedCoins, groundValue: s.coins.reduce((sum, coin) => sum + coin.value, 0),
    fire: s.fields.filter(f => f.kind === 'fire' && s.time >= f.bornAt && s.time < f.expiresAt).length,
    blue: s.fields.filter(f => f.kind === 'blue' && s.time >= f.bornAt && s.time < f.expiresAt).length,
  };
}

async function capturePickup() {
  const page = await openDemo('取卡清场');
  const initial = await state(page);
  const away = initial.enemies.filter(e => e.x > 850).map(e => e.id);
  assert.equal(away.length, 8, 'The far queue is the comparison group.');
  const targets = [0.5, 1, 3, 5], samples = [], inputs = [];
  let pickupAt, key, before, beforeFrame;
  // Trace the same loop through the coin drops when movement tuning changes.
  const route = [
    {key: 'ArrowRight', reached: p => p.x >= 735},
    {key: 'ArrowDown', reached: p => p.y >= 555},
    {key: 'ArrowLeft', reached: p => p.x <= 530},
    {key: 'ArrowUp', reached: p => p.y <= 425},
    {key: 'ArrowRight', reached: p => p.x >= 655},
  ];
  let waypoint = 0;
  await advance(page);
  for (let i = 0; i < fps * 9; i++) {
    const s = await state(page);
    if (route[waypoint]?.reached(s.player)) waypoint++;
    const nextKey = route[waypoint]?.key ?? null;
    if (key !== nextKey) {
      if (key) await page.keyboard.up(key);
      if (nextKey) await page.keyboard.down(nextKey);
      key = nextKey; inputs.push({t: round(s.time), key});
    }
    const jpeg = await shot(page);
    frames.push(jpeg);
    const sample = {...stats(s), farQueueSurvivors: s.enemies.filter(e => away.includes(e.id)).length};
    const field = s.fields.find(f => f.kind === 'fire');
    if (field) assert.equal(sample.farQueueSurvivors, away.length, 'The far queue must survive the fire.');
    if (pickupAt === undefined && !field) { before = sample; beforeFrame = jpeg; }
    if (pickupAt === undefined && field) {
      pickupAt = field.bornAt;
      panels.push({title: 'B  ·  触碰前', data: beforeFrame, detail: '普通向右移动     远处队列 8 只'});
    }
    if (pickupAt !== undefined && targets.length && s.time - pickupAt >= targets[0]) {
      const target = targets.shift();
      samples.push({...sample, afterPickup: round(s.time - pickupAt), target});
      panels.push({title: 'B  ·  拾取后 ' + target + ' 秒', data: jpeg, detail: '击败 ' + s.kills + '     已收 ' + sample.collected + '     地面 ' + sample.groundValue + '     远队存活 ' + sample.farQueueSurvivors});
    }
    if (!targets.length) break;
    await advance(page);
  }
  assert.equal(samples.length, 4, 'All four playback checkpoints must exist.');
  assert.equal(waypoint, route.length, 'The player must finish the coin loop.');
  assert.ok(samples[0].kills > before.kills && samples[0].groundValue > 0 && samples[0].fire > 1);
  assert.ok(samples[2].fire === 0 && samples.at(-1).collected > samples[0].collected);
  // At the first checkpoint after the fire expires, all eight must still be alive.
  // By five seconds the pursuing queue can meet the player's normal weapon.
  assert.equal(samples[2].farQueueSurvivors, away.length);
  report.pickup = {
    reference: '录像 B 00:14.25–00:19.25。原片此段起点可见角色接近道具；项目的零点采用实际拾取模拟时刻，两者并非精确帧对帧同步。',
    clipStartSeconds: 0, clipFrames: frames.length, initial: stats(initial), inputs, before, pickupAt: round(pickupAt), samples,
  };
  await page.close();
}

function groundObjects(s) {
  return {pickups: s.pickups.map(p => ({id: p.id, kind: p.kind, ...location(p)})), coins: s.coins.map(c => ({id: c.id, value: c.value, ...location(c)}))};
}

async function captureWave() {
  const page = await openDemo('连续换波');
  const start = await state(page), baseline = groundObjects(start);
  const phases = ['before', 'during', 'after'];
  const samples = {}, colors = {}, clipStartSeconds = frames.length / fps;
  for (let i = 0; i < 140; i++) {
    await advance(page);
    const s = await state(page), jpeg = await shot(page);
    frames.push(jpeg);
    const age = s.time - s.waveStartedAt, phase = phases[0];
    const ready = phase === 'before' ? s.wave === 1 && s.time - start.time >= .4
      : phase === 'during' ? s.wave === 2 && age >= .5 : s.wave === 2 && age >= 2;
    if (!ready) continue;
    assert.deepEqual(groundObjects(s), baseline);
    assert.deepEqual(location(s.player), location(start.player));
    const color = await page.evaluate(() => {
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      // A clear patch of the upper-left scenery, outside the player and both queues.
      const rgb = ctx.getImageData(canvas.width * .13, canvas.height * .17, 12, 12).data;
      return [0, 1, 2].map(c => Math.round(rgb.filter((_, i) => i % 4 === c).reduce((a, b) => a + b, 0) / (rgb.length / 4)));
    });
    colors[phase] = color;
    samples[phase] = {t: round(s.time), wave: s.wave, player: location(s.player), ground: groundObjects(s), meanSceneRGB: color, horizontalMarchers: s.enemies.filter(e => e.march?.x && !e.march.y && e.march.until > s.time).length};
    if (phase !== 'during') panels.push({title: '换波  ·  WAVE ' + s.wave, data: jpeg, detail: '原位保留 ' + baseline.pickups.length + ' 件道具、' + baseline.coins.length + ' 处地面金币'});
    phases.shift();
    if (!phases.length) break;
  }
  assert.equal(phases.length, 0);
  assert.ok(colors.after.some((channel, i) => Math.abs(channel - colors.before[i]) >= 8), 'Scene must visually change at the stable checkpoint.');
  report.wave = {reference: '录像 B 00:39–00:42。同局转场前后跟踪实体及其世界坐标；试验场用正式换波逻辑提前到达临界时刻。', clipStartSeconds, inputs: [], samples};
  await page.close();
}

async function captureRoute() {
  const page = await openDemo('取卡清场');
  const start = await state(page), samples = [], inputs = [];
  const fanId = start.pickups.find(p => p.kind === 'fan').id;
  for (const [key, reached] of [
    ['ArrowDown', s => s.player.y >= 595], ['ArrowRight', s => s.player.x >= 910],
    ['ArrowUp', s => s.fields.some(f => f.kind === 'blue')],
  ]) {
    inputs.push({t: round((await state(page)).time), key});
    await page.keyboard.down(key);
    let s;
    for (let i = 0; i < 140; i++) { await advance(page); s = await state(page); if (reached(s)) break; }
    await page.keyboard.up(key);
    assert.ok(reached(s), 'Reach the route waypoint using the keyboard: ' + key);
    assert.ok(s.pickups.some(p => p.id === fanId), 'The passed fan must remain available.');
    const leftGroup = s.enemies.filter(e => e.x < s.player.x - 120).length;
    samples.push({...stats(s), routeKey: key, enemiesLeftOfPlayerBy120: leftGroup, fanStillOnGround: true});
  }
  await advance(page);
  panels.push({title: 'A  ·  沿下沿绕过电扇，折返取汽水', data: await shot(page), detail: '原电扇仍在场     三处蓝区可见'});
  const end = await state(page);
  report.route = {reference: '录像 A 00:18.5–00:29.5 的下沿换边，另以 01:02–01:06 对照队列、持续蓝区。此处沿同一试验场实走；道具、敌群配置和时间未逐帧匹配原片，蓝区减速是本项目设定。',
    start: stats(start), inputs, samples, normalizedHorizontalTravel: round((end.player.x - start.player.x) / 1120), normalization: '本项目活动场宽 1120 逻辑单位；取最终与初始位置的水平位移差。'};
  await page.close();
}

async function renderSheet() {
  const page = await browser.newPage();
  const data = await page.evaluate(async cards => {
    const canvas = document.createElement('canvas'), w = 560, h = 315, caption = 53;
    canvas.width = 2 * w; canvas.height = Math.ceil(cards.length / 2) * (h + caption);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#201d1b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, card] of cards.entries()) {
      const x = i % 2 * w, y = Math.floor(i / 2) * (h + caption);
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + card.data; await img.decode();
      ctx.drawImage(img, x, y, w, h);
      ctx.fillStyle = '#fff1d1'; ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(card.title, x + 12, y + h + 21);
      ctx.fillStyle = '#d0c3b6'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(card.detail, x + 12, y + h + 43);
    }
    return canvas.toDataURL('image/jpeg', .88).split(',')[1];
  }, panels.map(card => ({...card, data: card.data.toString('base64')})));
  await page.close();
  return Buffer.from(data, 'base64');
}

async function encodeVideo() {
  const require = createRequire(import.meta.url);
  const registry = JSON.parse(await readFile(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'));
  const revision = registry.browsers.find(b => b.name === 'ffmpeg').revision;
  const binary = {win32: 'ffmpeg-win64.exe', darwin: 'ffmpeg-mac', linux: 'ffmpeg-linux'}[process.platform];
  let executable = process.env.FFMPEG_PATH || 'ffmpeg';
  if (!process.env.FFMPEG_PATH) {
    for (let dir = dirname(chromium.executablePath()); dirname(dir) !== dir; dir = dirname(dir)) {
      const candidate = join(dir, 'ffmpeg-' + revision, binary);
      if (existsSync(candidate)) { executable = candidate; break; }
    }
  }
  const encoders = spawnSync(executable, ['-hide_banner', '-encoders'], {encoding: 'utf8'});
  if (encoders.status !== 0) throw new Error('Cannot run ffmpeg. Set FFMPEG_PATH to a compatible executable.');
  const codec = encoders.stdout.includes('libvpx-vp9') ? 'libvpx-vp9' : 'libvpx';
  const temp = await mkdtemp(join(tmpdir(), 'night-market-v4-'));
  const videoPath = join(temp, 'capture.webm');
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
      '-an', '-c:v', codec, '-b:v', '1800k', '-deadline', 'realtime', '-cpu-used', '5', '-pix_fmt', 'yuv420p', videoPath];
    const result = spawnSync(executable, args, {input: Buffer.concat(frames), maxBuffer: 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error('WebM encoding failed: ' + (result.stderr?.toString() || result.error?.message));
    return await readFile(videoPath);
  } finally {
    if (existsSync(videoPath)) await unlink(videoPath);
    await rmdir(temp);
  }
}

try {
  await capturePickup();
  await captureWave();
  await captureRoute();
  assert.deepEqual(errors, []);
  const sheet = await renderSheet(), video = await encodeVideo();
  await mkdir(output, {recursive: true});
  await writeFile(join(output, 'comparison.jpg'), sheet);
  await writeFile(join(output, 'pickup-wave.webm'), video);
  await writeFile(join(output, 'report.json'), JSON.stringify({...report, errors}, null, 2) + '\n');
  console.log('Verified V4 pickup, wave continuity and lower-edge route. Wrote ' + frames.length + ' frames and ' + panels.length + ' selected views.');
} finally {
  await browser.close();
}
