import {DEFAULT_SETTINGS, ENEMY_NAMES, WEAPON_NAMES, WEAPON_KINDS, SKILL_NAMES, SKILL_KINDS, type WeaponKind, type SkillKind, type EnemyKind, type BestRecord, type GameState, type Settings} from '../shared/types';
import {WEAPON_GUIDE, SKILL_GUIDE} from './catalog';
import {WEAPONS} from '../core/weapons';

export type View = 'home'|'loading'|'tutorial'|'countdown'|'play'|'pause'|'settings'|'confirm'|'result'|'rotate'|'lab'|'catalog';
export interface UIActions {
  start:()=>void; resume:()=>void; pause:()=>void; settings:()=>void; dash:()=>void;
  applySettings:(settings:Settings)=>void; previewSettings:(settings:Settings)=>void;
  cancelSettings:()=>void; home:()=>void; abandon:()=>void; retry:()=>void;
  practice:()=>void; lab:()=>void; closeLab:()=>void; catalog:()=>void; closeCatalog:()=>void;
  selectWeapon:(kind:WeaponKind)=>void; triggerSkill:(kind:SkillKind)=>void; spawnEnemy:(kind:EnemyKind,group:boolean)=>void;
  heal:()=>void; clear:()=>void; resetLab:()=>void; setSpeed:(speed:number)=>void;
  tutorial:()=>void; requestTilt:()=>Promise<boolean>; calibrate:()=>boolean; fullscreen:()=>void;
}
export interface JoystickVisual {active:boolean;x:number;y:number;dx:number;dy:number}
interface ViewData {settings?:Settings;state?:GameState;best?:BestRecord|null;isRecord?:boolean;saved?:boolean;progress?:number;count?:number;message?:string;speed?:number}
const clone=(settings:Settings):Settings=>({...settings});
const escape=(value:string)=>value.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export const formatTime=(seconds:number)=>`${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
const score=(value:number)=>Math.floor(Math.max(0,value)).toString().padStart(6,'0');
const bag=`<svg class="bag-art" viewBox="0 0 120 110" aria-hidden="true"><path d="M36 35V24c0-21 48-21 48 0v11" fill="none" stroke="#583b29" stroke-width="9"/><path d="M25 32h70l14 61q-47 18-98 0z" fill="#397e77" stroke="#523929" stroke-width="4"/><path d="M23 31h76l-3 26H22z" fill="#65a69a" stroke="#523929" stroke-width="4"/><path d="M35 53v14m50-14v14" stroke="#f2cf8e" stroke-width="8"/><path d="M47 80h27m-34 9h35m-15-19 8 15" stroke="#fff1d6" stroke-width="5" stroke-linecap="round"/></svg>`;
const icon=(name:string)=>{
  const weaponIndex=WEAPON_KINDS.indexOf(name as WeaponKind),skillIndex=SKILL_KINDS.indexOf(name as SkillKind);
  const index=weaponIndex>=0?weaponIndex:skillIndex;
  if(index>=0)return `<span class="atlas-icon" aria-hidden="true" style="background-image:url('${import.meta.env.BASE_URL}assets/${weaponIndex>=0?'weapons-v2.png':'skills-v2.png'}');background-position:${(index%4)*100/3}% ${Math.floor(index/4)*100/3}%"></span>`;
  const content:Record<string,string>={pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7z"/>',fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',gear:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',fan:'<circle cx="12" cy="10" r="8"/><path d="M12 18v4m-5 0h10M12 10c-8-6 2-9 0 0m0 0c9-2 6 8 0 0m0 0c-2 9-10 1 0 0"/>',skate:'<path d="M3 9q9 5 18-2l-2 8H6z"/><circle cx="8" cy="19" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',soda:'<path d="M9 2h6v5l3 5v9H6v-9l3-5zM6 14h12"/><path d="M10 17h4"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>'};
  Object.assign(content,{
    tongs:'<path d="m5 3 5 13-4 5m13-18-5 13 4 5M7 8h10"/>',bag:'<path d="M6 7h12l2 14H4zM9 7V3h6v4m-6 6h6"/>',chopsticks:'<path d="m8 3 5 18M13 3l4 18M5 14l3 7"/>',spirit:'<path d="M7 8h10v13H7zM9 5V2m5 3V2m3 8h4v6h-4M5 10H2l5 5"/>',knife:'<path d="m3 20 5-5m0 0L18 3l3 4-8 13z"/>',tray:'<ellipse cx="12" cy="11" rx="9" ry="6"/><ellipse cx="12" cy="11" rx="5" ry="3"/><path d="M3 11v4q9 9 18 0v-4"/>',umbrella:'<path d="M2 12q10-19 20 0H2m10-9v15q0 6 5 2M7 12q0-7 5-9 5 2 5 9"/>',sword:'<path d="m4 21 5-5m-3-3 6 6m-3-3 12-10V2h-4L7 14m7-4 2 2"/>',lunchbox:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M2 10h20M9 7V3h6v4M9 15h6"/>',talisman:'<path d="M4 3h16v18H4zM8 6l8 4-8 4 8 4M8 3v18"/>',lure:'<path d="M3 9h18v12H3zM6 9V4h12v5m-9 5h6m-3-3v6"/>',bubble:'<path d="M5 4h14v16H5z"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="16" r="2"/>',cones:'<path d="M4 21h16L13 3h-2zM8 11h8M6 16h12"/>',bell:'<path d="M8 5h8l3 13H5zM10 5V2h4v3m-4 18h4"/>',route:'<path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3zM8 2v17m8-14v17M5 14l6-5 8 5"/>',hook:'<path d="m3 3 12 10m0 0 4 4q3 6-3 5l-4-4m-5-11 3-3"/>',heat:'<path d="M4 9h16v12H4zM8 6q-3-3 0-5m4 5q-3-3 0-5m4 5q-3-3 0-5M8 14h8"/>',dispatch:'<rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 5V1h6v4M8 10h8m-8 4h5m-5 4h8"/>',stamp:'<path d="M5 17h14v5H5zM7 17l3-6V3h4v8l3 6M8 3h8"/>',supply:'<path d="M2 5h20v14H2zM7 5v14m4-10h2v2h-2zm5 0h2v2h-2zm-5 5h2v2h-2zm5 0h2v2h-2z"/>',
  });
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${content[name]??content.arrow}</svg>`;
};

