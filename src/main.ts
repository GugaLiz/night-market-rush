import './ui/style.css';
import './ui/clay.css';
import {Game} from './core/game';
import {CONFIG} from './core/config';
import {WEAPONS} from './core/weapons';
import {eliteArrival} from './core/waves';
import {WebStorage} from './platform/storage';
import {WebInput} from './platform/input';
import {GameAudio} from './platform/audio';
import {SkillHaptics} from './platform/skill-haptics';
import {UI, practiceEnabled, type View} from './ui/ui';
import {loadAssets} from './render/assets';
import {Renderer} from './render/renderer';
import {sampleBattleFrame} from './render/battle-frame';
import {RULES_VERSION, isGuard, isEpic, WEAPON_NAMES, type Settings, type SkillKind, type EnemyKind, type WeaponKind, type Vec} from './shared/types';

const storage=new WebStorage();
const saved=storage.load();
let settings={...saved.settings};
const audio=new GameAudio();
const haptics=new SkillHaptics();
const game=new Game();
let renderer:Renderer|undefined;
let ready=false,live=false,starting=false,rotated=false;
let settingsOrigin:'home'|'pause'='home';
let remaining=0,accumulator=0,lastFrame=performance.now();
let impactHold=0;
let canInterpolate=false;
let tutorialSeen=saved.tutorialSeen;
let recordSoundAt=0;
let inputRequest=0;
let rotateReturnView:View='home';
let catalogOrigin:View='home';
let practiceSpeed=1;
let loading={progress:0,message:''};
const orientation=window.matchMedia('(orientation: portrait)');
const portrait=()=>orientation.matches;

