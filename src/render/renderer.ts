import {CONFIG, WORLD} from '../core/config';
import {DEFAULT_SETTINGS, SKILL_NAMES, WEAPON_NAMES} from '../shared/types';
import type {Enemy, GameEvent, GameState, Settings, WeaponKind} from '../shared/types';
import type {Assets, SpriteName} from './assets';
import {drawSprite} from './sprite';
import {CourierRig} from './character';
import {DamageLabels} from './damage-labels';
import {WEAPONS} from '../core/weapons';

type Effect = {kind: string; x: number; y: number; age: number; duration: number; label?: string; angle?:number; sprite?:string};
type Particle = {x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number; color: string};
const COLORS: Record<string, string> = {fan:'#b6f8ec',skate:'#ffd56c',soda:'#79f3ce',lure:'#ffd891',bubble:'#c2eeff',cones:'#ffb466',bell:'#fff2b0',route:'#82ecd2',hook:'#a1dfde',heat:'#ffb378',dispatch:'#b5c7ff',stamp:'#ffcc9e',supply:'#ffe8b4'};

/** Canvas implementation is isolated from the deterministic simulation. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private settings: Settings = {...DEFAULT_SETTINGS};
  private effects: Effect[] = [];
  private particles: Particle[] = [];
  private clock = 0;
  private shake = 0;
  private denseScene = false;
  private quietSeconds = 0;
  private rig:CourierRig;
  private labels=new DamageLabels();
  private frameDt=0;
  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备不支持 Canvas 2D');
    this.ctx = context;
    this.rig=new CourierRig(assets);
  }

  setSettings(settings: Settings): void { this.settings = {...settings}; }
  reset(): void { this.effects = []; this.particles = []; this.shake = 0; this.clock = 0; this.denseScene = false; this.quietSeconds = 0; this.rig.reset();this.labels.reset(); }

  events(events: GameEvent[]): void {
    for (const event of events) {
      this.labels.add(event);
      if (event.type === 'skill') {
        this.effects.push({kind: event.kind, x: event.x, y: event.y, age: 0, duration: event.kind === 'soda' ? 1.1 : .8, label: SKILL_NAMES[event.kind]});
        this.burst(event.x, event.y - 12, COLORS[event.kind], 16);
        if (event.kind === 'fan') this.shake = Math.max(this.shake, .12);
      } else if (event.type === 'kill') {
        this.burst(event.x, event.y - 25, '#ffe6a0', 13);
        this.effects.push({kind:'defeat',x:event.x,y:event.y,age:0,duration:.28,sprite:event.kind});
      } else if(event.type==='damage') {
        if((event.burstIndex??1)===1){
          this.burst(event.x,event.y-25,event.victimId===0?'#ff907e':'#fff1bd',event.victimId===0?10:9);
          if(event.victimId!==0){this.effects.push({kind:'hit',x:event.x,y:event.y-28,age:0,duration:.18});this.shake=Math.max(this.shake,.08);}
          if(event.source==='lunchbox')this.effects.push({kind:'impact',x:event.x,y:event.y,age:0,duration:.3});
        }
        if(event.victimId===0)this.shake=.14;
      } else if(event.type==='attack') {
        this.effects.push({kind:event.kind,x:event.x,y:event.y,angle:event.angle,age:0,duration:event.kind==='sword'?.3:.25});
      } else if(event.type==='dash') {
        this.effects.push({kind:'dashTrail',x:event.x,y:event.y,angle:event.angle,age:0,duration:.25});
        this.burst(event.x,event.y-6,'#bff4e3',10);
      } else if(event.type==='enemyShot') {
        this.effects.push({kind:'enemyMuzzle',x:event.x,y:event.y,angle:event.angle,age:0,duration:.2});
      } else if(event.type==='defend') {
        this.effects.push({kind:'defend',x:event.x,y:event.y,age:0,duration:.55,label:'挡住了'});
      } else if(event.type==='weapon') {
        this.burst(event.x,event.y-25,'#ffe1a3',12);
      } else if (event.type === 'fail') {
        this.effects.push({kind: 'fail', x: event.x, y: event.y, age: 0, duration: .65});
        this.burst(event.x, event.y - 20, '#ffb079', 22);
        this.shake = .3;
      }
    }
    this.effects = this.effects.slice(-48);
  }

  render(state: GameState | null, dt: number, mode: 'home' | 'play' | 'pause' | 'result'): void {
    dt = Math.min(.05, Math.max(0, dt));
    if(mode==='pause')dt=0;
    this.frameDt=dt;
    if(state)this.labels.update(dt,state);
    this.clock += dt; this.shake = Math.max(0, this.shake - dt);
    this.effects.forEach(effect => { effect.age += dt; });
    this.effects = this.effects.filter(effect => effect.age < effect.duration);
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt; }
    this.particles = this.particles.filter(p => p.age < p.duration);
    const rect = this.canvas.getBoundingClientRect();
    // Reduce fill cost in crowded scenes; hysteresis avoids repeated canvas resets.
    // This changes only pixel density, never sprite scale, warnings or collision rules.
    if ((state?.enemies.length ?? 0) >= 40 || this.effects.length >= 24) {
      this.denseScene = true; this.quietSeconds = 0;
    } else if ((state?.enemies.length ?? 0) < 24 && this.effects.length < 8) {
      this.quietSeconds += dt;
      if (this.quietSeconds >= 3) this.denseScene = false;
    } else this.quietSeconds = 0;
    const dpr = Math.min(this.settings.quality === 'simple' || this.denseScene ? 1 : 2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const c = this.ctx;
    c.setTransform(width / WORLD.width, 0, 0, height / WORLD.height, 0, 0);
    c.clearRect(0, 0, WORLD.width, WORLD.height);
    c.save();
    if (this.shake > 0 && this.settings.shake && !this.settings.reduceMotion && mode === 'play') {
      c.translate(Math.sin(this.clock * 104) * this.shake * 10, Math.cos(this.clock * 127) * this.shake * 8);
    }
    c.drawImage(this.assets.background, 0, 0, WORLD.width, WORLD.height);
    if (mode === 'home' || !state) this.home();
    else this.battle(state);
    c.restore();
  }

  private home(): void {
    const c = this.ctx, t = this.settings.reduceMotion ? 0 : this.clock;
    const glow = c.createRadialGradient(940, 390, 10, 940, 390, 320);
    glow.addColorStop(0, '#ffdc9e45'); glow.addColorStop(1, '#ffdc9e00');
    c.fillStyle = glow; c.fillRect(620, 100, 660, 550);
    this.shadow(945, 570, 105, .24);
    this.sprite('courierA', 950, 570 + Math.sin(t * 2) * 4, 300, 1, Math.sin(t * 1.5) * .025);
    this.shadow(770, 590, 37, .2); this.sprite('bun', 770, 583 + Math.sin(t * 3) * 5, 95, 1, -.1);
    this.shadow(1135, 585, 43, .2); this.sprite('box', 1135, 580 + Math.sin(t * 3 + 2) * 5, 110, -1, .08);
    this.sprite('fan', 785, 360 + Math.sin(t * 2 + 1) * 7, 70, 1, -.12);
    this.sprite('soda', 1135, 330 + Math.sin(t * 2) * 7, 78, 1, .18);
    this.sprite('skate', 1080, 640 + Math.sin(t * 2) * 4, 50, 1, -.1);
  }

  private battle(s: GameState): void {
    const c = this.ctx, t = this.settings.reduceMotion ? 0 : s.time;
    this.zones(s);
    for (const e of s.enemies) {
      const age = s.time - e.spawnAt;
      if (age < CONFIG.spawn.warning) {
        c.save(); c.strokeStyle = '#ffbd79'; c.fillStyle = '#38242d55'; c.lineWidth = 3;
        c.setLineDash([5, 5]); c.beginPath(); c.ellipse(e.x, e.y, 25, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
      }
      if (e.phase === 'warn' || e.phase === 'dash') this.dashWarning(e, s.time);
      if((e.shotWarnUntil??0)>s.time)this.shotWarning(e,s.time);
    }
    for (const pickup of s.pickups) {
      const float = Math.sin(t * 3 + pickup.id) * 3;
      this.shadow(pickup.x, pickup.y, 20, .2);
      c.save(); c.globalAlpha = .38; c.strokeStyle = COLORS[pickup.kind]; c.lineWidth = 2;
      c.beginPath(); c.ellipse(pickup.x, pickup.y, 23, 12, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      c.save(); c.shadowColor = COLORS[pickup.kind]; c.shadowBlur = this.settings.quality === 'simple' ? 0 : 10;
      if((pickup.disabledUntil??0)>s.time||(pickup.readyAt??0)>s.time)c.globalAlpha=.35;
      if(pickup.retiringUntil)c.globalAlpha=Math.max(0,(pickup.retiringUntil-s.time)/.4);
      this.sprite(pickup.kind, pickup.x, pickup.y - 4 + float, pickup.kind === 'skate' ? 33 : 43);
      c.restore();
      if (this.settings.quality === 'standard') {
        c.fillStyle = '#fff4b7'; c.globalAlpha = .55 + Math.sin(t * 4 + pickup.id) * .25;
        c.beginPath(); c.arc(pickup.x + 21, pickup.y - 33 + float, 2.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      }
    }
    for(const drop of s.weaponDrops){
      this.shadow(drop.x,drop.y,27,.25);
      c.save();c.strokeStyle=drop.returnDrop?'#a6d4c1':'#ffe39d';c.fillStyle='#ffd88718';c.lineWidth=3;c.beginPath();c.ellipse(drop.x,drop.y,31,13,0,0,Math.PI*2);c.fill();c.stroke();
      if(!drop.returnDrop){const beam=c.createLinearGradient(drop.x,drop.y-90,drop.x,drop.y);beam.addColorStop(0,'#ffe1a000');beam.addColorStop(1,'#ffe1a050');c.fillStyle=beam;c.fillRect(drop.x-19,drop.y-90,38,84);}
      this.sprite('weaponCrate',drop.x,drop.y+3,30);c.globalAlpha=drop.readyAt>s.time?.5:1;
      const src=this.assets.sprites[drop.kind],h=Math.min(39,55*src.height/src.width);this.sprite(drop.kind,drop.x,drop.y-14+Math.sin(t*3)*2,h);c.restore();
      this.caption(drop.readyAt>s.time?'退换锁定':`${drop.returnDrop?'退换':'武器'} · ${WEAPON_NAMES[drop.kind]}`,drop.x,drop.y+21,14,'#ffe3a6');
    }
    this.drawEffects(false);
    if (s.player.skateUntil > s.time) this.skateRing(s, false);
    const actors: {y: number; enemy?: Enemy}[] = s.enemies.map(enemy => ({y: enemy.y, enemy}));
    actors.push({y: s.player.y}); actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) {
      if (actor.enemy) this.enemy(actor.enemy, s.time,actor.enemy.id===s.weapon.targetId);
      else {
        const p = s.player;
        this.shadow(p.x, p.y, 24, .28);
        this.rig.draw(c,p,s.weapon,s.time,this.frameDt,this.settings,1.35,s.ended);
        // Small foot marker makes the contact point legible underneath tall artwork.
        c.strokeStyle = '#fff1bc'; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, p.radius + 2, 4, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    this.projectiles(s);
    this.enemyProjectiles(s);
    this.playerStatus(s);
    if (s.player.skateUntil > s.time) this.skateRing(s, true);
    this.drawEffects(true);
    for (const p of this.particles) {
      c.globalAlpha = 1 - p.age / p.duration; c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size * (1 - .4 * p.age / p.duration), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    this.labels.draw(c,this.assets,s,this.settings.reduceMotion);
  }

  private enemy(e: Enemy, time: number, target=false): void {
    const c = this.ctx, t = this.settings.reduceMotion ? 0 : time;
    const age = time - e.spawnAt, spawning = age < CONFIG.spawn.warning;
    const height = e.kind === 'bowl' ? 75 : e.kind === 'box' ? 65 : 55;
    const bounce = e.phase === 'warn' || e.phase === 'recover' ? 0 : Math.abs(Math.sin(t * (e.phase === 'dash' ? 24 : 9) + e.id)) * 3;
    c.save();
    if (spawning) c.globalAlpha = .2 + .6 * age / CONFIG.spawn.warning;
    this.shadow(e.x, e.y, e.kind === 'bowl' ? 26 : 18, .24);
    this.sprite(e.kind, e.x, e.y - bounce, height, e.facing, e.phase === 'warn' ? Math.sin(t * 35) * .04 : Math.sin(t * 7 + e.id) * .035);
    if(time-e.hurtAt<.13){c.strokeStyle='#fff2bb';c.lineWidth=2;c.beginPath();c.ellipse(e.x,e.y-height*.45,height*.42,height*.48,0,0,Math.PI*2);c.stroke();}
    if(e.hp<e.maxHp&&(target||time-e.hurtAt<2)){const w=e.kind==='bowl'?54:42,y=e.y-height-10;c.fillStyle='#35292c';c.fillRect(e.x-w/2-1,y-1,w+2,7);c.fillStyle='#e16a58';c.fillRect(e.x-w/2,y,w*e.hp/e.maxHp,5);}
    if(e.stunUntil>time){for(let i=0;i<3;i++){const a=t*4+i*2.1;this.caption('✦',e.x+Math.cos(a)*18,e.y-height-16+Math.sin(a)*3,14,'#fff2a1');}}
    if (e.slowUntil > time) {
      c.strokeStyle = '#9af8e3'; c.fillStyle = '#8af2d825'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(e.x, e.y - height * .45, height * .43, height * .54, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.arc(e.x + Math.sin(i * 2.5 + t) * height * .4, e.y - (i * 17 + t * 14) % height, 3 + i, 0, Math.PI * 2); c.stroke();
      }
    }
    if (e.phase === 'warn') {
      c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#573523'; c.strokeText('!', e.x, e.y - height - 8); c.fillStyle = '#fff3b6'; c.fillText('!', e.x, e.y - height - 8);
    }
    c.restore();
  }

  private dashWarning(e: Enemy, time: number): void {
    const c = this.ctx;
    // The simulation locks the unit direction on entering warn; never point at a moving player.
    const distance = CONFIG.dash.speed * CONFIG.dash.duration;
    const targetX = e.x + e.dashX * distance, targetY = e.y + e.dashY * distance;
    c.save(); c.beginPath(); c.rect(WORLD.bounds.left, WORLD.bounds.top, WORLD.bounds.right - WORLD.bounds.left, WORLD.bounds.bottom - WORLD.bounds.top); c.clip();
    c.lineCap = 'round'; c.strokeStyle = '#f66a4738'; c.lineWidth = e.radius * 2;
    c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(targetX, targetY); c.stroke();
    c.strokeStyle = e.phase === 'dash' ? '#ffe2a6' : '#ffbb76'; c.lineWidth = 2;
    c.setLineDash([9, 9]); c.lineDashOffset = this.settings.reduceMotion ? 0 : -time * 24;
    c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(targetX, targetY); c.stroke(); c.setLineDash([]);
    const angle = Math.atan2(e.dashY, e.dashX);
    c.translate(targetX, targetY); c.rotate(angle); c.beginPath(); c.moveTo(-12, -7); c.lineTo(0, 0); c.lineTo(-12, 7); c.stroke(); c.restore();
  }

  private shotWarning(e:Enemy,time:number):void {
    const c=this.ctx,a=e.shotAngle??0,progress=1-((e.shotWarnUntil??time)-time)/CONFIG.ranged.warning;
    c.save();c.beginPath();c.rect(WORLD.bounds.left,WORLD.bounds.top,WORLD.bounds.right-WORLD.bounds.left,WORLD.bounds.bottom-WORLD.bounds.top);c.clip();
    c.translate(e.x,e.y);c.rotate(a);c.strokeStyle='#ed805ba0';c.lineWidth=2;c.setLineDash([7,8]);c.beginPath();c.moveTo(0,0);c.lineTo(CONFIG.ranged.range,0);c.stroke();c.setLineDash([]);
    c.fillStyle='#ffb789';c.beginPath();c.moveTo(55,-6);c.lineTo(66,0);c.lineTo(55,6);c.fill();c.restore();
    c.save();c.strokeStyle='#ffe1a5';c.lineWidth=3;c.beginPath();c.arc(e.x,e.y-42,19,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0,progress));c.stroke();c.restore();
  }

  private enemyProjectiles(s:GameState):void {
    const c=this.ctx;
    for(const q of s.enemyShots??[]){
      const angle=Math.atan2(q.vy,q.vx);this.shadow(q.x,q.y,9,.14);
      c.save();c.translate(q.x,q.y);c.rotate(angle);c.strokeStyle='#fff0c180';c.lineWidth=4;c.beginPath();c.moveTo(-22,0);c.lineTo(-7,0);c.stroke();
      c.fillStyle='#ed8857';c.strokeStyle='#643b2d';c.lineWidth=2;c.beginPath();c.moveTo(-13,0);c.bezierCurveTo(-4,-12,10,-10,10,0);c.bezierCurveTo(10,10,-4,12,-13,0);c.fill();c.stroke();c.fillStyle='#fff1ba';c.beginPath();c.ellipse(2,-3,4,2,0,0,Math.PI*2);c.fill();c.restore();
    }
  }

  private skateRing(s: GameState, front: boolean): void {
    const c = this.ctx, p = s.player, inner = CONFIG.skills.skate.inner, outer = CONFIG.skills.skate.outer;
    const fade = Math.min(1, (p.skateUntil - s.time) * 2);
    c.save(); c.globalAlpha = fade;
    if (!front) {
      c.strokeStyle = '#ffd87738'; c.lineWidth = outer - inner;
      c.beginPath(); c.arc(p.x, p.y, (inner + outer) / 2, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffe399a0'; c.lineWidth = 2; c.setLineDash([15, 8]);
      c.beginPath(); c.arc(p.x, p.y, outer, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    for (let i = 0; i < 3; i++) {
      const angle = (this.settings.reduceMotion ? 0 : s.time * 4) + i * Math.PI * 2 / 3;
      const x = p.x + Math.cos(angle) * (inner + outer) / 2, y = p.y + Math.sin(angle) * (inner + outer) / 2;
      if ((y >= p.y) !== front) continue;
      this.shadow(x, y, 15, .18); this.sprite('skate', x, y - 4, 24, 1, angle + .4);
    }
    c.restore();
  }

  private drawEffects(front: boolean): void {
    const c = this.ctx;
    for (const e of this.effects) {
      const progress = e.age / e.duration, alpha = 1 - progress;
      c.save(); c.globalAlpha = alpha;
      if(!front&&['knife','sword','tongs','umbrella'].includes(e.kind)){
        const cfg=WEAPONS[e.kind as WeaponKind],a=e.angle??0;
        c.translate(e.x,e.y);c.rotate(a);c.strokeStyle=e.kind==='sword'?'#b9f4ed':'#ffe7af';c.lineCap='round';
        if(e.kind==='knife'||e.kind==='umbrella'){
          const half=cfg.width*Math.PI/360,r=cfg.range;
          c.fillStyle=e.kind==='knife'?'#fff0bf25':'#b4ebdf25';c.beginPath();c.moveTo(0,0);c.arc(0,0,r,-half,half);c.closePath();c.fill();
          c.lineWidth=11*(1-progress)+2;c.beginPath();c.arc(0,0,r-7,-half,half);c.stroke();
          c.strokeStyle='#fffaf0';c.lineWidth=3;c.beginPath();c.arc(0,0,r-2,-half+progress*half,half);c.stroke();
          c.strokeStyle='#ffcd7388';c.lineWidth=4;c.beginPath();c.arc(0,0,r*.72,-half,half*.65);c.stroke();
        }else{
          c.fillStyle=e.kind==='sword'?'#a7f5e04d':'#ffdfa64a';c.beginPath();c.moveTo(16,-cfg.width*.3);c.lineTo(cfg.range,-cfg.width*.5);c.lineTo(cfg.range+8,0);c.lineTo(cfg.range,cfg.width*.5);c.lineTo(16,cfg.width*.3);c.closePath();c.fill();
          c.lineWidth=e.kind==='tongs'?8:16;c.beginPath();c.moveTo(18,0);c.lineTo(cfg.range,0);c.stroke();c.lineWidth=3;c.strokeStyle='#fff8df';c.stroke();
        }
      }
      if(!front&&e.kind==='impact'){c.strokeStyle='#ffc87d';c.fillStyle='#ffdb8c28';c.lineWidth=6;c.beginPath();c.arc(e.x,e.y,WEAPONS.lunchbox.width*Math.min(1,progress*2),0,Math.PI*2);c.fill();c.stroke();this.sprite('meal',e.x,e.y-12-progress*15,24);}
      if(front&&e.kind==='hit'){c.translate(e.x,e.y);c.strokeStyle='#fff7d8';c.lineWidth=3;for(let i=0;i<6;i++){const a=i*Math.PI/3+.2,r=8+progress*20;c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a)*(r+10),Math.sin(a)*(r+10));c.stroke();}}
      if(front&&e.kind==='defeat'&&e.sprite){const motion=this.settings.reduceMotion?0:progress;this.sprite(e.sprite,e.x,e.y-motion*28,(e.sprite==='bowl'?75:e.sprite==='box'?65:55)*(1+motion*.2),1,motion*.3);}
      if(!front&&e.kind==='dashTrail'&&!this.settings.reduceMotion){c.translate(e.x,e.y);c.rotate(e.angle??0);c.strokeStyle='#c4ffee';c.lineWidth=3;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-20-progress*30,i*14);c.lineTo(65+progress*40,i*14);c.stroke();}}
      if(front&&e.kind==='enemyMuzzle'){c.strokeStyle='#ffb271';c.lineWidth=3;c.beginPath();c.arc(e.x,e.y-10,8+progress*12,0,Math.PI*2);c.stroke();}
      if(!front&&e.kind==='bell'&&e.age>=.08){c.strokeStyle=COLORS.bell;c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.arc(e.x,e.y,Math.max(1,Math.min(150,(e.age-.08-i*.08)*350)),0,Math.PI*2);c.stroke();}}
      if(front&&['bubble','heat','dispatch','stamp','supply','lure','cones','route'].includes(e.kind)){this.sprite(e.kind,e.x,e.y-90-progress*18,30);}
      if (!front && (e.kind === 'fan' || e.kind === 'soda')) {
        const radius = e.kind === 'fan' ? CONFIG.skills.fan.radius : CONFIG.skills.soda.radius;
        c.strokeStyle = COLORS[e.kind]; c.fillStyle = e.kind === 'fan' ? '#cffdf018' : '#6befc924';
        c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, radius, 0, Math.PI * 2); c.fill(); c.stroke();
        const movingRadius = this.settings.reduceMotion ? radius : radius * (.25 + .75 * Math.min(1, progress * 2));
        c.lineWidth = 4 * alpha + 1; c.beginPath(); c.arc(e.x, e.y, movingRadius, 0, Math.PI * 2); c.stroke();
        if (e.kind === 'fan') {
          for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI / 2 + (this.settings.reduceMotion ? 0 : progress * 8);
            c.lineWidth = 5 - i * .7; c.beginPath(); c.arc(e.x, e.y - i * 8, radius * (1 - i * .17), angle, angle + 1.8); c.stroke();
          }
        } else if (this.settings.quality === 'standard') {
          for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / 6, r = radius * (.4 + (i % 3) * .2);
            c.beginPath(); c.arc(e.x + Math.cos(angle) * r, e.y + Math.sin(angle) * r - progress * 25, 4 + i % 5, 0, Math.PI * 2); c.stroke();
          }
        }
      }
      if (front && e.label) {
        c.textAlign = 'center'; c.font = `900 ${e.kind === 'kill' ? 20 : 22}px "Microsoft YaHei", sans-serif`;
        c.lineWidth = 4; c.strokeStyle = '#493323'; c.fillStyle = e.kind === 'kill' ? '#ffe593' : '#fff3ce';
        const y = e.y - (e.kind === 'kill' ? 0 : 80) - (this.settings.reduceMotion ? 0 : progress * 32);
        c.strokeText(e.label, e.x, y); c.fillText(e.label, e.x, y);
      }
      if (!front && e.kind === 'fail') {
        c.strokeStyle = '#ffaf78'; c.lineWidth = 5; c.beginPath(); c.arc(e.x, e.y, 30 + progress * 65, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    }
  }

  private shadow(x: number, y: number, radius: number, opacity: number): void {
    const c = this.ctx; c.save(); c.fillStyle = `rgba(35,24,29,${opacity})`;
    c.beginPath(); c.ellipse(x, y + 2, radius, radius * .32, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }

  private caption(text:string,x:number,y:number,size=16,color='#fff0ca'):void {
    const c=this.ctx;c.save();c.font=`800 ${size}px "Microsoft YaHei",sans-serif`;c.textAlign='center';c.lineWidth=3;c.strokeStyle='#46352b';c.fillStyle=color;c.strokeText(text,x,y);c.fillText(text,x,y);c.restore();
  }

  private zones(s:GameState):void {
    const c=this.ctx;
    for(const z of s.zones){
      if(z.kind==='supply'&&!s.pickups.some(p=>p.groupId===z.groupId&&!p.retiringUntil))continue;
      c.save();c.globalAlpha=Math.min(1,(z.expiresAt-s.time)*2);
      if(z.kind==='route'){
        c.translate(z.x,z.y);c.rotate(z.angle);c.fillStyle='#69e0b42c';c.strokeStyle='#99efcf';c.lineWidth=2;c.fillRect(0,-z.width/2,z.length,z.width);c.setLineDash([8,8]);c.strokeRect(0,-z.width/2,z.length,z.width);c.setLineDash([]);
        c.lineWidth=3;for(let x=22;x<z.length;x+=38){c.beginPath();c.moveTo(x-6,-7);c.lineTo(x+2,0);c.lineTo(x-6,7);c.stroke();}
      }else{
        this.shadow(z.x,z.y,z.kind==='cone'?14:22,.22);
        this.sprite(z.kind==='cone'?'cone':z.kind==='lure'?'lureBox':'supplyBox',z.x,z.y,z.kind==='cone'?38:39);
        if(z.kind==='lure'){this.sprite('lure',z.x,z.y-6,35);c.strokeStyle='#ffe0a82b';c.setLineDash([4,12]);c.lineWidth=1;c.beginPath();c.arc(z.x,z.y,180,0,Math.PI*2);c.stroke();c.setLineDash([]);for(let i=0;i<2;i++){const r=18+((s.time*20+i*20)%40);c.strokeStyle='#ffe0a877';c.beginPath();c.ellipse(z.x,z.y,r,r*.45,0,0,Math.PI*2);c.stroke();}}
      }
      c.restore();
    }
  }

  private projectiles(s:GameState):void {
    const c=this.ctx;
    for(const q of s.projectiles){
      const a=Math.atan2(q.vy,q.vx);
      c.save();
      if(q.kind==='bag'){
        c.strokeStyle='#fff0c4';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.arc(q.x-i*6*Math.cos(a),q.y-18-i*6*Math.sin(a),6+i*2,a-1.2,a+1.2);c.stroke();}
      }else if(q.kind==='chopsticks'){
        c.strokeStyle='#ffdc8580';c.lineWidth=3;c.beginPath();c.moveTo(q.x-Math.cos(a)*35,q.y-20-Math.sin(a)*35);c.lineTo(q.x,q.y-20);c.stroke();drawSprite(c,this.assets,'chopstick',q.x,q.y-20,8,a,1,.5,34);
      }else if(q.kind==='tray'){
        c.strokeStyle=q.phase==='return'?'#b5f1df80':'#ffdd9280';c.lineWidth=4;c.beginPath();c.arc(q.x,q.y-18,20,s.time*15,s.time*15+4);c.stroke();drawSprite(c,this.assets,'tray',q.x,q.y-18,26,s.time*17,1,.5,35);
      }else if(q.kind==='spirit'){
        c.strokeStyle='#baf4d47a';c.lineWidth=7;c.beginPath();c.moveTo(q.x-Math.cos(a)*24,q.y-24-Math.sin(a)*24);c.lineTo(q.x,q.y-24);c.stroke();this.sprite('spiritOrb',q.x,q.y-12+Math.sin(s.time*16)*2,39,q.vx<0?-1:1);
      }else if(q.kind==='lunchbox'){
        const phase=Math.min(1,(s.time-q.bornAt)/.65),height=Math.sin(phase*Math.PI)*75;
        this.shadow(q.x,q.y,13,.18);c.strokeStyle='#ffdf9b99';c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.arc(q.targetX,q.targetY,WEAPONS.lunchbox.width,0,Math.PI*2);c.stroke();c.setLineDash([]);this.sprite('meal',q.x,q.y-15-height,30,1,phase*1.5);
      }else if(q.kind==='talisman'){
        if(q.phase==='out'){c.strokeStyle='#ffdfa2aa';c.lineWidth=3;c.beginPath();c.moveTo(q.x-Math.cos(a)*22,q.y-18-Math.sin(a)*22);c.lineTo(q.x,q.y-18);c.stroke();this.sprite('talismanPaper',q.x,q.y-10,30,1,a+Math.PI/2);c.restore();continue;}
        const previous=q.hitIds.length>1?s.enemies.find(e=>e.id===q.hitIds[q.hitIds.length-2]):s.player;
        c.strokeStyle='#ffdfa2';c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.moveTo(previous?.x??q.originX,(previous?.y??q.originY)-28);c.lineTo(q.x,q.y-28);c.stroke();c.setLineDash([]);this.sprite('talismanPaper',q.x,q.y-25,28,1,Math.sin(s.time*20)*.2);
      }
      c.restore();
    }
  }

  private playerStatus(s:GameState):void {
    const c=this.ctx,p=s.player;
    for(const item of s.pickups)if((item.pulledUntil??0)>s.time){c.save();c.strokeStyle=COLORS.hook;c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.moveTo(p.x,p.y-24);c.lineTo(item.x,item.y-12);c.stroke();c.restore();this.sprite('hook',item.x,item.y-8,22);}
    if(p.bubbleUntil>s.time){c.save();c.strokeStyle='#c0f0ff';c.fillStyle='#abe8fa18';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y-53,48,64,0,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.arc(p.x-22,p.y-85,12,3.8,5.1);c.stroke();c.restore();}
    if((p.dashUntil??0)>s.time){const d=p.dashDirection??p.moveDirection;c.save();c.strokeStyle='#a3fbe3';c.lineWidth=3;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(p.x-d.x*28-d.y*i*12,p.y-d.y*28+d.x*i*12-20);c.lineTo(p.x-d.x*75-d.y*i*12,p.y-d.y*75+d.x*i*12-20);c.stroke();}c.restore();}
    if((p.sprintMultiplier??1)>1.03&&!this.settings.reduceMotion){c.strokeStyle='#ffe8bc66';c.lineWidth=2;const d=p.moveDirection;c.beginPath();c.moveTo(p.x-d.x*13,p.y-d.y*13);c.lineTo(p.x-d.x*30,p.y-d.y*30);c.stroke();}
    if(p.invulnerableUntil>s.time){c.strokeStyle='#fff6cb';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y+2,24,7,0,0,Math.PI*2);c.stroke();}
    if(p.heatUntil>s.time){for(let i=0;i<3;i++){const y=(s.time*32+i*17)%47;c.strokeStyle='#ffc18588';c.lineWidth=2;c.beginPath();c.moveTo(p.x-14+i*14,p.y-20-y);c.quadraticCurveTo(p.x-22+i*14,p.y-27-y,p.x-14+i*14,p.y-34-y);c.stroke();}}
    if(s.effects.dispatchUntil>s.time){c.save();c.strokeStyle='#b5c7ff88';c.lineWidth=3;c.setLineDash([12,9]);c.strokeRect(WORLD.bounds.left,WORLD.bounds.top,WORLD.bounds.right-WORLD.bounds.left,WORLD.bounds.bottom-WORLD.bounds.top);c.restore();}
    if(p.stampUntil>s.time)this.sprite('stamp',p.x-29,p.y-47,20,1,-.2);
  }

  private sprite(name: SpriteName, x: number, y: number, height: number, facing = 1, angle = 0): void {
    drawSprite(this.ctx,this.assets,name,x,y,height,angle,facing);
  }

  private burst(x: number, y: number, color: string, count: number): void {
    if (this.settings.reduceMotion) return;
    if (this.settings.quality === 'simple') count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count, speed = 30 + Math.random() * 80;
      this.particles.push({x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, age: 0, duration: .35 + Math.random() * .35, size: 1.5 + Math.random() * 2.5, color});
    }
    this.particles = this.particles.slice(-160);
  }
}