export class UI {
  private _shell:HTMLDivElement;
  private _canvas:HTMLCanvasElement;
  private overlay:HTMLDivElement;
  private hud:HTMLDivElement;
  private joystick:HTMLDivElement;
  private toastEl:HTMLDivElement;
  private view:View='loading';
  private data:ViewData={};
  private settings:Settings=clone(DEFAULT_SETTINGS);
  private draft:Settings=clone(DEFAULT_SETTINGS);
  private tab:'operation'|'sound'|'display'='operation';
  private defaultConfirm=false;
  private cancelConfirm=false;
  private tiltBusy=false;
  private tiltRequest=0;
  private toastTimer:number|undefined;
  private focusBeforeModal:HTMLElement|null=null;
  private scoreEl:HTMLElement;
  private timeEl:HTMLElement;
  private hpValue:HTMLElement;
  private hpFill:HTMLElement;
  private hpTail:HTMLElement;
  private hpBox:HTMLElement;
  private weaponEl:HTMLElement;
  private statusEl:HTMLElement;
  private labButton:HTMLElement;
  private dashButton:HTMLButtonElement;
  private dashStatus:HTMLElement;
  private sprintLabel:HTMLElement;
  private lastHp=-1;
  private lastStatus='';
  private lastWeapon='';
  private catalogTab:'weapons'|'skills'='weapons';
  private selectedWeapon:WeaponKind='tongs';
  private selectedSkill:SkillKind='fan';
  private selectedEnemy:EnemyKind='bun';
  private stageEl:HTMLElement;
  private lastStage=-1;

  constructor(root:HTMLElement,private actions:UIActions){
    root.innerHTML=`<main id="game-shell" class="game-shell" data-view="loading" aria-label="夜市急送游戏"><canvas id="game-canvas" width="1280" height="720" aria-label="夜市战场"></canvas><div id="hud" class="hud" hidden><div class="hud-top"><div id="player-health" class="player-health" aria-label="生命值"><span class="hp-heart" aria-hidden="true">♥</span><div><div class="hp-caption"><span>生命</span><strong id="hp-value">100 / 100</strong></div><div class="hp-track"><i id="hp-tail"></i><i id="hp-fill"></i></div></div><span class="low-hp-label">低血量</span></div><div class="hud-score"><span>得分</span><strong id="score-value">000000</strong></div><div id="time-value" class="hud-clock" aria-label="存活时间">00:00</div><button id="lab-button" class="lab-hud-button" data-action="lab" hidden>试验工具</button><button class="pause-button icon-button" data-action="pause" aria-label="暂停游戏">${icon('pause')}</button></div><div id="stage-label" class="stage-label">热身开场</div><div id="status-strip" class="status-strip" aria-label="持续状态"></div><div id="weapon-state" class="weapon-state" aria-label="当前武器，只读信息"></div><button id="dash-button" class="dash-button" data-action="dash" aria-label="冲刺"><span class="dash-arrow" aria-hidden="true">➜</span><strong>冲刺</strong><small id="dash-status">Space / Shift</small></button><div id="sprint-label" class="sprint-label" hidden>顺势加速</div><div class="keyboard-tip">W A S D / 方向键移动 · Space / Shift 冲刺 · Esc 暂停</div></div><div id="joystick" class="joystick" aria-hidden="true" hidden><div class="joystick-ring"></div><div class="joystick-knob"></div></div><div id="overlay" class="overlay"></div><div class="toast" role="status" aria-live="polite" hidden></div><div class="shell-corners" aria-hidden="true"></div></main>`;
    this._shell=root.querySelector('#game-shell')!;
    this._canvas=root.querySelector('#game-canvas')!;
    this.overlay=root.querySelector('#overlay')!;
    this.hud=root.querySelector('#hud')!;
    this.joystick=root.querySelector('#joystick')!;
    this.toastEl=root.querySelector('.toast')!;
    this.scoreEl=root.querySelector('#score-value')!;
    this.timeEl=root.querySelector('#time-value')!;
    this.hpValue=root.querySelector('#hp-value')!;this.hpFill=root.querySelector('#hp-fill')!;this.hpTail=root.querySelector('#hp-tail')!;this.hpBox=root.querySelector('#player-health')!;
    this.weaponEl=root.querySelector('#weapon-state')!;this.statusEl=root.querySelector('#status-strip')!;this.labButton=root.querySelector('#lab-button')!;this.dashButton=root.querySelector('#dash-button')!;this.dashStatus=root.querySelector('#dash-status')!;this.sprintLabel=root.querySelector('#sprint-label')!;
    this.stageEl=root.querySelector('#stage-label')!;
    this._shell.addEventListener('click',this.handleClick);
    this._shell.addEventListener('input',this.handleInput);
    this._shell.addEventListener('change',this.handleChange);
    this._shell.addEventListener('pointerdown',this.handleDashPointer,{passive:false});
    document.addEventListener('keydown',this.handleKeydown);
    this.show('loading',{progress:0});
  }
  get canvas(){return this._canvas;}
  get surface(){return this._shell;}
  get shell(){return this._shell;}
  get currentView(){return this.view;}

