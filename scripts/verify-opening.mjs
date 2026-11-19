import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {recordNormalRun, round, position} from './gameplay-recording.mjs';

// Read the same HUD and rendered objects that guide the touch controls in the recording.
// All hooks are test-side, observe drawing only, and are installed before navigation.
function observeOpening() {
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect, ellipse = proto.ellipse, image = proto.drawImage;
  let frame, cameraInverse, pickupShadow, start, fanAt, killsBeforeFan, coinsBeforeFan, killsInWindow = 0;
  const hud = id => parseInt(document.getElementById(id).textContent, 10);
  const drawingGame = ctx => ctx.canvas.id === 'game-canvas';
  function worldAtOrigin(ctx) {
    const {e, f} = ctx.getTransform();
    const {x, y} = cameraInverse.transformPoint({x:e, y:f});
    return {x,y};
  }
  proto.clearRect = function (...args) {
    if (drawingGame(this)) {
      const shell = document.getElementById('game-shell');
      if (shell?.dataset.view === 'play') {
        const now = performance.now();
        start ??= now;
        const time = (now-start)/1000, kills = hud('score-value'), collectedCoins = hud('coin-value');
        if (fanAt === undefined && frame) {
          killsBeforeFan = frame.kills;
          coinsBeforeFan = frame.collectedCoins;
        }
        if (fanAt !== undefined && time-fanAt <= .650) killsInWindow = kills-killsBeforeFan;
        frame = {time, kills, collectedCoins, pickups:[], coins:[], enemies:[], steamBrushes:0,
          hp:hud('hp-value'), wave:hud('wave-value'), practice:shell.dataset.practice === 'true'};
        cameraInverse = undefined;
        pickupShadow = undefined;
      } else frame = undefined;
    }
    return clear.apply(this, args);
  };
  proto.ellipse = function (x,y,rx,ry,...rest) {
    if (frame && drawingGame(this) && cameraInverse) {
      if (rx === 24 && ry === 24*.32) frame.player = {x, y:y-2};
      if ((rx === 18 || rx === 26) && ry === rx*.32) frame.enemies.push({x,y:y-2});
      if (x === 0 && y === 0 && rx === 19 && ry === 5) pickupShadow = worldAtOrigin(this);
      if (x === 0 && y === 1 && (ry === 7.8*.40 || ry === 9*.40)) frame.coins.push(worldAtOrigin(this));
    }
    return ellipse.call(this,x,y,rx,ry,...rest);
  };
  proto.drawImage = function (source,...args) {
    if (frame && drawingGame(this) && source instanceof HTMLImageElement) {
      // Remove the exact scale and shake transform used for the painted floor.
      if (!cameraInverse && args.length === 4 && args[2] === 1280 && args[3] === 720)
        cameraInverse = this.getTransform().inverse();
      if (args.length === 8 && pickupShadow && source.src.endsWith('/skills-v2.png')) {
        const column = Math.floor(args[0]*4/source.naturalWidth), row = Math.floor(args[1]*4/source.naturalHeight);
        frame.pickups.push({...pickupShadow, isFan:row === 0 && column === 0});
        pickupShadow = undefined;
      }
      if (args.length === 8 && source.src.endsWith('/delivery-skills.webp') && args[1] === 0) {
        fanAt ??= frame.time;
        frame.steamBrushes++;
      }
    }
    return image.call(this,source,...args);
  };
  window.readOpeningPicture = () => frame?.player && {...frame, fanAt, killsBeforeFan, coinsBeforeFan, killsInWindow};
}