const ui:UI=new UI(document.getElementById('app')!,{
  start:()=>void start(),resume:()=>void resume(),pause:()=>pause(),dash:()=>dash(),
  settings:()=>{
    cancelPendingStart();
    gesture();settingsOrigin=live?'pause':'home';
    input.setEnabled(false);audio.setScene(live?'paused':'home');
    ui.show('settings',{settings,state:live?game.state:undefined});
  },
  previewSettings:draft=>{audio.setSettings(draft);applyFeedbackSettings(draft);gesture();},
  motionChanged:applyFeedbackSettings,leavePlay:()=>haptics.stop(),
  applySettings:next=>{
    settings={...next};applyPreferences();
    const persisted=storage.saveSettings(settings);leaveSettings();
    if(!persisted)ui.toast('设置仅在本次打开期间保留');
  },
  cancelSettings:()=>{applyPreferences();leaveSettings();},
  home:()=>{
    cancelPendingStart();
    gesture();
    if(rotated&&live&&(game.state.ended||game.state.market.closing==='choice')){ui.toast('请横屏继续处理本局');return;}
    if(live){input.setEnabled(false);audio.setScene('paused');ui.show('confirm',{state:game.state});}
    else home();
  },
  abandon:()=>{live=false;home();},
  retry:()=>{if(!ready)void boot();else if(game.state.practice)void startPractice(game.state.weapon.kind);else void start();},
  revive:()=>{
    if(ui.currentView!=='revive'||document.hidden||portrait()||!game.revive())return;
    gesture();countdown();
  },
  endRun:()=>{if(ui.currentView==='revive'){gesture();finish();}},
  resolveClosing:choice=>{
    if(ui.currentView!=='closing'||document.hidden||portrait()||!game.resolveClosing(choice))return;
    gesture();
    if(choice==='settle')finish();
    else beginPlay(false);
  },
  practice:()=>void startPractice(),lab:()=>openLab(),closeLab:()=>closeLab(),
  demo:kind=>{
    if(ui.currentView!=='lab'||!game.state.practice)return;
    practiceSpeed=1;
    if(kind==='pickup')game.setupPickupDemo();
    else if(kind==='wave')game.setupWaveDemo();
    else if(kind==='marketFood'||kind==='marketUpgrade'||kind==='marketFinal')game.setupMarketDemo(kind);
    else game.setupCombatDemo(kind);
    renderer?.reset();beginPlay(false);deliverEvents();
    const hints:Partial<Record<typeof kind,string>>={
      pickup:'迎上电扇技能泡，再沿热风清出的路收金币',
      wave:'换波后，技能泡继续飘动，金币仍可收取',
      giantBun:'看落点粉印，第三跳从缺口穿过',
      express:'迎上技能泡，快递包会来回飞送 15 秒。折返时转向可以引导下一程。',
      vortex:'向右取锅，绕着锅心打聚过来的怪',
      poison:'向右开坛，再绕过雾区，让追兵沾上毒汁',
      frost:'向右取刨冰机，趁冰壳碎裂前穿过怪群',
      marketFood:'走进摊前的签收圈，选热汤或涡锅',
      marketUpgrade:'看摊牌选一种改装，签收后当场试用',
      marketFinal:'巨包第三跳出现缺口时交餐，也可以先打倒它',
    };
    const hint=hints[kind]??'迎上大招的技能泡，然后用方向键或摇杆走位';
    ui.toast(hint,1600);
  },
  catalog:()=>{cancelPendingStart();gesture();catalogOrigin=ui.currentView;input.setEnabled(false);if(live)audio.setScene('paused');ui.show('catalog',{settings,state:game.state});},
  closeCatalog:()=>{gesture();if(catalogOrigin==='home')home();else ui.show(catalogOrigin,{settings,state:game.state,speed:practiceSpeed});},
  selectWeapon:kind=>{if(!game.state.practice)return;game.setWeapon(kind);closeLab();deliverEvents();},
  triggerSkill:kind=>{if(!game.state.practice)return;game.triggerSkill(kind);closeLab();deliverEvents();},
  spawnEnemy:(kind,group)=>{
    if(!game.state.practice)return;
    let secondEliteAt:Vec|undefined;
    if(isGuard(kind)){
      const present=game.state.enemies.filter(e=>e.hp>0&&isGuard(e.kind));
      if(present.length&&(isEpic(kind)||present.some(e=>isEpic(e.kind)))){
        ui.toast('史诗首领单独出战，请先击败守关怪或清空场地');return;
      }
      if(present.some(e=>e.kind===kind)||present.length>=CONFIG.waves.maxElites){
        ui.toast('场上最多两种精英，每种一只');return;
      }
      if(present.length)secondEliteAt=eliteArrival(game.state,kind,{random:Math.random});
    }
    const count=group&&!isGuard(kind)?6:1;
    const p=game.state.player;
    const distance=isEpic(kind)?330:!group&&game.state.weapon.kind==='lunchbox'?WEAPONS.lunchbox.range:150;
    for(let i=0;i<count;i++){
      const angle=group?-Math.PI/3+i*Math.PI/3:Math.atan2(p.moveDirection.y,p.moveDirection.x);
      game.spawnEnemy(kind,secondEliteAt??{
        x:Math.max(110,Math.min(1170,p.x+Math.cos(angle)*distance)),
        y:Math.max(135,Math.min(610,p.y+Math.sin(angle)*distance)),
      });
    }
    closeLab();deliverEvents();
  },
  heal:()=>{if(!game.state.practice)return;game.healPlayer();deliverEvents();ui.updateHUD(game.state);ui.toast('生命已补满');},
  clear:()=>{if(!game.state.practice)return;game.clearArena();renderer?.reset();deliverEvents();ui.updateHUD(game.state);ui.toast('场地已清空');},
  resetLab:()=>{if(!game.state.practice)return;const weapon=game.state.weapon.kind;game.reset(Date.now(),true);game.setWeapon(weapon);renderer?.reset();deliverEvents();ui.updateHUD(game.state);ui.toast('已重置试验，保留当前武器');},
  setSpeed:speed=>{practiceSpeed=speed===.5?.5:1;},
  tutorial:()=>{cancelPendingStart();gesture();ui.show('tutorial',{settings});},
  requestTilt:()=>input.requestTilt().then(ok=>ok&&input.calibrate()),
  calibrate:()=>input.calibrate(),
  fullscreen:async()=>{
    gesture();
    try{
      if(document.fullscreenElement){await document.exitFullscreen();return;}
      if(document.fullscreenEnabled){
        await document.documentElement.requestFullscreen({navigationUI:'hide'});
        return;
      }
    }catch{
      // A browser can expose fullscreen while disallowing it in the current tab.
    }
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(ios)ui.toast('点浏览器的「分享」→「添加到主屏幕」。如有「作为网页 App 打开」，请开启，再从主屏幕进入游戏。',9000);
    else ui.toast('当前浏览器无法进入全屏，可使用浏览器菜单里的全屏选项。');
  }
});
const input:WebInput=new WebInput(ui.surface,()=>pause(),value=>ui.setJoystick(value),()=>dash());
// A drag can suppress click entirely. Touch release is a fresh audio gesture after an interruption.
ui.surface.addEventListener('touchend',()=>{
  if(ui.currentView==='play'&&!document.hidden&&!audio.available)void audio.unlock();
},{capture:true,passive:true});
ui.canvas.tabIndex=-1;
applyPreferences();