  show(view:View,data:ViewData={}):void{
    const previous=this.view;
    if(previous==='settings'&&view!=='settings'){this.tiltRequest++;this.tiltBusy=false;}
    if(previous==='play'&&view!=='play') this.focusBeforeModal=document.activeElement instanceof HTMLElement?document.activeElement:null;
    this.view=view;this.data={...this.data,...data};
    if(data.settings){this.settings=clone(data.settings);}
    if(view==='settings'&&previous!=='settings'&&previous!=='rotate'){this.draft=clone(data.settings??this.settings);this.tab='operation';this.defaultConfirm=false;this.cancelConfirm=false;}
    if(view==='settings'&&previous==='rotate')this.actions.previewSettings(clone(this.draft));
    this._shell.dataset.view=view;
    this._shell.dataset.hand=this.settings.hand;
    this._shell.dataset.motion=this.settings.reduceMotion?'reduced':'full';
    this._shell.dataset.size=this.settings.joystickSize;
    const inBattle=view==='play'||view==='pause'||view==='settings'||view==='confirm'||view==='countdown'||view==='lab';
    this.hud.hidden=!inBattle;
    this.hud.inert=view!=='play';this.dashButton.disabled=view!=='play';
    this.joystick.hidden=view!=='play'||this.settings.mode!=='joystick';
    this.overlay.hidden=view==='play';
    if(view==='play'){
      this.overlay.innerHTML='';this.setJoystick({active:false,x:0,y:0,dx:0,dy:0});
      this.focusBeforeModal?.blur();this.focusBeforeModal=null;return;
    }
    if(data.state)this.updateHUD(data.state);
    this.render();
    if(previous!==view)requestAnimationFrame(()=>{
      if(this.view!==view)return;
      const autofocus=this.overlay.querySelector<HTMLElement>('[data-primary],button:not([disabled]),[tabindex="0"]');
      autofocus?.focus({preventScroll:true});
    });
  }

