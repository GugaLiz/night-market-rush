import {WORLD} from '../core/config';
import {giantJumpHeight} from '../core/giant-bun';
import {clamp} from '../core/geometry';
import type {DamageSource, EnemyKind, GameEvent, GameState} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';

export const DAMAGE_LABEL_LAYOUT = {
  detailTtl: 3.2, deathTtl: 2.4, playerTtl: 1.05,
  maxRecent: 5, width: 104, rowHeight: 30, detailHeight: 16, budget: 30,
} as const;
const {width: WIDTH, rowHeight: HEIGHT, detailHeight: DETAILS} = DAMAGE_LABEL_LAYOUT;
const enemyHeight = (kind: EnemyKind) => kind === 'giantBun' ? 174 : kind === 'bowl' ? 92 : kind === 'box' ? 78 : 67;
type Hit = {id: number; amount: number; source: DamageSource | null; time: number; bornAt: number};
type Group = {
  id: number; total: number; count: number; anchorX: number; anchorY: number;
  offsetX: number; offsetY: number; bodyY: number; lastHit: number; deathAt: number | null; recent: Hit[];
};
type Rect = {x: number; y: number; w: number; h: number};
export interface DamageLabelGroup {
  victimId: number; x: number; y: number; height: number; anchorX: number; anchorY: number;
  player: boolean; heal: boolean; amount: number; count: number; recent: readonly Hit[];
  alpha: number; age: number; compact: boolean; source: DamageSource | null;
}
const crowds = (a: Rect, b: Rect) =>
  a.x < b.x+b.w+6 && a.x+a.w+6 > b.x && a.y < b.y+b.h+6 && a.y+a.h+6 > b.y;
const format = (amount: number) => Number.isInteger(amount) ? String(amount) : amount.toFixed(1);

export class DamageLabels {
  private clock = 0;
  private groups = new Map<number, Group>();
  // The simulation issues monotonically increasing IDs. Accommodate reordered batches
  // and reject stale replays without retaining every damage event in an endless run.
  private seen = new Float64Array(4096).fill(-1);
  private highestId = -1;
  private playerDamage: Hit | null = null;
  private playerHeal: Hit | null = null;
  private visible: DamageLabelGroup[] = [];

  reset(): void {
    this.clock = 0;
    this.groups.clear();
    this.seen.fill(-1);
    this.highestId = -1;
    this.playerDamage = this.playerHeal = null;
    this.visible = [];
  }

  add(event: GameEvent): void {
    if (event.type === 'kill') {
      const group = event.victimId === undefined ? undefined : this.groups.get(event.victimId);
      if (group && group.deathAt === null) {
        group.deathAt = this.clock;
        group.anchorX = event.x;
        group.anchorY = event.y - enemyHeight(event.kind);
        group.bodyY = event.y-28;
      }
      return;
    }
    if (event.type !== 'damage' && event.type !== 'heal') return;
    if (!Number.isFinite(event.amount) || event.amount <= 0 || !Number.isSafeInteger(event.id) || event.id < 0) return;
    const slot = event.id % this.seen.length;
    if (event.id <= this.highestId-this.seen.length || this.seen[slot] === event.id) return;
    this.highestId = Math.max(event.id, this.highestId);
    this.seen[slot] = event.id;
    const hit = {id: event.id, amount: event.amount, source: event.type === 'damage' ? event.source : null,
      time: event.type === 'damage' ? event.time : this.clock, bornAt: this.clock};
    if (event.type === 'heal') { this.playerHeal = hit; return; }
    if (event.victimId === 0) { this.playerDamage = hit; return; }

    let group = this.groups.get(event.victimId);
    if (!group) {
      group = {id: event.victimId, total: 0, count: 0, anchorX: event.x, anchorY: event.y-80,
        offsetX: 0, offsetY: 0, bodyY: event.y-28, lastHit: this.clock, deathAt: null, recent: []};
      this.groups.set(group.id, group);
    }
    if (group.deathAt !== null) return;
    group.total += hit.amount;
    group.count++;
    group.lastHit = this.clock;
    group.recent.push(hit);
    group.recent.sort((a,b) => a.time-b.time || a.id-b.id);
    if (group.recent.length > DAMAGE_LABEL_LAYOUT.maxRecent) group.recent.shift();
  }

