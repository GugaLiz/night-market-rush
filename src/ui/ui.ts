import {DEFAULT_SETTINGS, isElite, ELEMENTAL_KINDS, ENEMY_NAMES, WEAPON_NAMES, WEAPON_KINDS, SKILL_NAMES, SKILL_KINDS, ULTIMATE_KINDS, type WeaponKind, type SkillKind, type EnemyKind, type BestRecord, type GameState, type Settings} from '../shared/types';
import {CATALOG, WEAPON_GUIDE, SKILL_GUIDE} from './catalog';
import {icon} from './game-icons';
import {WEAPONS} from '../core/weapons';
import {CONFIG} from '../core/config';
import {isOnPaperRoute} from '../core/geometry';
import {EXPRESS,expressCast} from '../core/ultimates';

export const practiceEnabled=import.meta.env.DEV||import.meta.env.MODE==='playtest';
const previewSkills=[...ELEMENTAL_KINDS,...ULTIMATE_KINDS] as const;
const marketDemos={marketFood:'热汤与涡锅',marketUpgrade:'配送箱改装',marketFinal:'五分钟尾单'} as const;
const upgradeGuide={
  frost:{name:'碎冰箱',icon:'frost',action:'冲刺撞碎带裂纹的冻怪',detail:'签收时发动一次刨冰机。朝亮蓝冰壳冲刺，第一只撞碎的怪会向前射出冰片。再次拾取刨冰机可冻住新目标。'},
  brine:{name:'泡菜箱',icon:'poison',action:'让回旋餐盘飞过毒雾',detail:'餐盘沾汁后，侧移引导它在回程给沿途的追兵挂毒。'},
} as const;

