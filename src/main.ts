import './ui/style.css';
import {Game} from './core/game';
import {WebStorage} from './platform/storage';
import {WebInput} from './platform/input';
import {GameAudio} from './platform/audio';
import {UI, type View} from './ui/ui';
import {loadAssets} from './render/assets';
import {Renderer} from './render/renderer';
import {RULES_VERSION, WEAPON_NAMES, type Settings, type SkillKind, type EnemyKind, type WeaponKind} from './shared/types';

const storage=new WebStorage();
const saved=storage.load();
let settings={...saved.settings};
const audio=new GameAudio();
const game=new Game();
let renderer:Renderer|undefined;
let ready=false,live=false,starting=false,rotated=false;
let settingsOrigin:'home'|'pause'='home';
let remaining=0,lastCount=0,accumulator=0,lastFrame=performance.now();
let tutorialSeen=saved.tutorialSeen;
let recordSoundAt=0;
let inputRequest=0;
let rotateReturnView:View='home';
let catalogOrigin:View='home';
let practiceSpeed=1;
const portrait=()=>window.innerWidth<window.innerHeight&&window.innerWidth<950;

const ui:UI=new UI(document.getElementById('app')!,{
  start:()=>void start(),resume:()=>void resume(),pause:()=>pause(),dash:()=>dash(),
  settings:()=>{
    cancelPendingStart();
    gesture();settingsOrigin=live?'pause':'home';
    input.setEnabled(false);audio.setScene(live?'paused':'home');
    ui.show('settings',{settings,state:live?game.state:undefined});
  },
  previewSettings:draft=>{audio.setSettings(draft);renderer?.setSettings(draft);audio.play('ui');},
  applySettings:next=>{
    settings={...next};applyPreferences();
    const persisted=storage.saveSettings(settings);leaveSettings();
    if(!persisted)ui.toast('设置仅在本次打开期间保留');
  },
  cancelSettings:()=>{applyPreferences();leaveSettings();},
  home:()=>{
    cancelPendingStart();
    gesture();
    if(live){input.setEnabled(false);audio.setScene('paused');ui.show('confirm',{state:game.state});}
    else home();
  },
  abandon:()=>{live=false;home();},
  retry:()=>{if(!ready)void boot();else if(game.state.practice)void startPractice(game.state.weapon.kind);else void start(true);},
  practice:()=>void startPractice(),lab:()=>openLab(),closeLab:()=>closeLab(),
  catalog:()=>{cancelPendingStart();gesture();catalogOrigin=ui.currentView;input.setEnabled(false);if(live)audio.setScene('paused');ui.show('catalog',{settings,state:game.state});},
  closeCatalog:()=>{gesture();if(catalogOrigin==='home')home();else ui.show(catalogOrigin,{settings,state:game.state,speed:practiceSpeed});},
  selectWeapon:kind=>{if(!game.state.practice)return;game.setWeapon(kind);closeLab();deliverEvents();},
  triggerSkill:kind=>{if(!game.state.practice)return;game.triggerSkill(kind);closeLab();deliverEvents();},
  spawnEnemy:(kind,group)=>{if(!game.state.practice)return;const count=group?6:1;const p=game.state.player;const spawnDistance=!group&&game.state.weapon.kind==='lunchbox'?300:150;for(let i=0;i<count;i++){const angle=group?-Math.PI/3+i*Math.PI/3:Math.atan2(p.moveDirection.y,p.moveDirection.x);game.spawnEnemy(kind,{x:Math.max(110,Math.min(1170,p.x+Math.cos(angle)*spawnDistance)),y:Math.max(135,Math.min(610,p.y+Math.sin(angle)*spawnDistance))});}closeLab();deliverEvents();},
  heal:()=>{if(!game.state.practice)return;game.healPlayer();deliverEvents();ui.updateHUD(game.state);ui.toast('生命已补满');},
  clear:()=>{if(!game.state.practice)return;game.clearArena();renderer?.reset();deliverEvents();ui.updateHUD(game.state);ui.toast('场地已清空');},
  resetLab:()=>{if(!game.state.practice)return;const weapon=game.state.weapon.kind;game.reset(Date.now(),true);game.setWeapon(weapon);renderer?.reset();deliverEvents();ui.updateHUD(game.state);ui.toast('已重置试验，保留当前武器');},
  setSpeed:speed=>{practiceSpeed=speed===.5?.5:1;},
  tutorial:()=>{cancelPendingStart();gesture();ui.show('tutorial',{settings});},
  requestTilt:()=>input.requestTilt().then(ok=>ok&&input.calibrate()),
  calibrate:()=>input.calibrate(),
  fullscreen:()=>{
    gesture();
    const request=document.fullscreenElement?document.exitFullscreen():ui.shell.requestFullscreen?.();
    if(request)void request.catch(()=>ui.toast('此浏览器不支持全屏，可横屏游玩'));
    else ui.toast('此浏览器不支持全屏，可横屏游玩');
  }
});
const input:WebInput=new WebInput(ui.surface,()=>pause(),value=>ui.setJoystick(value),()=>dash());
ui.canvas.tabIndex=-1;
applyPreferences();

