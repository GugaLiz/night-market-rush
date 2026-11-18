// The default gameplay snapshot is for the Vite laboratory. A recording may instead supply
// an observer of the displayed page, which also works with a production build.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';

const viewport = {width: 960, height: 540};
export const round = value => Number(value.toFixed(3));
export const position = item => ({x: round(item.x), y: round(item.y)});
export async function recordNormalRun(play, {observe, read, defaultURL = 'http://127.0.0.1:5173'} = {}) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
  const page = await browser.newPage({viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true});
  const devtools = await page.context().newCDPSession(page);
  // Keep the loaded revision for the whole take when Vite notices parallel file writes.
  await page.routeWebSocket(url => url.searchParams.has('token'), socket => socket.onMessage(() => {}));
  const errors = [], frames = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());});
  if (observe) await page.addInitScript(observe);
  const snapshot = () => page.evaluate(read ?? (() => window.__gameTest.snapshot()));
  const touch = (type, touchPoints) => devtools.send('Input.dispatchTouchEvent', {type, touchPoints});
  const still = async () => Buffer.from((await devtools.send('Page.captureScreenshot', {format:'webp',quality:94})).data, 'base64');

  // Copy the game's final compressed output to a recording bus. The playback path stays connected.
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...args) {
      if (target instanceof AudioDestinationNode && !window.openingMix) {
        window.openingMix = this.context.createMediaStreamDestination();
        connect.call(this, window.openingMix);
      }
      return connect.call(this, target, ...args);
    };
  });

  async function startCapture() {
    await page.evaluate(({width, height}) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', {alpha: false});
      const stream = canvas.captureStream(30);
      stream.addTrack(window.openingMix.stream.getAudioTracks()[0]);
      const recorder = new MediaRecorder(stream, {mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 3200000});
      const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const finished = new Promise(resolve => { recorder.onstop = () => resolve(new Blob(chunks, {type: recorder.mimeType})); });
      window.openingCapture = {
        async draw(data) {
          const image = new Image();
          image.src = 'data:image/jpeg;base64,' + data;
          await image.decode();
          ctx.drawImage(image, 0, 0, width, height);
          if (recorder.state === 'inactive') recorder.start();
        },
        async finish() {
          recorder.stop();
          const blob = await finished;
          stream.getVideoTracks()[0].stop();
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.slice(reader.result.indexOf('base64,') + 7));
            reader.readAsDataURL(blob);
          });
        },
      };
    }, viewport);
    let sending = false;
    devtools.on('Page.screencastFrame', async event => {
      if (sending) {await devtools.send('Page.screencastFrameAck', {sessionId: event.sessionId}); return;}
      sending = true;
      try {
        await page.evaluate(data => window.openingCapture.draw(data), event.data);
        frames.push(event.metadata.timestamp);
      } catch (error) {errors.push(error.message);}
      finally {sending = false; await devtools.send('Page.screencastFrameAck', {sessionId: event.sessionId});}
    });
    await devtools.send('Page.startScreencast', {format: 'jpeg', quality: 85, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 2});
  }

  async function playableWebm(bytes, temp) {
    // A seekable WebM needs an indexed container. Stream-copy both codec tracks without re-encoding.
    const require = createRequire(import.meta.url);
    const registry = JSON.parse(await readFile(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'));
    const revision = registry.browsers.find(x => x.name === 'ffmpeg').revision;
    const binary = {win32: 'ffmpeg-win64.exe', darwin: 'ffmpeg-mac', linux: 'ffmpeg-linux'}[process.platform];
    let ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    if (!process.env.FFMPEG_PATH) {
      for (let dir = dirname(chromium.executablePath()); dirname(dir) !== dir; dir = dirname(dir)) {
        const candidate = join(dir, 'ffmpeg-' + revision, binary);
        if (existsSync(candidate)) {ffmpeg = candidate; break;}
      }
    }
    const raw = join(temp, 'capture.webm'), final = join(temp, 'indexed.webm');
    await writeFile(raw, bytes);
    const command = spawnSync(ffmpeg, ['-loglevel', 'error', '-i', raw, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', final], {encoding: 'utf8'});
    assert.equal(command.status, 0, command.stderr || command.error?.message);
    return readFile(final);
  }

  async function verifyMedia(bytes) {
    return page.evaluate(async base64 => {
      const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const audio = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(binary.buffer.slice(0));
      const samples = audio.getChannelData(0);
      let peak = 0, squares = 0;
      for (const sample of samples) {peak = Math.max(peak, Math.abs(sample)); squares += sample * sample;}
      const video = document.createElement('video');
      video.muted = true; video.preload = 'auto';
      const ready = new Promise((resolve, reject) => {video.onloadeddata = resolve; video.onerror = reject;});
      video.src = URL.createObjectURL(new Blob([binary], {type: 'video/webm'}));
      await ready;
      const seek = new Promise(resolve => {video.onseeked = resolve;});
      video.currentTime = video.duration * .6;
      await seek;
      await video.play();
      await new Promise(resolve => video.requestVideoFrameCallback(resolve));
      video.pause();
      const media = {videoCodec:'VP8', audioCodec:'Opus', width:video.videoWidth, height:video.videoHeight,
        duration:video.duration, audioSeconds:audio.duration, channels:audio.numberOfChannels,
        audioPeak:peak, audioRms:Math.sqrt(squares / samples.length), seekPlaybackAt:video.currentTime};
      URL.revokeObjectURL(video.src);
      return media;
    }, bytes.toString('base64'));
  }

  const temp = await mkdtemp(join(tmpdir(), 'market-opening-'));
  try {
    await page.goto(process.env.BASE_URL || defaultURL, {waitUntil: 'networkidle'});
    // Unlock the original sound graph via a normal gesture so the title frame also has audio.
    await page.getByRole('button', {name:'玩法说明', exact:true}).tap();
    await page.getByRole('button', {name:'返回首页', exact:true}).tap();
    const start = page.getByRole('button', {name: '开始挑战', exact: true});
    await page.waitForFunction(() => window.openingMix?.stream.getAudioTracks().length === 1);
    await startCapture();
    await page.waitForTimeout(550);
    await start.tap();
    await page.locator('[data-view="play"]').waitFor({timeout: 7000});
    if (read) await page.waitForFunction(read);
    const startState = await snapshot();
    assert.equal(startState.practice, false);
    const rect = await page.locator('#game-shell').boundingBox();
    const dashButton = await page.locator('#dash-button').boundingBox();
    const origin = {x: rect.x + rect.width * .19, y: rect.y + rect.height * .75, id: 1};
    const tap = {x: dashButton.x + dashButton.width / 2, y: dashButton.y + dashButton.height / 2, id: 2};
    await touch('touchStart', [origin]);
    const result = await play({page, snapshot, touch, still, origin, tap, startState});
    await touch('touchEnd', []);
    await devtools.send('Page.stopScreencast');
    const bytes = await playableWebm(Buffer.from(await page.evaluate(() => window.openingCapture.finish()), 'base64'), temp);
    const media = await verifyMedia(bytes);
    assert.ok(frames.length >= 120 && media.duration >= 8 && media.duration <= 12);
    assert.ok(media.audioPeak > .01 && media.audioRms > .001 && Math.abs(media.duration-media.audioSeconds) < .3);
    assert.equal(media.width, viewport.width); assert.equal(media.height, viewport.height);
    assert.deepEqual(errors, []);
    return {result, bytes, evidence:{browser:browser.version(), viewport, capturedPageFrames:frames.length, media, errors}};
  } finally {await browser.close(); await rm(temp, {recursive:true, force:true});}
}