export type View = 'home'|'loading'|'tutorial'|'countdown'|'play'|'pause'|'settings'|'confirm'|'revive'|'closing'|'result'|'rotate'|'lab'|'catalog';
export interface UIActions {
  start:()=>void; resume:()=>void; pause:()=>void; settings:()=>void; dash:()=>void;
  applySettings:(settings:Settings)=>void; previewSettings:(settings:Settings)=>void;
  cancelSettings:()=>void; home:()=>void; abandon:()=>void; retry:()=>void;
  revive:()=>void; endRun:()=>void; resolveClosing:(choice:'settle'|'night')=>void;
  demo:(kind:'pickup'|'wave'|'giantBun'|typeof previewSkills[number]|keyof typeof marketDemos)=>void;
  practice:()=>void; lab:()=>void; closeLab:()=>void; catalog:()=>void; closeCatalog:()=>void;
  selectWeapon:(kind:WeaponKind)=>void; triggerSkill:(kind:SkillKind)=>void; spawnEnemy:(kind:EnemyKind,group:boolean)=>void;
  heal:()=>void; clear:()=>void; resetLab:()=>void; setSpeed:(speed:number)=>void;
  tutorial:()=>void; requestTilt:()=>Promise<boolean>; calibrate:()=>boolean; fullscreen:()=>void;
}
export interface JoystickVisual {active:boolean;x:number;y:number;dx:number;dy:number}
interface ViewData {settings?:Settings;state?:GameState;best?:BestRecord|null;isRecord?:boolean;saved?:boolean;progress?:number;count?:number;message?:string;speed?:number}
const clone=(settings:Settings):Settings=>({...settings});
export const formatTime=(seconds:number)=>`${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
const score=(value:number)=>Math.floor(Math.max(0,value)).toString();

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
  private coinEl:HTMLElement;
  private waveEl:HTMLElement;
  private waveBanner:HTMLElement;
  private comboEl:HTMLElement;
  private comboBox:HTMLElement;
  private comboFuse:HTMLElement;
  private burstEl:HTMLElement;
  private hintEl:HTMLElement;
  private feedbackRun?:GameState;
  private shownKills=0;
  private clusterStart=-1;
  private clusterKills=0;
  private burstUntil=0;
  private lastPulse=-1;
  private systemReduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  private timeEl:HTMLElement;
  private hpValue:HTMLElement;
  private hpFill:HTMLElement;
  private hpTail:HTMLElement;
  private hpBox:HTMLElement;
  private weaponEl:HTMLElement;
  private statusEl:HTMLElement;
  private labButton:HTMLElement|null;
  private dashButton:HTMLButtonElement;
  private pointerIsCoarse=window.matchMedia('(pointer: coarse)');
  private dashStatus:HTMLElement;
  private sprintLabel:HTMLElement;
  private lastHp=-1;
  private lastStatus='';
  private lastWeapon='';
  private catalogTab:keyof typeof CATALOG='weapons';
  private selectedWeapon:WeaponKind='tongs';
  private selectedSkill:SkillKind='fan';
  private selectedEnemy:EnemyKind='bun';
  private stageEl:HTMLElement;

  constructor(root:HTMLElement,private actions:UIActions){
    root.innerHTML=`<main id="game-shell" class="game-shell" data-view="loading" aria-label="夜市急送游戏">
      <canvas id="game-canvas" width="1280" height="720" aria-label="夜市战场"></canvas>
      <div id="hud" class="hud" hidden>
        <div class="hud-top">
          <div class="battle-ledger">
            <div class="kill-tally" title="本局击败">
              <span class="tally-monster" aria-hidden="true">${icon('bun')}</span>
              <div><span class="tally-caption">击败</span><strong id="score-value">0</strong></div>
            </div>
            <div class="battle-vitals">
              <div id="player-health" class="player-health" aria-label="生命值 100 / 100">
                <span class="hp-heart" aria-hidden="true">${icon('heart')}</span>
                <div><div class="hp-caption"><strong id="hp-value">100 / 100</strong></div>
                  <div class="hp-track"><i id="hp-tail"></i><i id="hp-fill"></i></div></div>
              </div>
              <div class="coin-count" title="已收金币"><i class="tally-coin" aria-hidden="true"></i><strong id="coin-value">0</strong><span>金币</span></div>
            </div>
            <div class="combo-count" hidden><span>连击</span><strong id="combo-value">×0</strong><i class="combo-fuse"></i><small id="burst-value" hidden></small></div>
          </div>
          <div class="battle-timing"><div class="wave-count"><span>波次</span><strong id="wave-value">1</strong></div>
            <div class="hud-clock" aria-label="存活时间"><strong id="time-value">00:00</strong></div></div>
          ${practiceEnabled?'<button id="lab-button" class="lab-hud-button" data-action="lab" hidden>试验工具</button>':''}
          <button class="pause-button icon-button" data-action="pause" aria-label="暂停游戏">${icon('pause')}</button>
        </div>
        <div id="wave-banner" class="wave-banner" role="status" hidden></div>
        <div id="stage-label" class="stage-label" hidden></div>
        <div id="status-strip" class="status-strip" aria-label="持续状态"></div>
        <div id="weapon-state" class="weapon-state" aria-label="当前武器"></div>
        <button id="dash-button" class="dash-button" data-action="dash" aria-label="冲刺"><span class="dash-arrow" aria-hidden="true">${icon('dash')}</span><strong>冲刺</strong><small id="dash-status">空格</small></button>
        <div id="sprint-label" class="sprint-label" hidden>连续跑动</div>
        <div id="opening-hint" role="status" hidden></div>
      </div>
      <div id="joystick" class="joystick" aria-hidden="true" hidden><div class="joystick-ring"></div><div class="joystick-knob"></div></div>
      <div id="overlay" class="overlay"></div><div class="toast" role="status" aria-live="polite" hidden></div>
      <div class="shell-corners" aria-hidden="true"></div></main>`;
    this._shell=root.querySelector('#game-shell')!;
    this._canvas=root.querySelector('#game-canvas')!;
    this.overlay=root.querySelector('#overlay')!;
    this.hud=root.querySelector('#hud')!;
    this.joystick=root.querySelector('#joystick')!;
    this.toastEl=root.querySelector('.toast')!;
    this.scoreEl=root.querySelector('#score-value')!;
    this.coinEl=root.querySelector('#coin-value')!;
    this.waveEl=root.querySelector('#wave-value')!;
    this.waveBanner=root.querySelector('#wave-banner')!;
    this.comboEl=root.querySelector('#combo-value')!;
    this.comboBox=root.querySelector('.combo-count')!;
    this.comboFuse=root.querySelector('.combo-fuse')!;
    this.burstEl=root.querySelector('#burst-value')!;
    this.hintEl=root.querySelector('#opening-hint')!;
    this.timeEl=root.querySelector('#time-value')!;
    this.hpValue=root.querySelector('#hp-value')!;this.hpFill=root.querySelector('#hp-fill')!;this.hpTail=root.querySelector('#hp-tail')!;this.hpBox=root.querySelector('#player-health')!;
    this.weaponEl=root.querySelector('#weapon-state')!;this.statusEl=root.querySelector('#status-strip')!;this.labButton=root.querySelector('#lab-button');this.dashButton=root.querySelector('#dash-button')!;this.dashStatus=root.querySelector('#dash-status')!;this.sprintLabel=root.querySelector('#sprint-label')!;
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
    if(view==='closing'||view==='result'||view==='home')this.toastEl.hidden=true;
    this._shell.dataset.hand=this.settings.hand;
    this._shell.dataset.motion=this.settings.reduceMotion?'reduced':'full';
    this._shell.dataset.size=this.settings.joystickSize;
    const inBattle=view==='play'||view==='pause'||view==='settings'||view==='confirm'||view==='countdown'||view==='lab';
    this.hud.hidden=!inBattle||(view==='settings'&&!data.state);
    this.hud.inert=view!=='play';this.dashButton.disabled=view!=='play';
    this.joystick.hidden=view!=='play'||this.settings.mode!=='joystick';
    this.overlay.hidden=view==='play';
    if(view==='play'){
      if(data.state)this.updateHUD(data.state);
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

  updateLoading(progress:number,message=''):void{
    this.data.progress=progress;
    this.data.message=message;
    if(this.view!=='loading')return;
    const percent=Math.round(Math.max(0,Math.min(1,progress))*100);
    const bar=this.overlay.querySelector<HTMLElement>('.load-track')!;
    bar.setAttribute('aria-valuenow',String(percent));
    bar.querySelector('i')!.style.width=`${percent}%`;
    this.overlay.querySelector('.loading-percent')!.textContent=`${percent}%`;
    const error=this.overlay.querySelector<HTMLElement>('.loading-error')!;
    error.hidden=!message;
    error.querySelector('.error-text')!.textContent=message;
  }

  updateHUD(state:GameState):void{
    this.data.state=state;
    this.updateCombatTally(state);
    const coins=String(state.collectedCoins);if(this.coinEl.textContent!==coins)this.coinEl.textContent=coins;
    const wave=String(state.wave);if(this.waveEl.textContent!==wave)this.waveEl.textContent=wave;
    const waveEnd=state.waveStartedAt+CONFIG.waves.transition;
    const showingWave=state.wave>=2&&state.time<waveEnd;
    const offer=state.market.offer;
    let banner='';
    if(showingWave)banner=`WAVE ${wave}`;
    else if(state.eliteWave===state.wave && state.enemies.some(e=>e.hp>0&&isElite(e.kind))){
      const names=state.enemies.filter(e=>e.hp>0&&isElite(e.kind)).map(e=>ENEMY_NAMES[e.kind]);
      banner='本波守关 · '+names.join('、');
    }else if(offer){
      const openedDuringWaveIntro=state.wave>=2&&offer.openedAt>=state.waveStartedAt-1e-8&&offer.openedAt<=waveEnd;
      const introStart=openedDuringWaveIntro?waveEnd:offer.openedAt;
      if(state.time<introStart+2.8)banner=offer.group==='final'?'收摊铃响 · 最后一单':'两家摊位等你接单';
    }
    this.waveBanner.hidden=!banner;
    if(banner!==this.waveBanner.textContent){
      this.waveBanner.textContent=banner;
      this.waveBanner.classList.toggle('market-banner',!!banner&&!showingWave);
    }
    if(state.time>=3||state.kills>0)this.hintEl.hidden=true;
    const time=formatTime(state.time);if(this.timeEl.textContent!==time)this.timeEl.textContent=time;
    const hp=Math.max(0,state.player.hp),ratio=Math.max(0,Math.min(1,hp/state.player.maxHp));
    const healthText=`${Math.ceil(hp)} / ${state.player.maxHp}`;
    if(this.hpValue.textContent!==healthText){
      this.hpValue.textContent=healthText;
      this.hpBox.setAttribute('aria-label',`生命值 ${healthText}`);
    }
    this.hpBox.classList.toggle('low',ratio<.3);
    if(hp!==this.lastHp){this.hpTail.style.transition=hp>=this.lastHp?'none':'transform .25s ease .12s';this.hpFill.style.transform=`scaleX(${ratio})`;this.hpTail.style.transform=`scaleX(${ratio})`;this.lastHp=hp;}
    const dashRemaining=Math.max(0,(state.player.dashReadyAt??0)-state.time),dashing=(state.player.dashUntil??0)>state.time;
    this.dashButton.disabled=this.view!=='play'||dashRemaining>0;this.dashButton.dataset.ready=String(dashRemaining<=0);
    this.dashButton.style.setProperty('--dash-progress',String(1-Math.min(1,dashRemaining/3)));
    const dashText=dashing?'冲刺中':dashRemaining>0?`${dashRemaining.toFixed(1)}秒`:this.pointerIsCoarse.matches?'就绪':'空格';
    if(this.dashStatus.textContent!==dashText)this.dashStatus.textContent=dashText;
    this.dashButton.setAttribute('aria-label',dashRemaining>0?`冲刺冷却 ${dashRemaining.toFixed(1)}秒`:'冲刺');
    const sprint=state.player.sprintMultiplier??1,sprintText=`${sprint>=CONFIG.player.sprintMax?'最高跑速':'连续跑动'} +${Math.round((sprint-1)*100)}%`;
    this.sprintLabel.hidden=sprint<1.01;
    if(this.sprintLabel.textContent!==sprintText)this.sprintLabel.textContent=sprintText;
    if(this.labButton)this.labButton.hidden=!state.practice;
    this._shell.dataset.practice=String(state.practice);
    const weapon=state.weapon,remaining=Math.max(0,weapon.readyAt-state.time),heat=Math.max(0,state.player.heatUntil-state.time);
    const upgrade=state.market.upgrade?upgradeGuide[state.market.upgrade]:null;
    const equipment=`${weapon.kind}/${state.market.upgrade??''}`;
    if(equipment!==this.lastWeapon){
      this.lastWeapon=equipment;
      const sticker=upgrade?`<span class="box-sticker" data-upgrade="${state.market.upgrade}" title="${upgrade.action}">${icon(upgrade.icon)}<b>${upgrade.name}</b></span>`:'';
      this.weaponEl.innerHTML=`<span class="weapon-mini" aria-hidden="true">${icon(weapon.kind)}</span><div class="weapon-copy"><strong>${WEAPON_GUIDE[weapon.kind].short}</strong><div class="weapon-track"><i></i></div></div>${sticker}`;
      this.weaponEl.setAttribute('aria-label',`当前武器 ${WEAPON_NAMES[weapon.kind]}${upgrade?'，配送箱改装 '+upgrade.name:''}`);
    }
    this.weaponEl.style.setProperty('--weapon-ready',String(Math.max(0,Math.min(1,1-remaining/WEAPONS[weapon.kind].cooldown))));
    const activeZones=state.zones.filter(z=>z.expiresAt>state.time);
    const duration=(kind:'route'|'cone'|'lure')=>Math.max(0,...activeZones.filter(z=>z.kind===kind).map(z=>z.expiresAt-state.time));
    const inRoute=activeZones.some(z=>isOnPaperRoute(state.player,z,state.time));
    const statuses:Array<{kind:string;label:string;seconds:number;active:boolean}>=[];
    const add=(kind:string,label:string,seconds:number,active=true)=>{if(seconds>0)statuses.push({kind,label,seconds,active});};
    const parcel=expressCast(state);
    if(parcel){
      const order=Math.min(EXPRESS.legs/EXPRESS.legsPerOrder,1+Math.floor(Math.max(0,parcel.landings.length-1)/EXPRESS.legsPerOrder));
      add('express',`急送第 ${order} 单`,parcel.expiresAt-EXPRESS.fade-state.time);
    }
    add('bubble','防撞×1',state.player.bubbleUntil-state.time);add('skate','滑板环绕',state.player.skateUntil-state.time);
    add('stamp','印章无敌',state.player.stampUntil-state.time);
    add('hook','钩索回收',state.effects.hookUntil-state.time);
    for(const field of state.elementalFields??[]){
      add(field.kind,SKILL_GUIDE[field.kind].role,field.releaseAt-state.time);
    }
    add('route',inRoute?`移速 +${Math.round((CONFIG.skills.route.speedMultiplier-1)*100)}%`:'踏上路线加速',duration('route'),inRoute);
    add('dispatch','增援暂停',state.effects.dispatchUntil-state.time);add('cones',`路锥×${activeZones.filter(z=>z.kind==='cone').length}`,duration('cone'));add('lure','诱饵',duration('lure'));
    const supply=state.pickups.find(p=>p.groupId&&!p.retiringUntil);
    if(supply)add('supply','补给选一',(supply.expiresAt??0)-state.time);
    add('heat','武器急速',heat);
    const statusMarkup=statuses.slice(0,6).map(item=>`<div class="status-chip ${item.active?'':'inactive'}" data-status="${item.kind}" title="${item.label}"><span>${icon(item.kind)}</span><b>${item.label}</b><small>${item.seconds.toFixed(1)}秒</small></div>`).join('');
    if(statusMarkup!==this.lastStatus){this.statusEl.innerHTML=statusMarkup;this.lastStatus=statusMarkup;}
    this.stageEl.hidden=!state.practice||this.data.speed!==.5;
    if(!this.stageEl.hidden)this.stageEl.textContent='0.5× 慢放';
  }

  private updateCombatTally(s:GameState):void{
    if(s!==this.feedbackRun){
      this.feedbackRun=s;
      this.shownKills=s.kills;
      this.clusterKills=0;
      this.clusterStart=-1;
      this.lastPulse=-1;
      this.burstUntil=0;
      this.hintEl.hidden=true;
      this.scoreEl.textContent=score(s.kills);
    }
    const gained=s.kills-this.shownKills;
    if(gained>0){
      this.shownKills=s.kills;
      this.scoreEl.textContent=score(s.kills);
      if(s.time-this.clusterStart>.35){this.clusterStart=s.time;this.clusterKills=0;}
      this.clusterKills+=gained;
      if(this.clusterKills>=4){
        this.burstEl.textContent=`瞬间击败 ${this.clusterKills}`;
        this.burstUntil=s.time+.85;
      }
      if(this.view==='play'&&s.time-this.lastPulse>.14&&!this.settings.reduceMotion&&!this.systemReduceMotion.matches){
        this.lastPulse=s.time;
        const numeral=this.clusterKills>=4?this.comboEl:this.scoreEl;
        numeral.getAnimations().forEach(animation=>animation.cancel());
        numeral.animate([{transform:'scale(1.18) rotate(-4deg)'},{transform:'none'}],{duration:190,easing:'ease-out'});
      }
    }
    const remaining=s.comboUntil-s.time;
    this.comboBox.hidden=s.combo<2||remaining<=0;
    this.burstEl.hidden=s.time>=this.burstUntil;
    if(!this.comboBox.hidden){
      const text=`×${s.combo}`;
      if(this.comboEl.textContent!==text)this.comboEl.textContent=text;
      this.comboBox.classList.toggle('surge',!this.burstEl.hidden);
      this.comboFuse.style.transform=`scaleX(${Math.min(1,remaining/CONFIG.rewards.comboDuration)})`;
    }
  }

  showOpeningHint():void{
    const movement=this.settings.mode==='tilt'?'倾斜手机':this.pointerIsCoarse.matches?'拖动摇杆':'方向键 / WASD';
    this.hintEl.textContent=`${movement}移动并瞄准，碰青色泡放技能，靠近金箱换武器`;
    this.hintEl.hidden=false;
  }

  showUpgrade(kind:keyof typeof upgradeGuide):void{
    const upgrade=upgradeGuide[kind];
    this.toast(`${upgrade.name} · ${upgrade.action}`,3500);
  }

  toast(message:string,duration=3200):void{
    if(this.toastTimer)window.clearTimeout(this.toastTimer);
    if(this.view==='lab'){
      this.toastEl.hidden=true;
      const hint=this.overlay.querySelector<HTMLElement>('.lab-hint');
      if(hint){hint.textContent=message;hint.setAttribute('role','status');}
      return;
    }
    this.toastEl.textContent=message;this.toastEl.hidden=false;
    this.toastTimer=window.setTimeout(()=>{this.toastEl.hidden=true;},duration);
  }
  setJoystick(state:JoystickVisual):void{
    const knob=this.joystick.querySelector<HTMLElement>('.joystick-knob')!;
    this.joystick.classList.toggle('is-active',state.active);
    if(state.active){
      this.joystick.style.left=`${state.x}px`;this.joystick.style.top=`${state.y}px`;
      this.joystick.style.right='auto';this.joystick.style.bottom='auto';this.joystick.style.transform='translate(-50%,-50%)';
      knob.style.transform=`translate(calc(-50% + ${state.dx}px),calc(-50% + ${state.dy}px))`;
    }else{
      this.joystick.removeAttribute('style');knob.style.transform='translate(-50%,-50%)';
    }
  }
  private button(label:string,action:string,kind='primary',extra=''){return `<button class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;}
  private fullscreenButton(classes:string):string{
    return `<button class="${classes}" data-action="fullscreen">${icon('fullscreen')}<span data-fullscreen-enter>全屏</span><span data-fullscreen-exit>退出全屏</span></button>`;
  }
  private paper(content:string,classes=''){return `<section class="paper ${classes}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</section>`;}
  private render():void{
    const s=this.data.state;
    const upgrade=s?.market.upgrade?upgradeGuide[s.market.upgrade]:null;
    switch(this.view){
      case 'home':{
        const best=this.data.best;
        this.overlay.innerHTML=`<div class="home-vignette"></div><div class="home-layout"><section class="home-card">
          <h1 class="game-title">夜市<span>急送</span></h1>
          <p class="home-description">穿过食物小妖，抢到外卖道具，给自己清出一条路。</p>
          <div class="best-card"><span>本地最佳击败</span><strong>${best?score(best.score)+' 只':'等待你的第一单'}</strong>${best?`<small>存活 ${formatTime(best.time)}</small>`:''}</div>
          ${this.button(`开始挑战 ${icon('arrow')}`,'start','primary start-button','data-primary')}
          <div class="home-secondary home-tools">${practiceEnabled?this.button('配送试验场','practice','secondary'):''}${this.button('夜市图鉴','catalog','secondary')}</div>
          <div class="home-footer"><button class="text-button" data-action="tutorial">玩法说明</button><button class="text-button" data-action="settings">操作设置</button>${this.fullscreenButton('text-button')}</div>
        </section></div>`;break;
      }
      case 'loading':{
        if(!this.overlay.querySelector('.loading-card')){
          this.overlay.innerHTML=this.paper(`<div class="loading-bag">${icon('rigBagSide')}</div><h2 id="dialog-title">夜市正在开张</h2><p class="muted">人物、道具和好心情，准备就绪就出发。</p>
            <div class="load-track" role="progressbar" aria-label="加载进度" aria-valuemin="0" aria-valuemax="100"><i></i></div><p class="loading-percent"></p>
            <div class="loading-error" hidden><p class="error-text" role="alert"></p>${this.button('重试','retry')}</div>`,'loading-card');
        }
        this.updateLoading(this.data.progress??0,this.data.message);
        break;
      }
      case 'tutorial':
        this.overlay.innerHTML=this.paper(`<h2 id="dialog-title">走位取道具，清出路线收金币</h2>
          <p class="muted">连续跑动会逐渐提速，转弯和掉头都能保持跑速。停下来，再起步会重新加速。</p>
          <div class="guide-grid">
            <article><div class="guide-icon guide-bubble">${icon('fan')}</div><h3>迎上技能泡</h3><p>青色闪电泡碰到街边会反弹。<br>迎上它，立即发动里面的技能。</p></article>
            <article><div class="guide-icon guide-coin"><i class="tally-coin" aria-hidden="true"></i></div><h3>走过金币</h3><p>怪物倒下后留下金币。<br>靠近收取，金币才入账。</p></article>
            <article><div class="guide-icon guide-crate">${icon('weaponCrate')}</div><h3>靠近武器箱</h3><p>金色方箱停在原地。<br>走近换装，旧武器可回来取。</p></article>
          </div>
          <div class="guide-controls"><span><b>电脑</b> WASD / 方向键移动 · Space / Shift 冲刺</span><span><b>手机</b> 摇杆 / 倾斜移动 · 点按冲刺</span></div>
          <p class="warning-note">击败本波全部精英才能换波。第 2、4 波各有两家摊位亮灯。进圈签一单，也可以绕过。红心汤包最多回 ${CONFIG.skills.health.amount} 点生命，首次倒下可免费复活。</p>
          <div class="paper-actions">${this.button('查看全部图鉴','catalog','secondary')}${this.button('返回首页','home','secondary')}${this.button('开始挑战','start','primary','data-primary')}</div>`,'guide-card');break;
      case 'countdown':
        this.overlay.innerHTML=`<div class="countdown" aria-live="assertive"><span>准备出发</span><strong>${this.data.count??1}</strong><p>${this.settings.mode==='tilt'?'保持舒适姿势，倾斜手机移动':'移动躲避，触碰道具反击'}</p></div>`;break;
      case 'pause':
        this.overlay.innerHTML=this.paper(`<div class="tape" aria-hidden="true"></div><h2 id="dialog-title">已暂停</h2><div class="paper-divider"></div><p class="run-summary">第 ${s?.wave??1} 波<span>·</span>击败 ${s?.kills??0}<span>·</span>用时 ${formatTime(s?.time??0)}</p>
          ${upgrade?`<div class="upgrade-instructions"><span>${icon(upgrade.icon)}</span><div><b>${upgrade.name} · ${upgrade.action}</b><p>${upgrade.detail}</p></div></div>`:`<div class="pause-bag">${icon('rigBagSide')}</div>`}
          ${this.button('继续挑战','resume','primary wide','data-primary')}<div class="paper-actions">${this.button('设置','settings','secondary')}${this.fullscreenButton('button secondary')}${this.button('返回首页','home','secondary')}</div>`,'pause-card');break;
      case 'settings':this.renderSettings();break;
      case 'revive':
        this.overlay.innerHTML=this.paper(`<h2 id="dialog-title">要继续这一单吗？</h2>
          <p class="confirm-message">生命耗尽。本局还有一次免费复活机会。</p>
          <p class="run-summary">第 ${s?.wave??1} 波<span>·</span>击败 ${s?.kills??0}<span>·</span>金币 ${s?.collectedCoins??0}</p>
          ${this.button('免费复活','revive','primary wide','data-primary')}
          ${this.button('放弃复活，查看成绩','end-run','secondary wide')}`,'confirm-card');break;
      case 'lab':this.renderLab();break;
      case 'closing':
        this.overlay.innerHTML=this.paper(`<div class="receipt-stamp">夜市急送 / 收摊签收联</div><h2 id="dialog-title">尾单已送达</h2>
          <p class="run-summary">签收 ${s?.market.completed??0} 单<span>·</span>击败 ${s?.kills??0} 只</p>
          <p class="muted">可以结清今天的单，也可以带着当前装备和生命继续跑夜班。</p>
          <div class="paper-actions">${this.button('收摊结算','settle','primary','data-primary')}${this.button('继续夜班','night','secondary')}</div>`,'closing-card');break;
      case 'catalog':this.renderCatalog();break;
      case 'confirm':
        this.overlay.innerHTML=this.paper(`<div class="paper-kicker">先歇一会儿？</div><h2 id="dialog-title">结束本局？</h2><p class="confirm-message">本局进度将结束，<br>不计入最佳纪录。</p>${this.button('继续挑战','resume','primary wide','data-primary')}${this.button('结束本局','abandon','secondary wide')}`,'confirm-card');break;
      case 'result':{
        const cause=s?.cause?ENEMY_NAMES[s.cause]:'敌人';
        this.overlay.innerHTML=this.paper(`<div class="receipt-stamp">夜市急送 / 本局小票</div>
          <h2 id="dialog-title">${s?.market.closing==='settled'?'收摊结算':s?.practice?'试验结束':'本局结束'}</h2>
          ${this.data.isRecord?'<div class="record-badge">新纪录</div>':''}
          <div class="result-score"><span>本局击败</span><strong id="result-kills">${score(s?.kills??0)}</strong></div>
          <div class="receipt-dots"></div><dl class="result-stats">
            <div><dt>签收订单</dt><dd id="result-orders">${s?.market.completed??0}</dd></div>
            <div><dt>已收金币</dt><dd id="result-coins">${s?.collectedCoins??0}</dd></div>
            <div><dt>存活时间</dt><dd id="result-time">${formatTime(s?.time??0)}</dd></div>
            <div><dt>到达波次</dt><dd>${s?.wave??1}</dd></div></dl>
          ${s?.market.closing==='settled'?'':`<p class="failure-reason">生命耗尽 · ${cause}${s?.lastDamageAmount?`造成 ${s.lastDamageAmount} 点最后伤害`:''}</p>`}
          ${s?.practice?'<p class="muted">试验记录不写入正式最佳成绩。</p>':`<p class="result-best">本地最佳击败 ${this.data.best?.score??0}</p>`}
          ${this.data.saved===false?'<p class="error-text" role="status">纪录暂未保存，关闭页面可能丢失。</p>':''}
          <div class="receipt-actions">${this.button('再来一局','retry','primary wide','data-primary')}${this.button('返回首页','home','secondary wide')}</div>`,'result-card');break;
      }
      case 'rotate':
        // The orientation notice in index.html is visible even while the script downloads.
        this.overlay.replaceChildren();break;
    }
  }

  private renderLab():void{
    if(!practiceEnabled)return;
    const weapon=WEAPON_GUIDE[this.selectedWeapon],skill=SKILL_GUIDE[this.selectedSkill];
    const showcases=previewSkills.map(kind=>`<button class="clay-sample" data-preview="${kind}"><span>${icon(kind)}</span>${SKILL_NAMES[kind]}</button>`).join('');
    this.overlay.innerHTML=this.paper(`<div class="lab-title"><div><div class="paper-kicker">自由体验 · 不记入正式纪录</div><h2 id="dialog-title">配送试验场</h2></div>${this.button('继续试验','close-lab','primary compact','data-primary')}</div>
      <section class="market-lab lab-demos" aria-label="夜市接单"><h3>夜市接单</h3>${Object.entries(marketDemos).map(([key,label])=>`<button class="button secondary compact" data-market-demo="${key}">${label}</button>`).join('')}</section>
      <div class="lab-grid"><section><h3>更换武器</h3><label class="sr-only" for="lab-weapon">试验武器</label><select id="lab-weapon" data-lab="weapon">${WEAPON_KINDS.map(k=>`<option value="${k}" ${k===this.selectedWeapon?'selected':''}>${WEAPON_NAMES[k]}</option>`).join('')}</select><p>${weapon.description}</p><small>${weapon.detail}</small>${this.button('装备并体验','choose-weapon','primary wide')}</section><section><h3>立即触发技能</h3><label class="sr-only" for="lab-skill">试验技能</label><select id="lab-skill" data-lab="skill">${SKILL_KINDS.map(k=>`<option value="${k}" ${k===this.selectedSkill?'selected':''}>${SKILL_NAMES[k]}</option>`).join('')}</select><p>${skill.description}</p><small>${skill.detail}</small>${this.button('触发并体验','trigger-skill','primary wide')}</section><section><h3>布置敌人</h3><label class="sr-only" for="lab-enemy">敌人类型</label><select id="lab-enemy" data-lab="enemy">${(Object.keys(ENEMY_NAMES) as EnemyKind[]).map(k=>`<option value="${k}" ${k===this.selectedEnemy?'selected':''}>${ENEMY_NAMES[k]}</option>`).join('')}</select><p>单只观察攻击判定，敌群体验贯穿、范围与防护。敌人会正常攻击。</p><div class="lab-spawns">${this.button('生成单只','spawn-single','secondary')}${this.button('生成敌群','spawn-group','secondary')}</div></section></div><section class="clay-samples" aria-label="技能与精英试打"><h3>实战试打</h3><div>${showcases}${this.button(`<span>${icon('giantBun')}</span>巨包三连坐`,'demo-giant','clay-sample giant-sample')}</div></section><div class="lab-demos"><h3>基础练习</h3>${this.button('取卡清场','demo-pickup','secondary compact')}${this.button('连续换波','demo-wave','secondary compact')}</div><div class="lab-footer"><div class="lab-speed" role="group" aria-label="试验速度">${[.5,1].map(speed=>`<button class="segment ${speed===(this.data.speed??1)?'selected':''}" data-speed="${speed}" aria-pressed="${speed===(this.data.speed??1)}">${speed}× 速度</button>`).join('')}</div><div>${this.button('补满生命','heal','secondary compact')}${this.button('清空场地','clear','secondary compact')}${this.button('重置试验','reset-lab','secondary compact')}${this.button('查看图鉴','catalog','secondary compact')}</div></div><p class="lab-hint">操作面板打开时模拟暂停。按 Esc 或“继续试验”回到场地；顶部“试验工具”可再次打开。</p>`,'lab-card');
  }
  private renderCatalog():void{
    const {cards,note}=CATALOG[this.catalogTab];
    const tabs=Object.entries(CATALOG).map(([key,{label}])=>{
      const selected=this.catalogTab===key;
      return `<button class="tab ${selected?'selected':''}" data-catalog="${key}" id="tab-${key}" role="tab" aria-selected="${selected}" aria-controls="catalog-panel">${label}</button>`;
    });
    const entries=cards.map(card=>`<article><div class="catalog-icon">${icon(card.kind)}</div><div><span class="catalog-id">${card.role}</span><h3>${card.title}</h3><p>${card.description}</p><small>${card.detail}</small></div></article>`);
    this.overlay.innerHTML=this.paper(`<div class="catalog-title"><h2 id="dialog-title">夜市图鉴</h2>${this.button('返回','close-catalog','secondary compact','data-primary')}</div>
      <div class="settings-tabs" role="tablist" aria-label="图鉴分类">${tabs.join('')}</div>
      <section id="catalog-panel" role="tabpanel" aria-labelledby="tab-${this.catalogTab}"><p class="catalog-note">${note}</p>
      <div class="catalog-grid catalog-${this.catalogTab}">${entries.join('')}</div></section>`,'catalog-card');
  }

  private segments<T extends string>(field:string,values:Array<[T,string]>,selected:T){return `<div class="segments" role="group" aria-label="${field==='mode'?'操作方式':field==='hand'?'操作手位':field==='quality'?'特效质量':field==='sensitivity'?'灵敏度':'摇杆大小'}">${values.map(([value,label])=>`<button class="segment ${selected===value?'selected':''}" data-setting="${field}" data-value="${value}" aria-pressed="${selected===value}">${selected===value?icon('check'):''}${label}</button>`).join('')}</div>`;}
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
    if(event.button!==0||this.view!=='play'||this.dashButton.disabled||!(event.target instanceof Element)||!event.target.closest('#dash-button'))return;
    event.preventDefault();this.actions.dash();
  };
  private cancelSettings(){if(this.changed()){this.cancelConfirm=true;this.renderSettings();}else this.actions.cancelSettings();}
  private handleClick=(event:MouseEvent)=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    const preview=previewSkills.find(kind=>kind===button.dataset.preview);
    if(preview){this.actions.demo(preview);return;}
    const marketDemo=button.dataset.marketDemo as keyof typeof marketDemos|undefined;
    if(marketDemo&&Object.hasOwn(marketDemos,marketDemo)){this.actions.demo(marketDemo);return;}
    if(button.dataset.catalog&&Object.hasOwn(CATALOG,button.dataset.catalog)){
      this.catalogTab=button.dataset.catalog as keyof typeof CATALOG;
      this.renderCatalog();
      this.overlay.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});
      return;
    }
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
      case 'revive':this.actions.revive();break;
      case 'end-run':this.actions.endRun();break;
      case 'settle':this.actions.resolveClosing('settle');break;
      case 'night':this.actions.resolveClosing('night');break;
      case 'demo-pickup':this.actions.demo('pickup');break;
      case 'demo-wave':this.actions.demo('wave');break;
      case 'demo-giant':this.actions.demo('giantBun');break;
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