function dash(){if(!live||ui.currentView!=='play'||document.hidden||rotated||game.state.ended)return;if(game.dash()){deliverEvents();ui.updateHUD(game.state);}ui.canvas.focus({preventScroll:true});}
function gesture(){void audio.unlock();audio.play('ui');}
function cancelPendingStart(){inputRequest++;starting=false;}
function applyPreferences(){input.setSettings(settings);audio.setSettings(settings);renderer?.setSettings(settings);}
function leaveSettings(){
  if(settingsOrigin==='pause'&&live){audio.setScene('paused');ui.show('pause',{settings,state:game.state});}
  else home();
  checkOrientation();
}
function home(){
  cancelPendingStart();
  rotated=false;
  live=false;remaining=0;accumulator=0;recordSoundAt=0;input.setEnabled(false);
  audio.setScene('home');renderer?.reset();
  ui.show('home',{settings,best:storage.data.best});
  checkOrientation();
}
function pause(){
  if(!live||!['play','countdown','confirm'].includes(ui.currentView))return;
  remaining=0;accumulator=0;input.setEnabled(false);audio.setScene('paused');
  ui.show('pause',{settings,state:game.state});
}
async function prepareInput(request:number):Promise<boolean>{
  // Call permission request before the first await to retain the click gesture.
  const tilt=settings.mode==='tilt'?input.requestTilt():null;
  void audio.unlock();
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
async function start(force=false){
  if(!ready||starting)return;
  if(portrait()){checkOrientation();return;}
  gesture();
  if(!force&&!tutorialSeen&&ui.currentView!=='tutorial'){
    ui.show('tutorial',{settings});return;
  }
  tutorialSeen=true;storage.setTutorialSeen();starting=true;
  const request=++inputRequest;
  try{
    if(!(await prepareInput(request)))return;
    practiceSpeed=1;game.reset();renderer?.reset();recordSoundAt=0;live=true;countdown();
  }finally{if(request===inputRequest)starting=false;}
}
async function startPractice(weapon:WeaponKind='tongs'){
  if(!ready||starting)return;
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
  if(game.state.ended&&live)finish();
  for(const event of events){audio.play(event);if(event.type==='notice')ui.toast(event.message);else if(event.type==='weapon')ui.toast(`已换装 · ${WEAPON_NAMES[event.kind]}`);else if(event.type==='stage'&&!game.state.practice)ui.toast(['','热身开场','小心冲刺：留意方向预警','夜市高峰：敌人更密集','极限夜班：注意生命值'][event.stage]);}
}
async function resume(){
  if(portrait()){ui.toast('请将设备横过来，再继续');return;}
  rotated=false;
  if(!live){home();return;}
  if(starting)return;starting=true;
  const request=++inputRequest;
  try{if(await prepareInput(request)){if(game.state.practice)beginPlay(false);else countdown();}}finally{if(request===inputRequest)starting=false;}
}
function countdown(){
  input.setEnabled(false);audio.setScene('paused');remaining=3;lastCount=3;accumulator=0;
  ui.show('countdown',{settings,state:game.state,count:3});audio.play('ui');
  if(document.hidden){pause();return;}
  checkOrientation();
}
function beginPlay(playStart=true){
  remaining=0;accumulator=0;lastFrame=performance.now();
  ui.show('play',{settings,state:game.state,speed:practiceSpeed});
  ui.canvas.focus({preventScroll:true});input.setEnabled(true);audio.setScene('play');if(playStart)audio.play('start');
}
function finish(){
  live=false;input.setEnabled(false);accumulator=0;audio.setScene('paused');
  const best=storage.data.best;
  const isRecord=!game.state.practice&&(!best||game.state.score>best.score||(game.state.score===best.score&&game.state.time>best.time));
  const persisted=isRecord?storage.saveBest({score:game.state.score,time:game.state.time,rulesVersion:RULES_VERSION,date:new Date().toISOString()}):true;
  ui.show('result',{state:game.state,best:storage.data.best,isRecord,saved:persisted,settings});
  recordSoundAt=isRecord?performance.now()+900:0;
}
function checkOrientation(){
  if(!ready)return;
  if(portrait()){
    if(!rotated){
      cancelPendingStart();
      const view=ui.currentView;
      rotateReturnView=['play','countdown','confirm'].includes(view)?'pause':view;
    }
    if(ui.currentView==='settings')applyPreferences();
    if(ui.currentView==='play'||ui.currentView==='countdown')pause();
    input.setEnabled(false);audio.setScene('paused');rotated=true;
    ui.show('rotate',{settings,state:game.state});
  }else if(rotated){
    rotated=false;
    if(rotateReturnView==='home'||rotateReturnView==='rotate')home();
    else{
      ui.show(rotateReturnView,{settings,state:game.state});
      audio.setScene(live||rotateReturnView==='result'?'paused':'home');
    }
  }
}
window.addEventListener('resize',checkOrientation);
window.addEventListener('blur',()=>pause());
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pause();audio.setScene('silent');}
  else audio.setScene(live?'paused':'home');
});

