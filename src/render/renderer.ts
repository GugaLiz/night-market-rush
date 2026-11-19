import {CONFIG, WORLD} from '../core/config';
import {DEFAULT_SETTINGS, WEAPON_NAMES} from '../shared/types';
import type {Enemy, GameEvent, GameState, Settings, Vec, WeaponKind} from '../shared/types';
import type {Assets, SpriteName} from './assets';
import {drawSprite} from './sprite';
import {CourierRig} from './character';
import {drawPackingWrap,drawPaperRoute} from './courier-equipment';
import {DamageLabels} from './damage-labels';
import {drawDeliveryPickup, drawDeliveryUse, drawUseRipple, useLifetime} from './delivery-skills';
import {WEAPONS} from '../core/weapons';
import {drawChainLink, drawFlightWake, drawWeaponContact, type WeaponContact} from './weapon-effects';
import {drawMeleeWaves} from './melee-waves';
import {drawGroundCoins, drawMarketBackground, drawSkillFields} from './market-floor';

type Effect = {kind: string; x: number; y: number; age: number; duration: number; label?: string; angle?:number; sprite?:string; power?:number; from?:Vec};
type Particle = {x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number; color: string};
const COLORS: Record<string, string> = {fan:'#b6f8ec',skate:'#ffd56c',soda:'#79f3ce',lure:'#ffd891',bubble:'#c2eeff',cones:'#ffb466',bell:'#fff2b0',route:'#82ecd2',hook:'#a1dfde',heat:'#ffb378',dispatch:'#b5c7ff',stamp:'#ffcc9e',supply:'#ffe8b4'};
const TAU=Math.PI*2;
const ghostRadius=150;
type DashGhost = {image: HTMLCanvasElement; x: number; y: number; time: number};
type CrowdImpact = {x:number; y:number; age:number; power:number; direction:number};