  update(dt: number, state: GameState, reduceMotion=false): void {
    this.clock += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const enemies = new Map(state.enemies.map(e => [e.id, e]));
    for (const [id, group] of this.groups) {
      if (group.deathAt === null) {
        const enemy = enemies.get(id);
        if (!enemy) { this.groups.delete(id); continue; }
        group.anchorX = enemy.x;
        const lift=giantJumpHeight(enemy,state.time)*(reduceMotion?.38:1);
        group.anchorY = enemy.y-lift-enemyHeight(enemy.kind);
        group.bodyY = enemy.y-lift-28;
      } else if (this.clock-group.deathAt >= DAMAGE_LABEL_LAYOUT.deathTtl) {
        this.groups.delete(id);
      }
    }
    if (this.playerDamage && this.clock-this.playerDamage.bornAt >= DAMAGE_LABEL_LAYOUT.playerTtl) this.playerDamage = null;
    if (this.playerHeal && this.clock-this.playerHeal.bornAt >= DAMAGE_LABEL_LAYOUT.playerTtl) this.playerHeal = null;
    this.visible = [];
    const p = state.player;
    const top = 84, bottom = Math.min(WORLD.bounds.bottom, WORLD.height-110);
    const left = 16+WIDTH/2, right = WORLD.width-16-WIDTH/2;
    const occupied: Rect[] = [];
    const playerLabels: DamageLabelGroup[] = [];
    for (const [hit, heal] of [[this.playerDamage,false],[this.playerHeal,true]] as const) {
      if (!hit) continue;
      const age = this.clock-hit.bornAt;
      const x = clamp(p.x+(heal ? -95 : 95), left, right);
      const rect = {x: x-WIDTH/2, y: clamp(p.y-112+(heal ? HEIGHT+8 : 0), top, bottom-HEIGHT), w: WIDTH, h: HEIGHT};
      const other = occupied.find(r => crowds(r, rect));
      if (other) rect.y = other.y+2*HEIGHT+8 <= bottom ? other.y+HEIGHT+8 : other.y-HEIGHT-8;
      occupied.push(rect);
      playerLabels.push({victimId: 0, x, y: rect.y, height: HEIGHT, anchorX: p.x, anchorY: p.y-96, player: true,
        heal, amount: hit.amount, count: 1, recent: [], alpha: clamp((DAMAGE_LABEL_LAYOUT.playerTtl-age)/.25,0,1), age, compact: false, source: hit.source});
    }
    occupied.push({x: p.x-39, y: p.y-122, w: 78, h: 130});
    for (const e of state.enemies) if (e.phase === 'warn' || e.phase === 'dash') {
      const endX = e.x+e.dashX*150, endY = e.y+e.dashY*150;
      occupied.push({x: Math.min(e.x,endX)-18, y: Math.min(e.y,endY)-18, w: Math.abs(endX-e.x)+36, h: Math.abs(endY-e.y)+36});
    }
    const distance = (g: Group) => (g.anchorX-p.x)**2 + (g.anchorY+70-p.y)**2;
    const groups = [...this.groups.values()].sort((a,b) =>
      Number(b.id === state.weapon.targetId)-Number(a.id === state.weapon.targetId) ||
      Number(b.deathAt === null)-Number(a.deathAt === null) || b.lastHit-a.lastHit || distance(a)-distance(b) || a.id-b.id);
    // Leave room for the material flash at the contact, including on newly defeated bodies.
    for (const g of groups) if (this.clock-g.lastHit < .35) {
      occupied.push({x: g.anchorX-22, y: g.bodyY-18, w: 44, h: 36});
    }
    let budget: number = DAMAGE_LABEL_LAYOUT.budget;
    for (const group of groups) {
      if (!budget) break;
      const age = this.clock-group.lastHit;
      const recent = group.recent.filter(hit => this.clock-hit.bornAt <= DAMAGE_LABEL_LAYOUT.detailTtl);
      const compact = groups.length >= 4 && group.id !== state.weapon.targetId;
      const expanded = recent.length > 1 && budget >= 2 && !compact;
      for (const h of expanded ? [HEIGHT+DETAILS, HEIGHT] : [HEIGHT]) {
        const dx = WIDTH+8, dy = h+8;
        const offsets = [[group.offsetX,group.offsetY],[0,0],[0,-dy],[-dx,0],[dx,0],[-dx,-dy],[dx,-dy],[0,-2*dy],[-dx,-2*dy],[dx,-2*dy],[0,dy],[-dx,dy],[dx,dy]];
        let placed = false;
        for (const [ox,oy] of offsets) {
          const x = clamp(group.anchorX+ox,left,right);
          const rect = {x: x-WIDTH/2, y: clamp(group.anchorY-h+oy,top,bottom-h), w: WIDTH, h};
          if (occupied.some(r => crowds(rect,r))) continue;
          occupied.push(rect);
          group.offsetX = ox;
          group.offsetY = oy;
          const alpha = group.deathAt === null ? 1-.26*clamp((age-1)/2,0,1) :
            clamp((DAMAGE_LABEL_LAYOUT.deathTtl-(this.clock-group.deathAt))/.65,0,1);
          this.visible.push({victimId: group.id, x, y: rect.y, height: h, anchorX: group.anchorX, anchorY: group.anchorY,
            player: false, heal: false, amount: group.total, count: group.count, recent: h>HEIGHT ? recent : [],
            alpha, age, compact, source: group.recent.at(-1)?.source ?? null});
          budget -= h>HEIGHT ? 2 : 1;
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    this.visible.push(...playerLabels);
  }

  snapshot(): DamageLabelGroup[] {
    return this.visible.map(g => ({...g, recent: g.recent.map(hit => ({...hit}))}));
  }

  draw(ctx: CanvasRenderingContext2D, assets: Assets, _state: GameState, reduceMotion = false): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const g of this.visible) {
      ctx.save();
      ctx.globalAlpha = g.alpha;
      const y = g.y+HEIGHT/2, stacked = !g.player && g.count>1 && (!g.compact || g.count>5);
      if (!g.player && (Math.abs(g.x-g.anchorX)>30 || Math.abs(g.y+g.height-g.anchorY)>30)) {
        ctx.beginPath();
        ctx.moveTo(g.x, g.y+g.height);
        ctx.lineTo(g.anchorX, g.anchorY+3);
        ctx.strokeStyle = '#fff0c94a'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      const drawText = (value: string, x: number, cy: number, max: number, size: number, color: string) => {
        ctx.font = `900 ${size}px "Microsoft YaHei",sans-serif`;
        ctx.lineWidth = size>20 ? 4.5 : 3;
        ctx.strokeStyle = '#422538'; ctx.fillStyle = color;
        ctx.strokeText(value,x,cy,max); ctx.fillText(value,x,cy,max);
      };
      const pulse = reduceMotion ? 0 : Math.max(0,1-g.age/.22);
      const color = g.player ? (g.heal ? '#a3ffcb' : '#ffabbc') : (g.count>=6 ? '#ffcf69' : '#fff5d1');
      const center = g.x-(stacked ? 16 : 0);
      if (g.player && g.source && g.source in assets.sprites) {
        const sprite = assets.sprites[g.source], height = Math.min(17,17*sprite.height/sprite.width);
        drawSprite(ctx,assets,g.source,g.x-37,y+height/2,height);
      }
      drawText((g.heal ? '+' : g.player ? '−' : '')+format(g.amount),center,y,stacked ? 63 : 76,(g.compact ? 22 : 26)+5*pulse,color);
      if (stacked) drawText(`${g.count}段`,g.x+30,y+2,37,14,'#ffe49f');
      if (g.recent.length) {
        const line = g.recent.map(hit => '+'+format(hit.amount)).join(' ');
        drawText(line,g.x,g.y+HEIGHT+DETAILS/2-1,WIDTH-5,13,'#fff0ce');
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