function frame(now:number){
  const elapsed=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(elapsed>.25&&(ui.currentView==='play'||ui.currentView==='countdown'))pause();
  const dt=Math.min(.1,elapsed);
  if(ui.currentView==='countdown'){
    remaining-=dt;
    const count=Math.max(1,Math.ceil(remaining));
    if(count!==lastCount){lastCount=count;ui.show('countdown',{count});audio.play('ui');}
    if(remaining<=0)beginPlay();
  }
  if(ui.currentView==='play'){
    accumulator+=dt*(game.state.practice?practiceSpeed:1);
    while(accumulator>=1/60&&ui.currentView==='play'){
      game.update(1/60,input.getVector());accumulator-=1/60;
      deliverEvents();
    }
    ui.updateHUD(game.state);
  }
  const view=ui.currentView;
  if(recordSoundAt&&now>=recordSoundAt){if(view==='result')audio.play('record');recordSoundAt=0;}
  const showRun=live||view==='result';
  const renderMode=view==='play'?'play':view==='result'?'result':showRun?'pause':'home';
  renderer?.render(showRun?game.state:null,renderMode==='pause'?0:dt*(game.state.practice&&showRun?practiceSpeed:1),renderMode);
  requestAnimationFrame(frame);
}
async function boot(){
  ui.show('loading',{progress:0,message:''});
  try{
    const assets=await loadAssets(progress=>ui.show('loading',{progress}));
    renderer=new Renderer(ui.canvas,assets);renderer.setSettings(settings);ready=true;home();
  }catch(error){
    console.error('Asset loading failed',error);
    ui.show('loading',{progress:0,message:'素材加载失败，请确认网络连接后重试。'});
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