function dash(){if(!live||ui.currentView!=='play'||document.hidden||rotated||game.state.ended)return;if(game.dash(input.getVector())){deliverEvents();ui.updateHUD(game.state);}ui.canvas.focus({preventScroll:true});}
function gesture(){void audio.unlock().then(()=>{if(!document.hidden)audio.play('ui');});}
function cancelPendingStart(){inputRequest++;starting=false;}
function applyFeedbackSettings(preferences:Settings){
  const reduced=preferences.reduceMotion||ui.systemReduceMotion.matches;
  if(reduced||!preferences.haptics)haptics.stop();
  renderer?.setSettings({...preferences,reduceMotion:reduced});
}
function applyPreferences(){input.setSettings(settings);audio.setSettings(settings);applyFeedbackSettings(settings);}
function leaveSettings(){
  if(settingsOrigin==='pause'&&live){audio.setScene('paused');ui.show('pause',{settings,state:game.state});}
  else home();
  checkOrientation();
}
function home(){
  cancelPendingStart();
  live=false;remaining=0;accumulator=0;recordSoundAt=0;input.setEnabled(false);
  renderer?.reset();
  if(portrait()){
    checkOrientation();
    rotateReturnView='home';
    return;
  }
  rotated=false;
  audio.setScene('home');
  ui.show('home',{settings,best:storage.data.best});
}
function pause(){
  if(!live||!['play','countdown','confirm'].includes(ui.currentView))return;
  remaining=0;accumulator=0;input.setEnabled(false);audio.setScene('paused');
  ui.show('pause',{settings,state:game.state});
}
async function prepareInput(request:number):Promise<boolean>{
  // Call permission request before the first await to retain the click gesture.
  const tilt=settings.mode==='tilt'?input.requestTilt():null;
  const tiltAllowed=tilt?await tilt:true;
  // Navigation while a permission dialog or first sensor sample is pending
  // takes priority over the older start/resume request.
  if(request!==inputRequest)return false;
  if(tilt&&(!tiltAllowed||!input.calibrate())){
    settings={...settings,mode:'joystick'};applyPreferences();storage.saveSettings(settings);
    ui.toast('未取得重力感应数据，已切换摇杆；电脑也可用方向键');
  }
  return true;
}
async function start(){
  if(!ready||starting)return;
  if(portrait()){checkOrientation();return;}
  gesture();starting=true;
  const request=++inputRequest;
  try{
    if(!(await prepareInput(request)))return;
    practiceSpeed=1;game.reset();renderer?.reset();recordSoundAt=0;live=true;
    beginPlay();
    if(document.hidden){pause();return;}
    checkOrientation();
    if(!tutorialSeen&&ui.currentView==='play'){
      tutorialSeen=true;storage.setTutorialSeen();ui.showOpeningHint();
    }
  }finally{if(request===inputRequest)starting=false;}
}
async function startPractice(weapon:WeaponKind='tongs'){
  if(!practiceEnabled||!ready||starting)return;
  if(portrait()){checkOrientation();return;}
  gesture();starting=true;const request=++inputRequest;
  try{if(!(await prepareInput(request)))return;practiceSpeed=1;game.reset(Date.now(),true);game.setWeapon(weapon);renderer?.reset();recordSoundAt=0;live=true;game.drainEvents();openLab();}
  finally{if(request===inputRequest)starting=false;}
}
function openLab(){
  if(!live||!game.state.practice)return;
  cancelPendingStart();remaining=0;accumulator=0;input.setEnabled(false);audio.setScene('paused');ui.show('lab',{state:game.state,settings,speed:practiceSpeed});
}
function closeLab(){if(!live||!game.state.practice)return;if(portrait()){checkOrientation();return;}beginPlay(false);}
function deliverEvents(){
  const events=game.drainEvents();renderer?.events(events);
  if(game.state.ended&&live&&ui.currentView==='play'){
    input.setEnabled(false);accumulator=0;audio.setScene('paused');
    if(!game.state.practice&&game.state.revivesUsed===0)ui.show('revive',{state:game.state});
    else finish();
  }else if(game.state.market.closing==='choice'&&live&&ui.currentView==='play'){
    input.setEnabled(false);accumulator=0;canInterpolate=false;audio.setScene('paused');
    ui.show('closing',{state:game.state});
  }
  const motionEnabled=!settings.reduceMotion&&!ui.systemReduceMotion.matches;
  if(ui.currentView==='play'&&motionEnabled&&settings.haptics)haptics.play(events);
  for(const event of events){
    if(event.type==='market')continue;
    audio.play(event);
    if(event.type==='ultimateBeat'&&event.kind==='berry'&&motionEnabled)impactHold=.03;
    if(event.type==='notice')ui.toast(event.message);
    else if(event.type==='weapon')ui.toast(`已换装 · ${WEAPON_NAMES[event.kind]}`);
  }
  // Play the receipt after a skill, weapon swap, or switch to the closing dialog.
  for(const event of events){
    if(event.type!=='market')continue;
    audio.play(event);
    if(event.action==='sign'&&(event.kind==='frost'||event.kind==='brine'))ui.showUpgrade(event.kind);
  }
}
async function resume(){
  if(portrait()){ui.toast('请将设备横过来，再继续');return;}
  if(rotated){checkOrientation();return;}
  if(game.state.market.closing==='choice'&&live)return;
  if(game.state.ended&&live)return;
  rotated=false;
  if(!live){home();return;}
  if(starting)return;starting=true;
  void audio.unlock();
  const request=++inputRequest;
  try{if(await prepareInput(request)){if(game.state.practice)beginPlay(false);else countdown();}}finally{if(request===inputRequest)starting=false;}
}
function countdown(){
  input.setEnabled(false);audio.setScene('paused');remaining=1;accumulator=0;
  ui.show('countdown',{settings,state:game.state,count:1});audio.play('ui');
  if(document.hidden){pause();return;}
  checkOrientation();
}
function beginPlay(playStart=true){
  remaining=0;accumulator=0;impactHold=0;canInterpolate=false;lastFrame=performance.now();
  ui.show('play',{settings,state:game.state,speed:practiceSpeed});
  ui.canvas.focus({preventScroll:true});input.setEnabled(true);audio.setScene('play');if(playStart)audio.play('start');
}
function finish(){
  if(!live||!game.state.ended)return;
  live=false;input.setEnabled(false);accumulator=0;audio.setScene('paused');
  const best=storage.data.best;
  const {kills,time}=game.state;
  const isRecord=!game.state.practice&&(!best||kills>best.score||(kills===best.score&&time>best.time));
  const persisted=isRecord?storage.saveBest({score:kills,time,rulesVersion:RULES_VERSION,date:new Date().toISOString()}):true;
  ui.show('result',{state:game.state,best:storage.data.best,isRecord,saved:persisted,settings});
  recordSoundAt=isRecord?performance.now()+900:0;
}
function checkOrientation(){
  if(portrait()){
    if(rotated)return;
    cancelPendingStart();
    const view=ui.currentView;
    rotateReturnView=['play','countdown','confirm'].includes(view)?'pause':view;
    if(view==='settings')applyPreferences();
    if(view==='play'||view==='countdown')pause();
    input.setEnabled(false);audio.setScene('paused');rotated=true;
    ui.show('rotate',{settings});
    document.getElementById('orientation-title')?.focus({preventScroll:true});
  }else if(rotated){
    rotated=false;
    if(!ready)ui.show('loading',loading);
    else if(rotateReturnView==='home')home();
    else{
      ui.show(rotateReturnView,{settings,state:live||rotateReturnView==='result'?game.state:undefined});
      audio.setScene(live||rotateReturnView==='result'?'paused':'home');
    }
  }
}
orientation.addEventListener('change',checkOrientation);
window.addEventListener('blur',()=>pause());
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pause();audio.setScene('silent');}
  else audio.setScene(rotated||!ready||live||ui.currentView==='result'?'paused':'home');
});