  updateHUD(state:GameState):void{
    this.data.state=state;
    const value=score(state.score);if(this.scoreEl.textContent!==value)this.scoreEl.textContent=value;
    const time=formatTime(state.time);if(this.timeEl.textContent!==time)this.timeEl.textContent=time;
    const hp=Math.max(0,state.player.hp),ratio=Math.max(0,Math.min(1,hp/state.player.maxHp));
    this.hpValue.textContent=`${Math.ceil(hp)} / ${state.player.maxHp}`;
    this.hpBox.setAttribute('aria-label',`生命值 ${Math.ceil(hp)} / ${state.player.maxHp}`);
    this.hpBox.classList.toggle('low',ratio<.3);
    if(hp!==this.lastHp){this.hpTail.style.transition=hp>=this.lastHp?'none':'transform .25s ease .12s';this.hpFill.style.transform=`scaleX(${ratio})`;this.hpTail.style.transform=`scaleX(${ratio})`;this.lastHp=hp;}
    const dashRemaining=Math.max(0,(state.player.dashReadyAt??0)-state.time),dashing=(state.player.dashUntil??0)>state.time;
    this.dashButton.disabled=this.view!=='play'||dashRemaining>0;this.dashButton.dataset.ready=String(dashRemaining<=0);
    this.dashButton.style.setProperty('--dash-progress',String(1-Math.min(1,dashRemaining/3)));
    this.dashStatus.textContent=dashing?'冲刺中':dashRemaining>0?`${dashRemaining.toFixed(1)}秒`:'Space / Shift';
    this.dashButton.setAttribute('aria-label',dashRemaining>0?`冲刺冷却 ${dashRemaining.toFixed(1)}秒`:'冲刺');
    const sprint=state.player.sprintMultiplier??1;this.sprintLabel.hidden=sprint<1.01;this.sprintLabel.textContent=`顺势加速 +${Math.round((sprint-1)*100)}%`;
    this.labButton.hidden=!state.practice;this._shell.dataset.practice=String(state.practice);
    if(state.practice)this.scoreEl.textContent='不计分';
    const weapon=state.weapon,remaining=Math.max(0,weapon.readyAt-state.time),heat=Math.max(0,state.player.heatUntil-state.time);
    const phase=weapon.attack?.phase;
    const status=phase==='windup'?'蓄势':phase==='active'?'出手':phase==='recovery'?'收势':remaining>0?`${remaining.toFixed(1)}秒`:'行进方向 · 连续攻击';
    const weaponKey=`${weapon.kind}/${status}/${heat.toFixed(1)}`;
    if(weaponKey!==this.lastWeapon){this.lastWeapon=weaponKey;this.weaponEl.innerHTML=`<span class="weapon-mini" aria-hidden="true">${icon(weapon.kind)}</span><div class="weapon-copy"><div><strong>${WEAPON_GUIDE[weapon.kind].short}</strong><span class="readonly-tag">自动</span></div><span class="weapon-status">${status}</span><div class="weapon-track"><i style="transform:scaleX(${Math.max(0,Math.min(1,1-remaining/WEAPONS[weapon.kind].cooldown))})"></i></div></div>${heat>0?`<span class="heat-badge">急速<br>${heat.toFixed(1)}秒</span>`:''}`;}
    const activeZones=state.zones.filter(z=>z.expiresAt>state.time);
    const duration=(kind:'route'|'cone'|'lure')=>Math.max(0,...activeZones.filter(z=>z.kind===kind).map(z=>z.expiresAt-state.time));
    const route=activeZones.find(z=>z.kind==='route');let inRoute=false;
    if(route){const dx=state.player.x-route.x,dy=state.player.y-route.y;const along=dx*Math.cos(route.angle)+dy*Math.sin(route.angle),side=-dx*Math.sin(route.angle)+dy*Math.cos(route.angle);inRoute=along>=0&&along<=route.length&&Math.abs(side)<=route.width/2;}
    const statuses:Array<{kind:string;label:string;seconds:number;active:boolean}>=[];
    const add=(kind:string,label:string,seconds:number,active=true)=>{if(seconds>0)statuses.push({kind,label,seconds,active});};
    add('bubble','防撞×1',state.player.bubbleUntil-state.time);add('skate','滑板',state.player.skateUntil-state.time);add('route',inRoute?'路线加速':'路线',duration('route'),inRoute);add('dispatch','增援暂缓',state.effects.dispatchUntil-state.time);add('stamp','击败分×1.5',state.player.stampUntil-state.time);add('cones',`路锥×${activeZones.filter(z=>z.kind==='cone').length}`,duration('cone'));add('lure','诱饵',duration('lure'));
    const statusMarkup=statuses.slice(0,6).map(item=>`<div class="status-chip ${item.active?'':'inactive'}" data-status="${item.kind}" title="${item.label}"><span>${icon(item.kind)}</span><b>${item.label}</b><small>${item.seconds.toFixed(1)}秒</small></div>`).join('');
    if(statusMarkup!==this.lastStatus){this.statusEl.innerHTML=statusMarkup;this.lastStatus=statusMarkup;}
    if(state.stage!==this.lastStage||state.practice){this.lastStage=state.stage;const stages=['热身开场','小心冲刺','夜市高峰','极限夜班'];this.stageEl.textContent=state.practice?`配送试验场 · ${this.data.speed??1}× · 无自然刷新`:(stages[Math.min(3,Math.max(0,state.stage-1))]??'夜市挑战');}
  }

