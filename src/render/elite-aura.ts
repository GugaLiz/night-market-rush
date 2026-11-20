import type {EliteKind, Enemy, Settings} from '../shared/types';
import type {Sprite} from './assets';

const colors = {
  giantBun: {body: '#ffad26', tip: '#ffeb9b'},
  eliteCrab: {body: '#fc493e', tip: '#ffb08a'},
  eliteKettle: {body: '#19cca6', tip: '#b8ffe0'},
  eliteSesame: {body: '#b25cff', tip: '#f4c5ff'},
} satisfies Record<EliteKind, {body: string; tip: string}>;
type Palette = typeof colors[EliteKind];
const tau = Math.PI * 2;
const rims = new WeakMap<Sprite, HTMLCanvasElement>();

// Build a colored rim from the actual alpha of each atlas frame, including the kettle spout
// and crab claws. The small shadow and outline are baked once, never applied to the game canvas.
function spriteRim(sprite: Sprite, palette: Palette): HTMLCanvasElement {
  const cached = rims.get(sprite);
  if (cached) return cached;
  const {width, height} = sprite;
  const pad = Math.ceil(height * .14);
  const mask = document.createElement('canvas'), rim = document.createElement('canvas');
  mask.width = width; mask.height = height;
  rim.width = width + pad * 2; rim.height = height + pad * 2;
  const m = mask.getContext('2d')!, r = rim.getContext('2d')!;
  m.drawImage(sprite.image, sprite.x, sprite.y, width, height, 0, 0, width, height);
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = palette.body; m.fillRect(0, 0, width, height);
  r.shadowBlur = height * .065; r.shadowColor = palette.body;
  r.drawImage(mask, pad, pad);
  r.shadowBlur = 0;
  for (let i = 0; i < 8; i++) {
    const angle = i * tau / 8;
    r.drawImage(mask, pad + Math.cos(angle) * height * .024, pad + Math.sin(angle) * height * .024);
  }
  m.fillStyle = palette.tip; m.fillRect(0, 0, width, height);
  for (let i = 0; i < 4; i++) {
    const angle = i * tau / 4;
    r.drawImage(mask, pad + Math.cos(angle) * height * .011, pad + Math.sin(angle) * height * .011);
  }
  r.globalCompositeOperation = 'destination-out';
  r.drawImage(mask, pad, pad);
  rims.set(sprite, rim);
  return rim;
}

// The flame rises up each flank from behind the body. Keep the floor and the health plaque clear.
function drawFlank(c: CanvasRenderingContext2D, side: number, radius: number, height: number,
  phase: number, charging: boolean, simple: boolean, palette: Palette): void {
  const flutter = Math.sin(phase) * .043;
  const reach = charging ? 1.14 : 1;
  c.save(); c.scale(side * radius, height);
  const fill = c.createLinearGradient(0, -.91, 0, -.04);
  fill.addColorStop(0, palette.tip + 'df'); fill.addColorStop(.36, palette.body + 'ac');
  fill.addColorStop(.8, palette.body + '6b'); fill.addColorStop(1, palette.body + '00');
  c.fillStyle = fill;
  c.beginPath(); c.moveTo(.45, -.04);
  c.bezierCurveTo(.91, -.06, 1.05, -.17, 1.08, -.30);
  c.quadraticCurveTo(1.12, -.48, 1.21 * reach, -.59 + flutter);
  c.quadraticCurveTo(1.09, -.55, 1.035, -.48);
  c.bezierCurveTo(1.11, -.68, .93, -.74, (1.01 + flutter) * reach, -.87 + flutter);
  c.quadraticCurveTo(.74, -.72, .73, -.56);
  c.quadraticCurveTo(.67, -.63, .74, -.72);
  c.quadraticCurveTo(.45, -.53, .45, -.04);
  c.closePath(); c.fill();
  if (!simple) {
    const alpha = c.globalAlpha;
    c.fillStyle = palette.tip;
    c.globalAlpha = alpha * .63;
    c.beginPath(); c.moveTo(.72, -.14);
    c.bezierCurveTo(1.03, -.24, .97, -.34, 1.12 + flutter, -.52);
    c.bezierCurveTo(1.01, -.32, 1.09, -.24, .72, -.14);
    c.fill();
    const travel = (phase / tau % 1 + 1) % 1;
    c.globalAlpha = alpha * .9 * Math.sin(Math.PI * travel);
    const x = .95 + .21 * Math.sin(Math.PI * travel);
    const y = -.36 - .57 * travel;
    c.beginPath(); c.moveTo(x, y - .043);
    c.bezierCurveTo(x + .008, y - .010, x + .032, y + .013, x, y + .028);
    c.quadraticCurveTo(x - .042, y + .020, x, y - .043); c.fill();
  }
  c.restore();
}

/** Local sprite space, with the bottom center at zero and the same pose and facing as the elite. */
export function drawEliteAura(c: CanvasRenderingContext2D, enemy: Enemy, kind: EliteKind, sprite: Sprite,
  height: number, time: number, settings: Settings): void {
  const palette = colors[kind], rim = spriteRim(sprite, palette);
  const scale = height / sprite.height, width = sprite.width * scale;
  const frozen = (enemy.chilledUntil ?? 0) > time || (enemy.frostUntil ?? 0) > time;
  const still = settings.reduceMotion || frozen || enemy.stunUntil > time;
  const charging = enemy.phase === 'warn' || enemy.phase === 'dash' || enemy.jump?.phase === 'warn' ||
    enemy.jump?.phase === 'flight' || (enemy.shotWarnUntil ?? 0) > time || (enemy.volleyRemaining ?? 0) > 0;
  c.save();
  if (!still) {
    const phase = time * (charging ? 7 : 4.1) + enemy.id * 1.8;
    const simple = settings.quality === 'simple';
    drawFlank(c, -1, width / 2, height, phase, charging, simple, palette);
    drawFlank(c, 1, width / 2, height, phase + 2.1, charging, simple, palette);
  }
  c.globalAlpha *= frozen ? .48 : charging ? 1 : .88;
  const pad = (rim.height - sprite.height) * .5 * scale;
  c.drawImage(rim, -width / 2 - pad, -height - pad, rim.width * scale, rim.height * scale);
  c.restore();
}