function frame(now:number){
  const elapsed=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  // A stalled foreground frame has no usable input history. Resume from the last
  // simulated position; blur, visibility and orientation events handle leaving play.
  let dt=elapsed>.25?0:Math.min(.1,elapsed);
  if(ui.currentView==='play'&&impactHold>0){
    const held=Math.min(impactHold,dt);
    impactHold-=held;dt-=held;
  }
  if(ui.currentView==='countdown'){
    remaining-=dt;
    if(remaining<=0)beginPlay();
  }
  if(ui.currentView==='play'){
    accumulator+=dt*(game.state.practice?practiceSpeed:1);
    const beforeStep=game.state.time;
    while(accumulator>=CONFIG.step&&ui.currentView==='play'){
      game.update(CONFIG.step,input.getVector());accumulator-=CONFIG.step;
      canInterpolate=true;
      deliverEvents();
    }
    if(game.state.time!==beforeStep)ui.updateHUD(game.state);
  }
  const view=ui.currentView;
  if(recordSoundAt&&now>=recordSoundAt){if(view==='result')audio.play('record');recordSoundAt=0;}
  const showRun=live||view==='result';
  const renderMode=view==='play'?'play':view==='result'?'result':showRun?'pause':'home';
  const scene=renderMode==='play'&&canInterpolate
    ?sampleBattleFrame(game.state,accumulator/CONFIG.step)
    :showRun?game.state:null;
  renderer?.render(scene,renderMode==='pause'?0:dt*(game.state.practice&&showRun?practiceSpeed:1),renderMode,elapsed);
  requestAnimationFrame(frame);
}
async function boot(){
  const attempt={progress:0,message:''};
  loading=attempt;
  checkOrientation();
  if(!rotated)ui.updateLoading(0);
  try{
    const assets=await loadAssets(progress=>{
      if(loading!==attempt||attempt.message)return;
      attempt.progress=progress;
      if(!rotated)ui.updateLoading(progress);
    });
    if(loading!==attempt)return;
    renderer=new Renderer(ui.canvas,assets);applyFeedbackSettings(settings);ready=true;home();
  }catch(error){
    if(loading!==attempt)return;
    console.error('Asset loading failed',error);
    attempt.message='素材加载失败，请确认网络连接后重试。';
    if(!rotated)ui.updateLoading(attempt.progress,attempt.message);
  }
}
void boot();requestAnimationFrame(frame);