  toast(message:string):void{
    if(this.toastTimer)window.clearTimeout(this.toastTimer);
    if(this.view==='lab'){
      this.toastEl.hidden=true;
      const hint=this.overlay.querySelector<HTMLElement>('.lab-hint');
      if(hint){hint.textContent=message;hint.setAttribute('role','status');}
      return;
    }
    this.toastEl.textContent=message;this.toastEl.hidden=false;
    this.toastTimer=window.setTimeout(()=>{this.toastEl.hidden=true;},3200);
  }
  setJoystick(state:JoystickVisual):void{
    const knob=this.joystick.querySelector<HTMLElement>('.joystick-knob')!;
    this.joystick.classList.toggle('is-active',state.active);
    if(state.active){
      this.joystick.style.left=`${state.x}px`;this.joystick.style.top=`${state.y}px`;
      this.joystick.style.right='auto';this.joystick.style.bottom='auto';this.joystick.style.transform='translate(-50%,-50%)';
      knob.style.transform=`translate(calc(-50% + ${state.dx*.58}px),calc(-50% + ${state.dy*.58}px))`;
    }else{
      this.joystick.removeAttribute('style');knob.style.transform='translate(-50%,-50%)';
    }
  }
  private button(label:string,action:string,kind='primary',extra=''){return `<button class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;}
  private paper(content:string,classes=''){return `<section class="paper ${classes}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</section>`;}
  private render():void{
    const s=this.data.state;
    switch(this.view){
      case 'home':{
        const best=this.data.best;
        this.overlay.innerHTML=`<div class="home-vignette"></div><div class="home-layout"><section class="home-card"><div class="eyebrow"><span class="eyebrow-line"></span>今晚夜市 · 准时开跑</div><h1 class="game-title">夜市<span>急送</span><i class="title-streak"></i></h1><p class="home-tagline">送得快，也要躲得漂亮。</p><p class="home-description">食物小妖出动！穿过包围，抢到道具，<br>让下一次反击来得刚刚好。</p><div class="best-card"><span>本地最佳纪录</span><strong>${best?score(best.score):'等待你的第一单'}</strong>${best?`<small>存活 ${formatTime(best.time)}</small>`:''}</div>${this.button(`开始挑战 ${icon('arrow')}`,'start','primary start-button','data-primary')}<div class="home-secondary">${this.button(`${icon('gear')}操作设置`,'settings','secondary')}${this.button('玩法说明','tutorial','secondary')}</div><div class="home-secondary home-tools">${this.button('配送试验场','practice','secondary')}${this.button('武器与道具图鉴','catalog','secondary')}</div><div class="home-footer"><span>自动攻击 · 拾取换装 · 挑战纪录</span><button class="text-button" data-action="fullscreen" aria-label="全屏游玩">${icon('fullscreen')}全屏</button></div></section><div class="home-scene-label" aria-hidden="true"><span class="label-dot"></span>欢迎来到这条热闹的街</div></div>`;break;
      }
      case 'loading':{
        const raw=this.data.progress??0;const progress=Math.max(0,Math.min(100,raw<=1?raw*100:raw));
        this.overlay.innerHTML=this.paper(`<div class="loading-bag">${bag}</div><h2 id="dialog-title">夜市正在开张</h2><p class="muted">人物、道具和好心情，准备就绪就出发。</p><div class="load-track" role="progressbar" aria-label="加载进度" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div><p class="loading-percent">${Math.round(progress)}%</p>${this.data.message?`<p class="error-text">${escape(this.data.message)}</p>${this.button('重试','retry')}`:''}`,'loading-card');break;
      }
      case 'tutorial':
        this.overlay.innerHTML=this.paper(`<div class="paper-kicker">出发前的小贴士</div><h2 id="dialog-title">移动躲避，自动反击</h2><p class="muted">持续朝行进方向自动攻击，无目标也出手。拾取武器包换装。</p><div class="guide-grid"><article><div class="guide-icon fan">${icon('fan')}</div><h3>旋风电扇</h3><p>附近一次 60 伤害，<br>耐打的敌人仍会存活。</p></article><article><div class="guide-icon skate">${icon('skate')}</div><h3>滑板环绕</h3><p>绕身攻击 4 秒，<br>每目标每半秒最多 12。</p></article><article><div class="guide-icon soda">${icon('soda')}</div><h3>汽水缓速</h3><p>附近敌人减速 3 秒，<br>减速不会让它们无害。</p></article></div><div class="guide-controls"><span><b>电脑</b> WASD / 方向键 · Space / Shift 冲刺</span><span><b>手机</b> 摇杆 / 倾斜移动 · 触碰冲刺键</span></div><p class="warning-note">生命归零才结束。冲刺沿最后移动方向，持续 0.18 秒、冷却 3 秒；冲刺短暂免伤，结束后仍要躲开。同向持续移动可逐渐加速。</p><div class="paper-actions">${this.button('查看全部图鉴','catalog','secondary')}${this.button('返回首页','home','secondary')}${this.button('开始挑战','start','primary','data-primary')}</div>`,'guide-card');break;
      case 'countdown':
        this.overlay.innerHTML=`<div class="countdown" aria-live="assertive"><span>准备出发</span><strong>${this.data.count??3}</strong><p>${this.settings.mode==='tilt'?'保持舒适姿势，倾斜手机移动':'移动躲避，触碰道具反击'}</p></div>`;break;
      case 'pause':
        this.overlay.innerHTML=this.paper(`<div class="tape" aria-hidden="true"></div><h2 id="dialog-title">已暂停</h2><div class="paper-divider"></div><p class="run-summary">时间 ${formatTime(s?.time??0)}<span>·</span>得分 ${score(s?.score??0)}</p><div class="pause-bag">${bag}</div>${this.button('继续挑战','resume','primary wide','data-primary')}<div class="paper-actions">${this.button('设置','settings','secondary')}${this.button('返回首页','home','secondary')}</div>`,'pause-card');break;
      case 'settings':this.renderSettings();break;
      case 'lab':this.renderLab();break;
      case 'catalog':this.renderCatalog();break;
      case 'confirm':
        this.overlay.innerHTML=this.paper(`<div class="paper-kicker">先歇一会儿？</div><h2 id="dialog-title">结束本局？</h2><p class="confirm-message">本局进度将结束，<br>不计入最佳纪录。</p>${this.button('继续挑战','resume','primary wide','data-primary')}${this.button('结束本局','abandon','secondary wide')}`,'confirm-card');break;
      case 'result':{
        const cause=s?.cause?ENEMY_NAMES[s.cause]:'敌人';
        this.overlay.innerHTML=this.paper(`<div class="receipt-stamp">NIGHT MARKET / 本局小票</div><h2 id="dialog-title">${s?.practice?'试验结束':'本局结束'}</h2>${this.data.isRecord?'<div class="record-badge">新纪录</div>':'<div class="result-note">下一次，跑得更漂亮。</div>'}<div class="result-score"><span>${s?.practice?'配送试验场':'本局得分'}</span><strong>${s?.practice?'不计分':score(s?.score??0)}</strong></div><div class="receipt-dots"></div><dl class="result-stats"><div><dt>存活时间</dt><dd>${formatTime(s?.time??0)}</dd></div><div><dt>本地最佳</dt><dd>${this.data.best?score(this.data.best.score):score(s?.score??0)}</dd></div></dl><p class="failure-reason">生命耗尽 · ${cause}${s?.lastDamageAmount?`造成 ${s.lastDamageAmount} 点最后伤害`:""}</p>${s?.practice?'<p class="muted">试验记录不写入正式最佳成绩。</p>':""}${this.data.saved===false?'<p class="error-text" role="status">纪录暂未保存，关闭页面可能丢失。</p>':''}${this.button('再来一局','retry','primary wide','data-primary')}${this.button('返回首页','home','secondary wide')}`,'result-card');break;
      }
      case 'rotate':
        this.overlay.innerHTML=this.paper(`<div class="rotate-phone">${icon('phone')}</div><h2 id="dialog-title">横过来，更好玩</h2><p class="muted">请横屏继续挑战。<br>当前对局已经暂停。</p>${this.button('我已横屏，继续','resume','primary wide','data-primary')}${this.button('返回首页','home','secondary wide')}`,'rotate-card');break;
    }
  }

  private renderLab():void{
    const weapon=WEAPON_GUIDE[this.selectedWeapon],skill=SKILL_GUIDE[this.selectedSkill];
    this.overlay.innerHTML=this.paper(`<div class="lab-title"><div><div class="paper-kicker">自由体验 · 无自然刷新 · 不记入最佳</div><h2 id="dialog-title">配送试验场</h2></div>${this.button('继续试验','close-lab','primary compact','data-primary')}</div><div class="lab-grid"><section><h3>更换武器</h3><label class="sr-only" for="lab-weapon">试验武器</label><select id="lab-weapon" data-lab="weapon">${WEAPON_KINDS.map(k=>`<option value="${k}" ${k===this.selectedWeapon?'selected':''}>${WEAPON_NAMES[k]}</option>`).join('')}</select><p>${weapon.description}</p><small>${weapon.detail}</small>${this.button('装备并体验','choose-weapon','primary wide')}</section><section><h3>立即触发技能</h3><label class="sr-only" for="lab-skill">试验技能</label><select id="lab-skill" data-lab="skill">${SKILL_KINDS.map(k=>`<option value="${k}" ${k===this.selectedSkill?'selected':''}>${SKILL_NAMES[k]}</option>`).join('')}</select><p>${skill.description}</p><small>${skill.detail}</small>${this.button('触发并体验','trigger-skill','primary wide')}</section><section><h3>布置敌人</h3><label class="sr-only" for="lab-enemy">敌人类型</label><select id="lab-enemy" data-lab="enemy">${(Object.keys(ENEMY_NAMES) as EnemyKind[]).map(k=>`<option value="${k}" ${k===this.selectedEnemy?'selected':''}>${ENEMY_NAMES[k]}</option>`).join('')}</select><p>单只观察攻击判定，敌群体验贯穿、范围与防护。敌人会正常攻击。</p><div class="lab-spawns">${this.button('生成单只','spawn-single','secondary')}${this.button('生成敌群','spawn-group','secondary')}</div></section></div><div class="lab-footer"><div class="lab-speed" role="group" aria-label="试验速度">${[.5,1].map(speed=>`<button class="segment ${speed===(this.data.speed??1)?'selected':''}" data-speed="${speed}" aria-pressed="${speed===(this.data.speed??1)}">${speed}× 速度</button>`).join('')}</div><div>${this.button('补满生命','heal','secondary compact')}${this.button('清空场地','clear','secondary compact')}${this.button('重置试验','reset-lab','secondary compact')}${this.button('查看图鉴','catalog','secondary compact')}</div></div><p class="lab-hint">操作面板打开时模拟暂停。按 Esc 或“继续试验”回到场地；顶部“试验工具”可再次打开。</p>`,'lab-card');
  }
  private renderCatalog():void{
    const weapons=this.catalogTab==='weapons';
    const cards=weapons?WEAPON_KINDS.map((kind,i)=>({kind,title:WEAPON_NAMES[kind],id:`W${String(i+1).padStart(2,'0')}`,...WEAPON_GUIDE[kind]})):SKILL_KINDS.map((kind,i)=>({kind,title:SKILL_NAMES[kind],id:`S${String(i+1).padStart(2,'0')}`,...SKILL_GUIDE[kind]}));
    this.overlay.innerHTML=this.paper(`<div class="catalog-title"><h2 id="dialog-title">武器与道具图鉴</h2>${this.button('返回','close-catalog','secondary compact','data-primary')}</div><div class="settings-tabs" role="tablist" aria-label="图鉴分类"><button class="tab ${weapons?'selected':''}" data-catalog="weapons" role="tab" aria-selected="${weapons}">10 款武器</button><button class="tab ${weapons?'':'selected'}" data-catalog="skills" role="tab" aria-selected="${!weapons}">13 种技能</button></div><p class="catalog-note">${weapons?'武器持续朝行进方向攻击，没有目标也照常出手。转向改变下一次攻击方向；拾取武器箱换装。':'触碰小道具即生效。控制与减速不会清除敌人，生命归零才结束。'}</p><div class="catalog-grid">${cards.map(card=>`<article><div class="catalog-icon">${icon(card.kind)}</div><div><span class="catalog-id">${card.id} · ${card.role}</span><h3>${card.title}</h3><p>${card.description}</p><small>${card.detail}</small></div></article>`).join('')}</div>`,'catalog-card');
  }

  private segments<T extends string>(field:string,values:Array<[T,string]>,selected:T){return `<div class="segments" role="group" aria-label="${field==='mode'?'操作方式':field==='hand'?'操作手位':field==='quality'?'特效质量':field==='sensitivity'?'灵敏度':'摇杆大小'}">${values.map(([value,label])=>`<button class="segment ${selected===value?'selected':''}" data-setting="${field}" data-value="${value}" aria-pressed="${selected===value}">${selected===value?'<span aria-hidden="true">✓</span> ':''}${label}</button>`).join('')}</div>`;}
  private toggle(field:'muted'|'reduceMotion'|'shake',label:string,disabled=false){const checked=this.draft[field];return `<div class="setting-row"><label for="setting-${field}">${label}</label><button id="setting-${field}" class="toggle ${checked?'on':''}" role="switch" aria-checked="${checked}" data-toggle="${field}" ${disabled?'disabled':''}><span>${checked?'开启':'关闭'}</span><i></i></button></div>`;}
  private renderSettings():void{
    let body='';const d=this.draft;
    if(this.tab==='operation'){
      body=`<div class="setting-row"><span>操作方式</span>${this.segments('mode',[['joystick','摇杆'],['tilt',this.tiltBusy?'授权中…':'重力感应']],d.mode)}</div>`;
      if(d.mode==='joystick')body+=`<div class="setting-row"><span>摇杆大小</span>${this.segments('joystickSize',[['small','小'],['medium','中'],['large','大']],d.joystickSize)}</div><div class="setting-row"><span>操作手位</span>${this.segments('hand',[['left','左手'],['right','右手']],d.hand)}</div><p class="setting-note">调整布局不改变移动速度</p>`;
      else body+=`<div class="setting-row"><span>灵敏度</span>${this.segments('sensitivity',[['low','低'],['medium','中'],['high','高']],d.sensitivity)}</div><div class="setting-row"><span>中立姿态</span>${this.button('重新校准','calibrate','secondary compact')}</div><p class="setting-note">保持舒适横屏姿势，再点击校准。灵敏度不改变最高速度。</p>`;
    }else if(this.tab==='sound'){
      body=this.toggle('muted','总静音');
      for(const [field,label] of [['music','音乐音量'],['sfx','音效音量']] as const)body+=`<div class="setting-row range-row"><label for="setting-${field}">${label}</label><div class="range-control"><input id="setting-${field}" type="range" min="0" max="100" value="${Math.round(d[field]*100)}" data-range="${field}" aria-label="${label}" ${d.muted?'disabled':''}><output for="setting-${field}">${Math.round(d[field]*100)}%</output></div></div>`;
      body+='<p class="setting-note">音量可即时试听；取消将恢复原来的声音设置。</p>';
    }else{
      body=this.toggle('reduceMotion','减少动态')+this.toggle('shake','画面震动',d.reduceMotion)+`<div class="setting-row"><span>特效质量</span>${this.segments('quality',[['standard','标准'],['simple','简化']],d.quality)}</div><p class="setting-note">${d.reduceMotion?'减少动态已关闭震屏。':''}简化特效保留敌人预警和技能判定。</p>`;
    }
    this.overlay.innerHTML=this.paper(`<div class="settings-title"><span class="tiny-ticket" aria-hidden="true"></span><h2 id="dialog-title">设置</h2><span class="tiny-ticket" aria-hidden="true"></span></div><div class="settings-tabs" role="tablist" aria-label="设置类别">${([['operation','操作'],['sound','声音'],['display','画面']] as const).map(([tab,label])=>`<button role="tab" aria-selected="${this.tab===tab}" class="tab ${this.tab===tab?'selected':''}" data-tab="${tab}">${label}</button>`).join('')}</div><div class="settings-content" role="tabpanel">${body}</div>${this.defaultConfirm?`<div class="inline-confirm" role="alert"><span>恢复默认设置？最佳纪录不会被删除。</span><div>${this.button('取消','default-cancel','secondary compact')}${this.button('恢复默认','default-confirm','primary compact')}</div></div>`:''}${this.cancelConfirm?`<div class="inline-confirm" role="alert"><span>放弃未应用的修改？</span><div>${this.button('继续编辑','keep-editing','secondary compact')}${this.button('放弃修改','discard-settings','primary compact')}</div></div>`:''}<div class="settings-footer"><button class="text-button" data-action="defaults">恢复默认</button><div>${this.button('取消','cancel-settings','secondary')}${this.button('应用','apply-settings','primary','data-primary')}</div></div>`,'settings-card');
  }

  private changed(){return JSON.stringify(this.draft)!==JSON.stringify(this.settings);}
  private handleDashPointer=(event:PointerEvent)=>{
    if(this.view!=='play'||this.dashButton.disabled||!(event.target instanceof Element)||!event.target.closest('#dash-button'))return;
    event.preventDefault();this.actions.dash();
  };
  private cancelSettings(){if(this.changed()){this.cancelConfirm=true;this.renderSettings();}else this.actions.cancelSettings();}
  private handleClick=(event:MouseEvent)=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if(button.dataset.catalog){this.catalogTab=button.dataset.catalog as 'weapons'|'skills';this.renderCatalog();return;}
    if(button.dataset.speed){this.data.speed=Number(button.dataset.speed);this.actions.setSpeed(this.data.speed);this.renderLab();return;}
    if(button.dataset.tab){this.tab=button.dataset.tab as typeof this.tab;this.renderSettings();this.overlay.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus();return;}
    if(button.dataset.setting){void this.changeSetting(button.dataset.setting as keyof Settings,button.dataset.value!);return;}
    if(button.dataset.toggle){const key=button.dataset.toggle as 'muted'|'reduceMotion'|'shake';this.draft[key]=!this.draft[key];if(this.draft.reduceMotion)this.draft.shake=false;this.actions.previewSettings(clone(this.draft));this.renderSettings();this.overlay.querySelector<HTMLElement>(`[data-toggle="${key}"]`)?.focus();return;}
    switch(button.dataset.action){
      case 'dash':if(event.detail===0)this.actions.dash();break;case 'start':this.actions.start();break;case 'resume':this.actions.resume();break;case 'pause':this.actions.pause();break;
      case 'settings':this.actions.settings();break;case 'home':this.actions.home();break;case 'abandon':this.actions.abandon();break;
      case 'practice':this.actions.practice();break;case 'lab':this.actions.lab();break;case 'close-lab':this.actions.closeLab();break;
      case 'catalog':this.actions.catalog();break;case 'close-catalog':this.actions.closeCatalog();break;
      case 'choose-weapon':this.actions.selectWeapon(this.selectedWeapon);break;case 'trigger-skill':this.actions.triggerSkill(this.selectedSkill);break;
      case 'spawn-single':this.actions.spawnEnemy(this.selectedEnemy,false);break;case 'spawn-group':this.actions.spawnEnemy(this.selectedEnemy,true);break;
      case 'heal':this.actions.heal();break;case 'clear':this.actions.clear();break;case 'reset-lab':this.actions.resetLab();break;
      case 'retry':this.actions.retry();break;case 'tutorial':this.actions.tutorial();break;case 'fullscreen':this.actions.fullscreen();break;
      case 'apply-settings':this.settings=clone(this.draft);this.actions.applySettings(clone(this.draft));break;
      case 'cancel-settings':this.cancelSettings();break;
      case 'discard-settings':this.actions.previewSettings(clone(this.settings));this.actions.cancelSettings();break;
      case 'keep-editing':this.cancelConfirm=false;this.renderSettings();break;
      case 'defaults':this.defaultConfirm=true;this.cancelConfirm=false;this.renderSettings();break;
      case 'default-cancel':this.defaultConfirm=false;this.renderSettings();break;
      case 'default-confirm':this.draft=clone(DEFAULT_SETTINGS);this.defaultConfirm=false;this.actions.previewSettings(clone(this.draft));this.renderSettings();break;
      case 'calibrate':this.toast(this.actions.calibrate()?'已校准，保持舒适姿势即可':'尚未获得有效传感器数据，请稍后再试');break;
    }
  };
  private async changeSetting(key:keyof Settings,value:string){
    if(key==='mode'&&value!=='tilt'){this.tiltRequest++;this.tiltBusy=false;}
    if(key==='mode'&&value==='tilt'){
      if(this.tiltBusy)return;this.tiltBusy=true;
      const request=++this.tiltRequest;
      const pending=this.actions.requestTilt();this.renderSettings();
      let allowed=false;try{allowed=await pending;}catch{allowed=false;}finally{if(request===this.tiltRequest)this.tiltBusy=false;}
      if(request!==this.tiltRequest||this.view!=='settings')return;
      if(!allowed){this.toast('此设备暂不能使用重力感应，可使用摇杆');this.renderSettings();return;}
    }
    const valid:Partial<Record<keyof Settings,readonly string[]>>={mode:['joystick','tilt'],joystickSize:['small','medium','large'],hand:['left','right'],sensitivity:['low','medium','high'],quality:['standard','simple']};
    if(!valid[key]?.includes(value))return;
    this.draft={...this.draft,[key]:value};this.actions.previewSettings(clone(this.draft));this.renderSettings();
    this.overlay.querySelector<HTMLElement>(`[data-setting="${key}"][data-value="${value}"]`)?.focus();
  }
  private handleInput=(event:Event)=>{
    const input=event.target as HTMLInputElement;const field=input.dataset.range as 'music'|'sfx'|undefined;if(!field)return;
    this.draft[field]=Math.max(0,Math.min(1,Number(input.value)/100));
    const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${Math.round(this.draft[field]*100)}%`;
    this.actions.previewSettings(clone(this.draft));
  };
  private handleChange=(event:Event)=>{const select=event.target as HTMLSelectElement;if(select.dataset.lab==='weapon')this.selectedWeapon=select.value as WeaponKind;if(select.dataset.lab==='skill')this.selectedSkill=select.value as SkillKind;if(select.dataset.lab==='enemy')this.selectedEnemy=select.value as EnemyKind;if(select.dataset.lab)this.renderLab();};
  private handleKeydown=(event:KeyboardEvent)=>{
    if(this.view==='play')return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
      if(this.view==='settings'){if(this.cancelConfirm){this.cancelConfirm=false;this.renderSettings();}else if(this.defaultConfirm){this.defaultConfirm=false;this.renderSettings();}else this.cancelSettings();}
      else if(this.view==='pause')this.actions.resume();
      else if(this.view==='confirm')this.actions.pause();
      else if(this.view==='lab')this.actions.closeLab();
      else if(this.view==='catalog')this.actions.closeCatalog();
      else if(this.view==='result'||this.view==='tutorial')this.actions.home();
      return;
    }
    if(event.key==='Tab'){
      const focusable=Array.from(this.overlay.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>el.offsetParent!==null);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&(document.activeElement===first||!this.overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!this.overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  };
  dispose(){if(this.toastTimer)window.clearTimeout(this.toastTimer);document.removeEventListener('keydown',this.handleKeydown);this._shell.removeEventListener('click',this.handleClick);this._shell.removeEventListener('input',this.handleInput);this._shell.removeEventListener('change',this.handleChange);this._shell.removeEventListener('pointerdown',this.handleDashPointer);}
}