/** Canvas implementation is isolated from the deterministic simulation. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private settings: Settings = {...DEFAULT_SETTINGS};
  private effects: Effect[] = [];
  private skillUses: Extract<GameEvent,{type:'skill'}>[]=[];
  private particles: Particle[] = [];
  private clock = 0;
  private shake = 0;
  private denseScene = false;
  private quietSeconds = 0;
  private rig:CourierRig;
  private labels=new DamageLabels();
  private contacts:WeaponContact[]=[];
  private frameDt=0;
  private impact:CrowdImpact|null=null;
  private lastImpactAt=-Infinity;
  private recentDefeats:{x:number;y:number;time:number}[]=[];
  private ghosts:DashGhost[]=[];
  private lastStride:{x:number;y:number;vx:number;vy:number;time:number}|null=null;
  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备不支持 Canvas 2D');
    this.ctx = context;
    this.rig=new CourierRig(assets);
  }

  setSettings(settings: Settings): void { this.settings = {...settings}; }
  reset(): void { this.effects = []; this.skillUses=[]; this.particles = []; this.shake = 0; this.clock = 0; this.denseScene = false; this.quietSeconds = 0; this.rig.reset();this.labels.reset();this.contacts=[]; this.impact=null;this.lastImpactAt=-Infinity;this.recentDefeats=[];this.ghosts=[];this.lastStride=null; }

  events(events: GameEvent[]): void {
    // Count distinct defeats, not the five damage labels emitted by one weapon contact.
    const fallen=events.filter(e=>e.type==='kill');
    let time=0;
    if(fallen.length){
      for(const e of events)if(e.type==='damage')time=e.time;
      this.recentDefeats=this.recentDefeats.filter(e=>e.time>=time-.15&&e.time<=time);
      for(const e of fallen)this.recentDefeats.push({x:e.x,y:e.y,time});
    }
    const center=fallen[0];
    const group=center ? this.recentDefeats.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<300) : [];
    const crowd=group.length>=3;
    let originX=0,originY=0;
    if(crowd){
      for(const e of group){originX+=e.x;originY+=e.y;}
      originX/=group.length;originY/=group.length;
      if(time-this.lastImpactAt>.28){
        const power=Math.min(1,.48+group.length*.045);
        const dir=this.lastStride ? Math.atan2(originY-this.lastStride.y,originX-this.lastStride.x) : -.65;
        this.impact={x:originX,y:originY,age:0,power,direction:dir};
        this.lastImpactAt=time;
      }
    }
    for (const event of events) {
      this.labels.add(event);
      if (event.type === 'skill') {
        this.skillUses.push(event);
        if(this.skillUses.length>16)this.skillUses.shift();
      } else if (event.type === 'coin') {
        this.burst(event.x, event.y - 8, '#ffe49a', 5);
      } else if (event.type === 'kill') {
        const seed=event.victimId??Math.round(event.x);
        const launched=crowd&&Math.hypot(originX-event.x,originY-event.y)<260;
        const strike=this.contacts.find(hit=>hit.seed===event.victimId&&hit.age===0);
        const angle=strike?.angle??(launched?Math.atan2(event.y-originY,event.x-originX)+Math.sin(seed)*.24:seed*2.40);
        this.burst(event.x,event.y-16,launched?'#ffdb86':'#ffe6a0',launched?5:4);
        this.effects.push({kind:'defeat',x:event.x,y:event.y,age:0,duration:launched?.41:.25,sprite:event.kind,angle,power:launched?42+seed%29:strike?22:12});
      } else if(event.type==='damage') {
        if((event.burstIndex??1)!==1)continue;
        if(event.victimId===0){
          this.burst(event.x,event.y-25,'#ff907e',10);this.shake=.14;
        }else if(Object.hasOwn(WEAPONS,event.source)){
          const y=event.y-28;
          const featured=!this.contacts.some(hit=>hit.featured&&hit.age<.12&&Math.hypot(hit.x-event.x,hit.y-y)<120);
          this.contacts.push({kind:event.source as WeaponKind,x:event.x,y,angle:event.impactAngle??0,seed:event.victimId,
            age:0,duration:event.source==='sword'||event.source==='lunchbox'?.34:.27,featured});
          this.shake=Math.max(this.shake,.08);
        }else{
          this.burst(event.x,event.y-25,'#fff1bd',4);
          this.effects.push({kind:'hit',x:event.x,y:event.y-28,age:0,duration:.18});
        }
      }else if(event.type==='detonation'){
        this.effects.push({kind:'impact',x:event.x,y:event.y,age:0,duration:.43});
      }else if(event.type==='chainLink'){
        this.effects.push({kind:'chainLink',from:{x:event.fromX,y:event.fromY},x:event.x,y:event.y,age:0,duration:.19});
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
    this.contacts=this.contacts.slice(-28);
  }

  render(state: GameState | null, dt: number, mode: 'home' | 'play' | 'pause' | 'result'): void {
    dt = Math.min(.05, Math.max(0, dt));
    if(mode==='pause')dt=0;
    this.frameDt=dt;
    if(state)this.labels.update(dt,state);
    this.clock += dt; this.shake = Math.max(0, this.shake - dt);
    if(this.impact){this.impact.age+=dt;if(this.impact.age>.38)this.impact=null;}
    this.effects.forEach(effect => { effect.age += dt; });
    this.effects = this.effects.filter(effect => effect.age < effect.duration);
    this.contacts=this.contacts.filter(hit=>(hit.age+=dt)<hit.duration);
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
    if (this.settings.shake && !this.settings.reduceMotion && mode === 'play') {
      let dx=Math.sin(this.clock*104)*this.shake*8,dy=Math.cos(this.clock*127)*this.shake*6;
      if(this.impact){
        const {age,power,direction}=this.impact;
        const kick=Math.cos(age*79)*Math.exp(-age*17)*power*8;
        dx-=Math.cos(direction)*kick;dy-=Math.sin(direction)*kick;
      }
      if(Math.abs(dx)+Math.abs(dy)>.05){
        const overscan=1+Math.max(Math.abs(dx)/WORLD.width,Math.abs(dy)/WORLD.height)*2;
        c.translate(WORLD.width/2+dx,WORLD.height/2+dy);
        c.scale(overscan,overscan);c.translate(-WORLD.width/2,-WORLD.height/2);
      }
    }
    drawMarketBackground(c, this.assets, state, this.settings.reduceMotion);
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
    this.trackFootwork(s);
    drawSkillFields(c, s.fields, s.time, this.settings.quality === 'simple', this.settings.reduceMotion, this.assets);
    this.skillUses=this.skillUses.filter(use=>s.time-use.time<useLifetime);
    for(const use of this.skillUses)if(use.kind==='soda'||use.kind==='bell'){
      drawUseRipple(c,use,s.time-use.time,CONFIG.skills[use.kind].radius,this.settings.reduceMotion);
    }
    this.zones(s);
    drawGroundCoins(c, s.coins, s.time, this.settings.reduceMotion);
    this.drawGroundImpact();
    for (const e of s.enemies) {
      const age = s.time - e.spawnAt;
      if (age < CONFIG.spawn.warning) {
        c.save(); c.strokeStyle = '#ffbd79'; c.fillStyle = '#38242d55'; c.lineWidth = 3;
        c.setLineDash([5, 5]); c.beginPath(); c.ellipse(e.x, e.y, 25, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
      }
      if (e.phase === 'warn' || e.phase === 'dash') this.dashWarning(e, s.time);
      if((e.shotWarnUntil??0)>s.time)this.shotWarning(e,s.time);
    }
    for(const drop of s.weaponDrops){
      this.shadow(drop.x,drop.y,27,.25);
      c.save();c.strokeStyle=drop.returnDrop?'#a6d4c1':'#ffe39d';c.fillStyle='#ffd88718';c.lineWidth=3;c.beginPath();c.ellipse(drop.x,drop.y,31,13,0,0,Math.PI*2);c.fill();c.stroke();
      if(!drop.returnDrop){const beam=c.createLinearGradient(drop.x,drop.y-90,drop.x,drop.y);beam.addColorStop(0,'#ffe1a000');beam.addColorStop(1,'#ffe1a050');c.fillStyle=beam;c.fillRect(drop.x-19,drop.y-90,38,84);}
      this.sprite('weaponCrate',drop.x,drop.y+3,30);c.globalAlpha=drop.readyAt>s.time?.5:1;
      const src=this.assets.sprites[drop.kind],h=Math.min(39,55*src.height/src.width);this.sprite(drop.kind,drop.x,drop.y-14+Math.sin(t*3)*2,h);c.restore();
      this.caption(drop.readyAt>s.time?'退换锁定':`${drop.returnDrop?'退换':'武器'} · ${WEAPON_NAMES[drop.kind]}`,drop.x,drop.y+21,14,'#ffe3a6');
    }
    drawMeleeWaves(c,s,this.settings);
    this.drawEffects(false);
    if (s.player.skateUntil > s.time) this.skateRing(s, false);
    const enemies=[...s.enemies].sort((a,b)=>a.y-b.y);
    for(const e of enemies)this.enemy(e,s.time,e.id===s.weapon.targetId);
    this.drawEffects(true);
    for(const hit of this.contacts)drawWeaponContact(c,hit,this.settings,this.assets.strikes);
    for (const p of this.particles) {
      c.globalAlpha = 1 - p.age / p.duration; c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size * (1 - .4 * p.age / p.duration), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    // Route choices and the courier stay legible even when a full row erupts at once.
    for(const pickup of s.pickups)drawDeliveryPickup(c,this.assets,pickup,s.player,s.time,this.settings.reduceMotion);
    this.drawCourier(s);
    if(this.rig.bagPoint && this.rig.supplyHand)for(const use of this.skillUses){
      drawDeliveryUse(c,this.assets,use,s.time,this.rig.bagPoint,this.rig.supplyHand,this.settings.reduceMotion);
    }
    this.projectiles(s);
    this.playerStatus(s);
    if (s.player.skateUntil > s.time) this.skateRing(s, true);
    this.labels.draw(c,this.assets,s,this.settings.reduceMotion);
    this.enemyProjectiles(s);
  }

  private drawGroundImpact():void {
    if(!this.impact)return;
    const c=this.ctx,{x,y,age,power}=this.impact,t=Math.min(1,age/.38);
    const radius=this.settings.reduceMotion?43:(22+97*power)*(1-(1-t)**3);
    c.save();c.translate(x,y);c.scale(1,.75);c.globalAlpha=(1-t)*.85;
    c.lineCap='round';c.strokeStyle='#fff0b1';c.lineWidth=2+(1-t)*4;
    for(let i=0;i<5;i++){
      const angle=i*TAU/5+.24;
      c.beginPath();c.arc(0,0,radius,angle,angle+.68);c.stroke();
    }
    c.restore();
  }

  private trackFootwork(s:GameState):void {
    if(this.frameDt<=0||s.ended||this.settings.reduceMotion)return;
    const p=s.player,previous=this.lastStride;
    if(previous&&s.time-previous.time<.046)return;
    const speed=Math.hypot(p.vx,p.vy);
    if(previous&&speed>90&&s.time-previous.time<.18){
      const prevSpeed=Math.hypot(previous.vx,previous.vy);
      const alignment=p.vx*previous.vx+p.vy*previous.vy;
      if(prevSpeed>90&&alignment<.38*prevSpeed*speed){
        this.effects.push({kind:'skid',x:p.x,y:p.y,angle:Math.atan2(previous.vy,previous.vx),age:0,duration:.19});
        this.burst(p.x,p.y,'#e7d5ae',4);
      }
    }
    if(speed>85)this.lastStride={x:p.x,y:p.y,vx:p.vx,vy:p.vy,time:s.time};
  }

  private drawCourier(s:GameState):void {
    const c=this.ctx,p=s.player;
    const use=this.skillUses.at(-1);
    const useAge=use?Math.max(0,s.time-use.time):Infinity;
    const trayInFlight=s.weapon.kind==='tray'&&s.projectiles.some(q=>q.kind==='tray');
    const movingGhosts=!this.settings.reduceMotion&&this.settings.quality==='standard';
    this.shadow(p.x,p.y,24,.28);
    // Keep the ground marker below the planted shoes so the soles read against the floor.
    c.save();c.globalAlpha*=.55;c.strokeStyle='#fff1bc';c.lineWidth=1.45;
    c.beginPath();c.ellipse(p.x,p.y,p.radius+2,4,0,0,TAU);c.stroke();c.restore();
    if(movingGhosts){
      for(const ghost of this.ghosts){
        const age=s.time-ghost.time;
        if(age<0||age>.17)continue;
        c.globalAlpha=.36*(1-age/.17);
        c.drawImage(ghost.image,ghost.x,ghost.y);
      }
      c.globalAlpha=1;
    }
    const last=this.ghosts.at(-1);
    const capture=movingGhosts&&(p.dashUntil??0)>s.time&&(!last||s.time-last.time>=.05);
    if(capture){
      // Capture the articulated pose once. Replaying this bitmap cannot advance the rig clock.
      const image=this.ghosts.length>=3?this.ghosts.shift()!.image:document.createElement('canvas');
      const size=ghostRadius*2;
      if(image.width!==size||image.height!==size){image.width=size;image.height=size;}
      const stamp=image.getContext('2d')!;
      stamp.clearRect(0,0,size,size);
      const x=p.x-ghostRadius,y=p.y-ghostRadius-28;
      stamp.save();stamp.translate(-x,-y);
      this.rig.draw(stamp,p,s.weapon,s.time,this.frameDt,this.settings,1.35,s.ended,trayInFlight,useAge);
      stamp.restore();c.drawImage(image,x,y);
      this.ghosts.push({image,x,y,time:s.time});
    }else this.rig.draw(c,p,s.weapon,s.time,this.frameDt,this.settings,1.35,s.ended,trayInFlight,useAge);
  }

  private enemy(e: Enemy, time: number, target=false): void {
    const c = this.ctx, t = this.settings.reduceMotion ? 0 : time;
    const age = time - e.spawnAt, spawning = age < CONFIG.spawn.warning;
    const height = e.kind === 'bowl' ? 75 : e.kind === 'box' ? 65 : 55;
    const bounce = e.phase === 'warn' || e.phase === 'recover' ? 0 : Math.abs(Math.sin(t * (e.phase === 'dash' ? 24 : 9) + e.id)) * 3;
    c.save();
    if (spawning) c.globalAlpha = .2 + .6 * age / CONFIG.spawn.warning;
    this.shadow(e.x, e.y, e.kind === 'bowl' ? 26 : 18, .24);
    const strike=time-e.hurtAt<.21?this.contacts.find(hit=>hit.seed===e.id&&hit.age<=.21):undefined;
    const recoil=strike&&!this.settings.reduceMotion?Math.sin(Math.PI*strike.age/.21)*(1-strike.age/.21):0;
    const dir=strike?.angle??0;
    c.save();c.translate(e.x+Math.cos(dir)*recoil*13,e.y+Math.sin(dir)*recoil*9-bounce);
    c.scale(1+.08*recoil,1-.08*recoil);
    this.sprite(e.kind,0,0,height,e.facing,(e.phase==='warn'?Math.sin(t*35)*.04:Math.sin(t*7+e.id)*.035)+Math.cos(dir)*recoil*.18);
    c.restore();
    if(!strike&&time-e.hurtAt<.13){c.strokeStyle='#fff2bb';c.lineWidth=2;c.beginPath();c.ellipse(e.x,e.y-height*.45,height*.42,height*.48,0,0,Math.PI*2);c.stroke();}
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
    const travel = CONFIG.ranged.speed * CONFIG.ranged.lifetime;
    c.translate(e.x,e.y);c.rotate(a);c.strokeStyle='#ed805ba0';c.lineWidth=2;c.setLineDash([7,8]);c.beginPath();c.moveTo(0,0);c.lineTo(travel,0);c.stroke();c.setLineDash([]);
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
    const c=this.ctx,p=s.player,{inner,outer,duration}=CONFIG.skills.skate;
    const age=Math.max(0,s.time-p.skateUntil+duration),reduced=this.settings.reduceMotion;
    const pushOff=reduced?1:1-(1-Math.min(1,age/.24))**2;
    const orbit=reduced?.22:3.7*(age-.16*(1-Math.exp(-age/.16)));
    c.save();c.globalAlpha=Math.min(1,(p.skateUntil-s.time)*2);c.translate(p.x,p.y);
    if (!front) {
      c.strokeStyle='#e5b25b1b';c.lineWidth=outer-inner;c.beginPath();c.arc(0,0,(inner+outer)/2,0,TAU);c.stroke();
      c.setLineDash([10,9]);c.lineWidth=1.5;c.strokeStyle='#ffe2a08c';
      for(const r of [inner,outer]){c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();}
      c.setLineDash([]);
    }
    for(let i=0;i<3;i++){
      const angle=orbit+i*TAU/3-.72,radius=16+(inner+(i+.5)*(outer-inner)/3-16)*pushOff;
      if(!front){
        c.lineCap='round';
        for(const track of [radius-4,radius+4]){
          c.strokeStyle='#563e3b96';c.lineWidth=2.5;c.beginPath();c.arc(0,0,track,angle-.70*pushOff,angle-.07*pushOff);c.stroke();
          c.strokeStyle='#ecc686b5';c.lineWidth=1.2;c.beginPath();c.arc(0,0,track-1,angle-.52*pushOff,angle-.14*pushOff);c.stroke();
        }
      }
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      if((y>=0)!==front)continue;
      const facing=Math.sin(angle)<0?1:-1;
      this.shadow(x,y,16,.20);
      this.sprite('skate',x,y-3-6*(1-pushOff),28,facing,facing*(.47+.38*Math.cos(angle)));
    }
    c.restore();
  }

  private drawEffects(front: boolean): void {
    const c = this.ctx;
    for (const e of this.effects) {
      const progress = e.age / e.duration, alpha = 1 - progress;
      c.save(); c.globalAlpha = alpha;
      if(!front&&e.kind==='impact'){
        const r=WEAPONS.lunchbox.width*(this.settings.reduceMotion?1:1-(1-progress)**4);
        c.fillStyle='#ffc56b21';c.beginPath();c.arc(e.x,e.y,r,0,TAU);c.fill();
        for(let i=0;i<7;i++){
          const a=i*TAU/7+.12;
          c.beginPath();c.arc(e.x,e.y,r,a,a+.66);c.strokeStyle='#b85c3b';c.lineWidth=7*alpha+1;c.stroke();
          c.strokeStyle='#ffe79e';c.lineWidth=3.5*alpha+1;c.stroke();
        }
        this.sprite('meal',e.x,e.y-6,29);
      }
      if(!front&&e.kind==='chainLink'&&e.from)drawChainLink(c,e.from,e,progress);
      if(front&&e.kind==='hit'){c.translate(e.x,e.y);c.strokeStyle='#fff7d8';c.lineWidth=3;for(let i=0;i<6;i++){const a=i*Math.PI/3+.2,r=8+progress*20;c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a)*(r+10),Math.sin(a)*(r+10));c.stroke();}}
      if(front&&e.kind==='defeat'&&e.sprite){
        const motion=this.settings.reduceMotion?0:progress;
        const distance=e.power??12, angle=e.angle??0, push=1-(1-motion)**2;
        const height=e.sprite==='bowl'?75:e.sprite==='box'?65:55;
        const hop=Math.sin(motion*Math.PI)*distance*.82;
        const x=e.x+Math.cos(angle)*distance*push, groundY=e.y+Math.sin(angle)*distance*push*.6;
        const spin=Math.cos(angle)*motion*(distance>35?1.25:.45);
        const size=height*(1+Math.sin(motion*Math.PI)*.08-motion*.34);
        if(distance>35&&motion>0&&this.settings.quality==='standard'){
          this.shadow(x,groundY,12*alpha,.21);
          c.globalAlpha=alpha*.25;
          this.sprite(e.sprite,x-(x-e.x)*.22,groundY-hop*.70,size*.94,1,spin*.8);
        }
        c.globalAlpha=alpha*.96;this.sprite(e.sprite,x,groundY-hop,size,1,spin);
      }
      if(!front&&e.kind==='skid'&&!this.settings.reduceMotion){
        c.translate(e.x,e.y);c.rotate(e.angle??0);c.lineCap='round';
        for(const side of [-1,1]){
          c.strokeStyle='#654731';c.lineWidth=4*alpha+1;
          c.beginPath();c.moveTo(-20-progress*11,side*7);c.quadraticCurveTo(-7,side*4,3,side*3);c.stroke();
          c.strokeStyle='#ffdfa8';c.lineWidth=2*alpha;c.stroke();
        }
      }
      if(!front&&e.kind==='dashTrail'&&!this.settings.reduceMotion){c.translate(e.x,e.y);c.rotate(e.angle??0);c.strokeStyle='#c4ffee';c.lineWidth=3;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-20-progress*30,i*14);c.lineTo(65+progress*40,i*14);c.stroke();}}
      if(front&&e.kind==='enemyMuzzle'){c.strokeStyle='#ffb271';c.lineWidth=3;c.beginPath();c.arc(e.x,e.y-10,8+progress*12,0,Math.PI*2);c.stroke();}
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
    const c=this.ctx,reduced=this.settings.reduceMotion;
    for(const z of s.zones){
      if(z.kind==='supply'&&!s.pickups.some(p=>p.groupId===z.groupId&&!p.retiringUntil))continue;
      const age=Math.max(0,s.time-z.bornAt);
      c.save();c.globalAlpha=Math.min(1,(z.expiresAt-s.time)*2);
      if(z.kind==='route'){
        drawPaperRoute(c,z,age,reduced);
      }else{
        const settle=reduced?1:Math.min(1,age/.30);
        const lift=18*(1-Math.min(1,settle/.62))**2+3*Math.sin(Math.PI*Math.max(0,(settle-.62)/.38));
        const x=z.kind==='supply'?Math.max(WORLD.bounds.left+20,z.x-31):z.x;
        const y=z.y-lift,tilt=(z.id%2===0?1:-1)*.14*(1-settle);
        this.shadow(x,z.y,(z.kind==='cone'?14:22)*(1-lift*.018),.25);
        const sprite=z.kind==='cone'?'cone':z.kind==='supply'?'supplyBox':settle>.70?'lure':'lureBox';
        this.sprite(sprite,x,y,z.kind==='cone'?38:42,1,tilt);
        if(z.kind==='lure'){
          c.strokeStyle='#f8d59465';c.setLineDash([3,14]);c.lineWidth=1.5;
          c.beginPath();c.arc(z.x,z.y,z.radius,0,TAU);c.stroke();c.setLineDash([]);
          for(let i=0;i<3;i++){
            const rise=reduced?i/3:((age*.57+i/3)%1);
            const x=z.x-9+i*9,base=y-24-rise*19;
            c.strokeStyle='rgba(255,229,183,'+((1-rise)*.62*settle)+')';c.lineWidth=1.8;
            c.beginPath();c.moveTo(x,base);c.bezierCurveTo(x-7,base-5,x+7,base-9,x+2,base-15);c.stroke();
          }
        }
      }
      c.restore();
    }
  }

  private projectiles(s:GameState):void {
    const c=this.ctx;
    for(const q of s.projectiles){
      const a=Math.atan2(q.vy,q.vx);
      c.save();
      const launched=this.rig.launch;
      const baseHeight=q.kind==='lunchbox'?28:q.kind==='tray'||q.kind==='bag'?18:24;
      const offsetX=launched?launched.point.x-q.originX:0, offsetY=launched?launched.point.y-q.originY+baseHeight:0;
      let fromHand=0;
      if(launched?.id===q.attackId){
        // Let the shot travel farther than its perspective offset before joining the world path.
        // An upward shot would otherwise appear to drift back towards the thrower's feet.
        if(q.phase==='out')fromHand=Math.max(0,1-q.travelled/Math.max(1,Math.hypot(offsetX,offsetY)*1.7));
        if(q.phase==='flight')fromHand=Math.max(0,1-(s.time-q.bornAt)/.65);
      }
      const x=q.x+offsetX*fromHand, y=q.y-baseHeight+offsetY*fromHand;
      const trailLimit=this.settings.reduceMotion?18:this.settings.quality==='simple'?43:65;
      if(q.phase==='out'||q.phase==='return')drawFlightWake(c,q.kind,x,y,a,Math.min(trailLimit,q.travelled),q.phase==='return');
      if(q.kind==='bag'){
        c.strokeStyle='#fff3c4';c.lineWidth=2;
        c.beginPath();c.arc(x,y,14,a-1.05,a+1.05);c.stroke();
      }else if(q.kind==='chopsticks'){
        drawSprite(c,this.assets,'chopstick',x,y,10,a,1,.5,41);
      }else if(q.kind==='tray'){
        drawSprite(c,this.assets,'tray',x,y,28,this.settings.reduceMotion?0:s.time*17,1,.5,38);
      }else if(q.kind==='spirit'){
        drawSprite(c,this.assets,'spiritOrb',x,y,39,0,q.vx<0?-1:1,.5);
      }else if(q.kind==='lunchbox'){
        const phase=Math.min(1,(s.time-q.bornAt)/.65),height=Math.sin(phase*Math.PI)*75;
        this.shadow(q.x,q.y,13,.18);c.strokeStyle='#ffdf9b99';c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.arc(q.targetX,q.targetY,WEAPONS.lunchbox.width,0,Math.PI*2);c.stroke();c.setLineDash([]);
        const flightY=y+phase*22-height;
        const flightAngle=Math.atan2(q.targetY-q.originY+22-75*Math.PI*Math.cos(phase*Math.PI),q.targetX-q.originX);
        drawFlightWake(c,q.kind,x,flightY,flightAngle,Math.min(trailLimit,phase*180),false);
        drawSprite(c,this.assets,'meal',x,flightY,32,phase*1.5,1,.5);
      }else if(q.kind==='talisman'){
        if(q.phase==='out'){
          drawSprite(c,this.assets,'talismanPaper',x,y,30,a+Math.PI/2,1,.5);
        }else{
          drawSprite(c,this.assets,'talismanPaper',x,y,28,Math.sin(s.time*20)*.2,1,.5);
        }
      }
      c.restore();
    }
  }

  private playerStatus(s:GameState):void {
    const c=this.ctx,p=s.player,reduced=this.settings.reduceMotion;
    const bagX=this.rig.bagPoint?.x??p.x-18*p.facing,bagY=this.rig.bagPoint?.y??p.y-38;
    for(const item of s.pickups)if((item.pulledUntil??0)>s.time){
      const slack=Math.min(17,Math.hypot(item.x-bagX,item.y-bagY)*.08);
      c.save();c.lineCap='round';c.strokeStyle='#694c36';c.lineWidth=3.5;c.beginPath();c.moveTo(bagX,bagY);
      c.quadraticCurveTo((bagX+item.x)/2,(bagY+item.y-10)/2+slack,item.x,item.y-10);c.stroke();
      c.strokeStyle='#ffd78a';c.lineWidth=1.6;c.stroke();c.restore();this.sprite('hook',item.x,item.y-9,21);
    }
    if(p.bubbleUntil>s.time){
      c.save();c.globalAlpha=Math.min(1,(p.bubbleUntil-s.time)*4);
      drawPackingWrap(c,p.x,p.y,Math.max(0,s.time-p.bubbleUntil+7),reduced);c.restore();
    }
    if((p.dashUntil??0)>s.time&&!this.settings.reduceMotion){const d=p.dashDirection??p.moveDirection;c.save();c.strokeStyle='#b5ffe5bb';c.lineWidth=3;c.lineCap='round';for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(p.x-d.x*28-d.y*i*12,p.y-d.y*28+d.x*i*12-20);c.lineTo(p.x-d.x*(82-Math.abs(i)*12)-d.y*i*12,p.y-d.y*(82-Math.abs(i)*12)+d.x*i*12-20);c.stroke();}c.restore();}
    if((p.sprintMultiplier??1)>1.03&&!this.settings.reduceMotion){c.strokeStyle='#ffe8bc66';c.lineWidth=2;const d=p.moveDirection;c.beginPath();c.moveTo(p.x-d.x*13,p.y-d.y*13);c.lineTo(p.x-d.x*30,p.y-d.y*30);c.stroke();}
    if(p.invulnerableUntil>s.time){c.strokeStyle='#fff6cb';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y+2,24,7,0,0,Math.PI*2);c.stroke();}
    if(p.heatUntil>s.time){
      c.save();c.lineCap='round';
      const packX=bagX-9*p.facing;
      this.sprite('heat',packX,bagY+3,22,1,-.12*p.facing);
      for(let i=0;i<3;i++){
        const rise=reduced?i/3:((s.time*.73+i/3)%1),x=packX+(i-1)*6,y=bagY-14-rise*15;
        c.strokeStyle='rgba(129,83,54,'+((1-rise)*.65)+')';c.lineWidth=3.0;
        c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x-6,y-4,x+5,y-9,x+1,y-14);c.stroke();
        c.strokeStyle='rgba(255,229,182,'+((1-rise)*.90)+')';c.lineWidth=1.7;c.stroke();
      }
      c.restore();
    }
    if(s.effects.dispatchUntil>s.time){
      const x=p.x+25*p.facing,y=p.y-38;
      const remaining=s.effects.dispatchUntil-s.time;
      c.save();c.globalAlpha=Math.min(1,remaining*4);
      this.sprite('dispatch',x,y,23,1,.14*p.facing);
      c.strokeStyle='#ffe4a7';c.lineWidth=2.2;c.lineCap='round';
      for(const r of [5,9]){c.beginPath();c.arc(x+6,y-23,r,-1.4,-.27);c.stroke();}
      c.restore();
    }
    if(p.stampUntil>s.time)this.sprite('stamp',bagX-8*p.facing,bagY+5,18,1,-.18*p.facing);
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