// Development-only scenarios. Vite removes this entire branch from production.
if(import.meta.env.DEV){
  Object.assign(window,{__gameTest:{
    game:()=>game,
    snapshot:()=>structuredClone(game.state),
    view:()=>ui.currentView,
    input:()=>input.getVector(),
    audioAvailable:()=>audio.available,
    scenario:(kind:SkillKind|'fail'|'showcase')=>{
      game.reset(12345);renderer?.reset();live=true;
      const s=game.state;
      const enemy=(id:number,kind:EnemyKind,x:number,y:number)=>{const e=game.spawnEnemy(kind,{x,y});e.id=id;e.spawnAt=-2;e.phaseUntil=100;return e;};
      if(kind==='fail'){s.player.hp=1;s.enemies=[enemy(100,'bun',s.player.x,s.player.y)];}
      else if(kind==='showcase'){
        s.enemies=[enemy(100,'bun',300,300),enemy(101,'box',940,320),enemy(102,'bowl',860,580),enemy(103,'bun',380,530),enemy(104,'box',1050,500)];
        s.pickups=[{id:200,kind:'fan',x:470,y:260,radius:14.58,bornAt:0},{id:201,kind:'skate',x:820,y:440,radius:14.58,bornAt:0},{id:202,kind:'soda',x:470,y:560,radius:14.58,bornAt:0}];
        s.player.skateUntil=4;
      }else{
        s.enemies=[enemy(100,'bun',s.player.x+55,s.player.y),enemy(101,'box',s.player.x+130,s.player.y+15)];
        s.pickups=[{id:200,kind,x:s.player.x,y:s.player.y,radius:14.58,bornAt:0}];
      }
      beginPlay();
    },
    freeze:()=>pause()
  }});
}