const output = process.env.V4_OPENING_OUTPUT || fileURLToPath(new URL('../test-results/recordings/opening/', import.meta.url));
const {bytes, evidence, result} = await recordNormalRun(async ({page, snapshot, touch, still, origin, tap, startState}) => {
  const route = [];
  const developmentHookAbsent=await page.evaluate(() => typeof window.__gameTest==='undefined');
  if(!await page.locator('script[src$="/@vite/client"]').count())assert.ok(developmentHookAbsent,'Production must omit its development hooks.');
  let fan, firstDash, firstCollectionAfterPickup, burst, burstAt, phase = '', aimedAt, final;
  let turnDegrees = 0, coinTarget;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const state = await snapshot(), t = state.time, p = state.player;
    assert.equal(await page.locator('#game-shell').getAttribute('data-view'), 'play', 'Normal run was interrupted.');
    if (t >= 9.4) {final = state; break;}
    const fireAt = state.fanAt;
    fan ??= state.pickups.find(item => item.isFan);
    if (fireAt !== undefined && !burst && t-fireAt >= .52 && state.steamBrushes >= 8) {
      burst = await still();
      burstAt = t;
    }
    if (fireAt !== undefined && !firstCollectionAfterPickup && state.collectedCoins > state.coinsBeforeFan) firstCollectionAfterPickup = t;
    let goal = fan, nextPhase = 'approach-fan';
    if (fireAt !== undefined) {
      if (state.coins.length) {
        // Hold the destination until it is collected. A centroid can fall between two far piles.
        goal = coinTarget && state.coins.find(coin => Math.hypot(coin.x-coinTarget.x,coin.y-coinTarget.y)<12);
        if (!goal) {
          const sorted = state.coins.toSorted((a,b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
          goal = sorted.find(coin => Math.hypot(coin.x-p.x,coin.y-p.y) >= 55) ?? sorted.at(-1);
          coinTarget = goal;
        }
        nextPhase = 'collect';
      } else {
        // With dispersed spawns the next coin source can be across the square.
        goal = state.enemies.toSorted((a,b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0] ?? {x:640,y:370};
        nextPhase = 'approach-nearest-enemy';
      }
    }
    if (goal) {
      const dx = goal.x - p.x, dy = goal.y - p.y, length = Math.max(1, Math.hypot(dx,dy));
      const stick = {x: origin.x + dx/length * 25, y: origin.y + dy/length * 25, id: 1};
      await touch('touchMove', [stick]);
      if (nextPhase === 'collect') {
        const ax = fan.x - startState.player.x, ay = fan.y - startState.player.y;
        const cosine = (ax * dx + ay * dy) / (Math.hypot(ax, ay) * length);
        turnDegrees = Math.max(turnDegrees, Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI);
      }
      if (phase !== nextPhase) {phase = nextPhase; route.push({t:round(t), phase, player:position(p), aim:position(goal)});}
      if (burst && !firstDash) {
        aimedAt = position(goal);
        await touch('touchStart', [stick, tap]); await touch('touchEnd', [tap]);
        const dash = await snapshot();
        await page.locator('#dash-button[data-ready="false"]').waitFor();
        assert.ok(await page.locator('#joystick').evaluate(el => el.classList.contains('is-active')));
        firstDash = dash.time;
      }
    }
    await page.waitForTimeout(58);
  }
  assert.ok(final && fan && burst && final.collectedCoins>final.coinsBeforeFan && firstDash && firstCollectionAfterPickup && turnDegrees>=35, 'Missing visible fan, coin collection, turn, dash or final checkpoint.');
  const report = {method:'从首页点开始挑战进入普通第一波。通过画布上的角色脚影、道具和掉币位置引导双指触摸。首次画出电扇蒸汽后，按可见 HUD 记录 650 毫秒内实际击败数。摄录页面实帧与游戏原声。',
    limits:'时间以普通局首个显示帧为零。击败数包括同时挥动的武器。桌面 Chrome 模拟横屏触摸，未测真机。',
    developmentHookAbsent, practice:final.practice, wave:final.wave, fireAt:round(final.fanAt), burstAt:round(burstAt), fan:position(fan), killsBeforePickup:final.killsBeforeFan,
    killsInFirst650ms:final.killsInWindow, dashAt:round(firstDash), dashAim:aimedAt, coinsBeforePickup:final.coinsBeforeFan,
    firstCollectionAfterPickup:round(firstCollectionAfterPickup), maxStickTurnWhileCollectingDegrees:round(turnDegrees),
    final:{t:round(final.time), kills:final.kills, collectedCoins:final.collectedCoins, hp:final.hp}, route};
  return {report, burst};
}, {observe:observeOpening, read:() => window.readOpeningPicture(), defaultURL:'http://127.0.0.1:4173'});
const report = {...evidence, ...result.report};
const burst = result.burst;
await mkdir(output, {recursive:true});
await Promise.all([writeFile(join(output,'opening.webm'), bytes), writeFile(join(output,'burst.webp'), burst), writeFile(join(output,'report.json'), JSON.stringify(report,null,2)+'\n')]);
console.log(JSON.stringify(report));
