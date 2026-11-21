import {_decorator, Color, Component, EventKeyboard, Game, game, Graphics, input, Input, KeyCode, Label, Node, ResolutionPolicy, resources, screen, sys, Texture2D, UITransform, view} from 'cc';
import {DEBUG} from 'cc/env';
import {ATLAS_IMAGES, type AtlasImage, type AtlasTextures, SpriteAtlas} from '../presentation/sprite-atlas';
import {CourierView} from '../presentation/courier-view';
import {CourierGroundView} from '../presentation/courier-ground-view';
import {EnemyLayer} from '../presentation/enemy-view';
import {MarketBackground} from '../presentation/market-background';
import {PickupsLayer} from '../presentation/pickups-view';
import {ProjectilesView} from '../presentation/projectiles-view';
import {MeleeLayer} from '../presentation/melee-view';
import {ElementalLayer} from '../presentation/elemental-view';
import {MarketStallsView} from '../presentation/market-stalls-view';
import {UltimateView} from '../presentation/ultimate-view';
import {DamageLabelsView} from '../presentation/damage-labels-view';
import {StatusZonesLayer} from '../presentation/status-zones-view';
import {GiantPulseView} from '../presentation/giant-pulse-view';
import {SkillFieldView} from '../presentation/skill-field-view';
import {WeaponImpactView} from '../presentation/weapon-impact-view';
import {DeliveryUseView} from '../presentation/delivery-use-view';
import {FrameQuality} from '../presentation/frame-quality';
import {sampleBattleFrame} from '../presentation/battle-frame';
import {CameraShakeModel} from '../presentation/camera-shake-model';
import {GameAudio} from '../audio/game-audio';
import {audioSceneForView} from '../audio/view-audio-scene';
import {CONFIG} from '../domain/core/config';
import {DEFAULT_SETTINGS, RULES_VERSION, ELEMENTAL_KINDS, ULTIMATE_KINDS, SKILL_KINDS, WEAPON_KINDS, WEAPON_NAMES, isEpic, isGuard,
  type EnemyKind, type GameEvent, type GameState, type Settings, type SkillKind, type UltimateKind, type ElementalKind, type WeaponKind} from '../domain/shared/types';
import {eliteArrival} from '../domain/core/waves';
import {WEAPONS} from '../domain/core/weapons';
import {SimulationSession} from '../runtime/simulation-session';
import {LoadProgress} from '../runtime/load-progress';
import {WEB_PERSISTENCE_CANDIDATE} from '../runtime/web-build-policy';
import {BrowserMotionInput} from '../runtime/browser-motion';
import {HapticsSession} from '../runtime/haptics-session';
import {createBrowserHapticsHost} from '../runtime/browser-haptics';
import {SaveStore} from '../runtime/save-store';
import {createCocosStorage} from '../runtime/cocos-storage';
import {GameUi, type ActionPayload, type GameAction, type GameView, type HudState} from '../ui/game-ui';
import {hudFromState} from '../ui/hud-model';
import {TouchJoystick} from '../ui/joystick';
import {openingHint} from '../ui/opening-hint';

const {ccclass} = _decorator;
// The source project always stays memory-only. A separately copied Web build
// can explicitly opt into isolated candidate testing, never via a URL flag.
const ENABLE_EXISTING_SAVE=WEB_PERSISTENCE_CANDIDATE&&!DEBUG&&sys.isBrowser;

/** Incomplete developer prototype: no production storage, audio or full rendering. */
@ccclass('AtlasSmoke')
export class AtlasSmoke extends Component {
  private atlas:SpriteAtlas|null=null;
  private world:Node|null=null;
  private courier:CourierView|null=null;
  private courierGround:CourierGroundView|null=null;
  private enemies:EnemyLayer|null=null;
  private background:MarketBackground|null=null;
  private pickups:PickupsLayer|null=null;
  private projectiles:ProjectilesView|null=null;
  private melee:MeleeLayer|null=null;
  private elemental:ElementalLayer|null=null;
  private stalls:MarketStallsView|null=null;
  private ultimate:UltimateView|null=null;
  private damage:DamageLabelsView|null=null;
  private statusZones:StatusZonesLayer|null=null;
  private giantPulse:GiantPulseView|null=null;
  private skillFields:SkillFieldView|null=null;
  private weaponImpacts:WeaponImpactView|null=null;
  private deliveryUse:DeliveryUseView|null=null;
  private audio:GameAudio|null=null;
  private joystick:TouchJoystick|null=null;
  private motion:BrowserMotionInput|null=null;
  private haptics:HapticsSession|null=null;
  private ui:GameUi|null=null;
  private cancelled=false;
  private hidden=false;
  private initializing=false;
  private worldReady=false;
  private waitingAction:'start'|'practice'|'catalog'|null=null;
  private readonly loadProgress=new LoadProgress();
  private loadError='';
  private inputRequest=0;
  private pendingInput=false;
  private settingsPermissionId:number|null=null;
  private view:GameView='loading';
  private catalogOrigin:GameView='home';
  private settingsOrigin:GameView='home';
  private settings:Settings={...DEFAULT_SETTINGS};
  private practiceSpeed=1;
  private readonly held=new Map<KeyCode,number>();
  private keyOrder=0;
  private countdownLeft=0;
  private openingHint:Label|null=null;
  private feedback:Label|null=null;
  private feedbackTime=0;
  private motionPreference:MediaQueryList|null=null;
  private systemReduceMotion=false;
  private readonly frameQuality=new FrameQuality();
  private readonly cameraShake=new CameraShakeModel();
  private readonly storage=ENABLE_EXISTING_SAVE?createCocosStorage():new SaveStore(null);
  private resultRecord=false;
  private resultSaved=false;
  private tutorialSeen=false;
  private recordCueAt=0;
  private showOpeningHint=false;
  private lastOpeningHintText='';
  private readonly session=new SimulationSession(12345,(events,state)=>this.onGameEvents(events,state));
  private onGameEvents(events:GameEvent[],state:GameState):void {
    this.melee?.events(events,state.time);
    this.elemental?.events(events,state.time);
    this.damage?.events(events);
    this.enemies?.events(events,state.time);
    this.weaponImpacts?.events(events,state.time);
    this.deliveryUse?.events(events);
    this.cameraShake.events(events);
    if(this.view==='play'&&this.settings.haptics&&!this.effectiveSettings().reduceMotion)this.haptics?.play(events);
    for(const event of events){
      if(event.type==='market')continue;
      this.audio?.play(event);
      if(event.type==='ultimateBeat'&&event.kind==='berry'&&!this.effectiveSettings().reduceMotion)this.session.hold(.03);
      if(event.type==='notice')this.notice(event.message);
      else if(event.type==='weapon')this.notice(`已换装 · ${WEAPON_NAMES[event.kind]}`);
    }
    // The receipt follows other sound cues, matching the original event order.
    for(const event of events){
      if(event.type!=='market')continue;
      this.audio?.play(event);
      if(event.action==='sign'&&event.kind==='frost')this.notice('碎冰箱 · 冲刺撞碎带裂纹的冻怪',3.5);
      else if(event.action==='sign'&&event.kind==='brine')this.notice('泡菜箱 · 让回旋餐盘飞过毒雾',3.5);
    }
  }
  private banner:Label|null=null;
  private rotateOrigin:GameView='home';
  private viewportPolicy='';

  /** A quiet night-market scene while the painted street textures download. */
  private createHomeBackdrop(parent:Node):Node {
    const node=new Node('Home backdrop placeholder');node.layer=parent.layer;
    node.addComponent(UITransform).setContentSize(1280,720);parent.addChild(node);
    const g=node.addComponent(Graphics);
    g.fillColor=new Color(35,33,49,255);g.rect(-4096,-4096,8192,8192);g.fill();
    g.fillColor=new Color(57,49,61,255);g.rect(-4096,-110,8192,330);g.fill();
    g.fillColor=new Color(72,58,68,255);
    for(const x of [-520,-190,150,490]){g.rect(x-135,-82,270,250);}
    g.fill();
    g.fillColor=new Color(128,87,75,255);
    for(const x of [-520,-190,150,490]){g.rect(x-145,130,290,18);g.rect(x-110,-65,220,15);}
    g.fill();
    g.fillColor=new Color(91,81,84,255);g.rect(-4096,-4096,8192,3981);g.fill();
    g.fillColor=new Color(144,113,91,110);g.rect(-4096,-122,8192,7);g.fill();
    g.strokeColor=new Color(174,135,106,255);g.lineWidth=3;
    g.moveTo(-4096,255);g.lineTo(4096,255);g.stroke();
    for(const x of [-515,-285,-55,175,405,635]){
      g.strokeColor=new Color(174,135,106,255);g.lineWidth=2;g.moveTo(x,255);g.lineTo(x,230);g.stroke();
      g.fillColor=new Color(210,91,62,255);g.ellipse(x,209,18,23);g.fill();
      g.fillColor=new Color(244,185,107,190);g.rect(x-10,206,20,6);g.fill();
    }
    return node;
  }

  onLoad():void {view.setDesignResolutionSize(1280,720,ResolutionPolicy.SHOW_ALL);view.resizeWithBrowserSize(true);}

  onEnable():void {
    input.on(Input.EventType.KEY_DOWN,this.onKeyDown,this);
    input.on(Input.EventType.KEY_UP,this.onKeyUp,this);
    game.on(Game.EVENT_HIDE,this.onHide,this);
    game.on(Game.EVENT_SHOW,this.onShow,this);
    screen.on('window-resize',this.onResize,this);
    if(typeof window!=='undefined')window.addEventListener('blur',this.onBlur);
    if(sys.isBrowser&&typeof window!=='undefined'&&typeof window.matchMedia==='function'){
      this.motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReduceMotion=this.motionPreference.matches;
      if(this.motionPreference.addEventListener)this.motionPreference.addEventListener('change',this.onMotionPreference);
      else this.motionPreference.addListener(this.onMotionPreference);
    }
  }
  onDisable():void {
    input.off(Input.EventType.KEY_DOWN,this.onKeyDown,this);
    input.off(Input.EventType.KEY_UP,this.onKeyUp,this);
    game.off(Game.EVENT_HIDE,this.onHide,this);
    game.off(Game.EVENT_SHOW,this.onShow,this);
    screen.off('window-resize',this.onResize,this);
    if(typeof window!=='undefined')window.removeEventListener('blur',this.onBlur);
    if(this.motionPreference){
      if(this.motionPreference.removeEventListener)this.motionPreference.removeEventListener('change',this.onMotionPreference);
      else this.motionPreference.removeListener(this.onMotionPreference);
      this.motionPreference=null;
    }
    this.waitingAction=null;this.cancelPendingInput();this.recordCueAt=0;this.held.clear();this.joystick?.setEnabled(false);this.motion?.setEnabled(false);
    this.session.pause();this.audio?.setScene('paused');this.haptics?.stop();
  }

  async start():Promise<void> {
    if(this.initializing||this.cancelled)return;
    this.initializing=true;this.loadError='';
    const saved=this.storage.load();this.settings={...saved.settings};this.tutorialSeen=saved.tutorialSeen;
    if(!this.ui){
      this.ui=new GameUi(this.node,(action,payload)=>this.action(action,payload));
      if(sys.isBrowser&&typeof document!=='undefined')this.ui.enableWebAccessibility(document,()=>this.handleEscape());
    }
    if(!this.banner){
      const banner=new Node('DevelopmentPrototypeBanner');banner.layer=this.node.layer;this.node.addChild(banner);
      banner.addComponent(UITransform).setContentSize(1180,32);banner.setPosition(0,338);
      this.banner=banner.addComponent(Label);this.banner.fontSize=16;this.banner.lineHeight=21;this.banner.color=Color.WHITE;
      this.banner.string='DEVELOPMENT PROTOTYPE — INCOMPLETE GAME — NOT FOR RELEASE';
      const hint=new Node('OpeningHint');hint.layer=this.node.layer;this.node.addChild(hint);
      hint.addComponent(UITransform).setContentSize(950,45);hint.setPosition(0,-220);
      this.openingHint=hint.addComponent(Label);this.openingHint.fontSize=20;this.openingHint.lineHeight=26;
      this.openingHint.color=Color.WHITE;this.openingHint.enableOutline=true;this.openingHint.outlineColor=new Color(50,35,28,255);this.openingHint.outlineWidth=3;
      this.openingHint.string='';hint.active=false;
      const message=new Node('PrototypeMessage');message.layer=this.node.layer;this.node.addChild(message);
      message.addComponent(UITransform).setContentSize(1100,40);message.setPosition(0,285);
      this.feedback=message.addComponent(Label);this.feedback.fontSize=20;this.feedback.lineHeight=26;
      this.feedback.color=Color.WHITE;this.feedback.enableOutline=true;this.feedback.outlineColor=new Color(50,35,28,255);this.feedback.outlineWidth=3;message.active=false;
    }
    const ui=this.ui;
    if(!this.audio){
      this.audio=new GameAudio(this.node,message=>console.warn(`[AtlasSmoke] ${message}`));
      this.audio.setSettings(this.settings);
      if(sys.isBrowser)this.haptics=new HapticsSession(createBrowserHapticsHost());
      if(sys.isBrowser&&typeof window!=='undefined'){
        this.motion=new BrowserMotionInput(()=>{
          if(this.view==='play'&&this.settings.mode==='tilt'){
            this.session.pause();this.show('pause');this.notice('重力感应中断，已暂停。请重新校准或改用摇杆。');
          }
        });
        this.motion.setSettings(this.settings);
      }
    }
    const atlasEntries=Object.entries(ATLAS_IMAGES);
    const attempt=this.loadProgress.begin(atlasEntries.length+4);
    let homeShown=false;
    this.show('loading');ui.updateLoadingProgress(0);this.onResize();
    // The Web template gives immediate feedback while the engine initializes.
    // Once the game can display its own loading state, hand over to that UI.
    if(sys.isBrowser&&typeof document!=='undefined')document.getElementById('web-boot-status')?.remove();
    try {
      const track=<T>(promise:Promise<T>):Promise<T>=>promise.then(value=>{
        const progress=this.loadProgress.advance(attempt);
        if(progress!==null&&this.ui===ui&&!this.cancelled)ui.updateLoadingProgress(progress);
        return value;
      });
      const loadTexture=(file:string)=>{
        const path=`art/${file}/texture`;
        return track(new Promise<Texture2D>((resolve,reject)=>{
          resources.load(path,Texture2D,(error,asset)=>error?reject(error):resolve(asset));
        }));
      };
      const artworkReady=track(ui.ready);
      // Attach a rejection handler immediately: backgrounds can fail while the
      // initial home artwork is still loading.
      const backgroundResult=Promise.all([loadTexture('clay-night-market'),loadTexture('clay-riverside-market')]).then(
        backgrounds=>({ok:true as const,backgrounds}),error=>({ok:false as const,error}));
      // Surface a known background failure even if a home image is still hung.
      // On success the gate stays pending and does not delay homeReady.
      const backgroundFailure=backgroundResult.then(result=>{
        if(result.ok===false)throw result.error;
        return new Promise<void>(()=>{});
      });
      await Promise.race([ui.homeReady,backgroundFailure]);
      if(this.cancelled||!this.loadProgress.isCurrent(attempt))return;
      const world=this.world=new Node('Battle world');world.layer=this.node.layer;world.addComponent(UITransform);this.node.addChild(world);
      const placeholder=this.createHomeBackdrop(world);homeShown=true;
      ui.node.setSiblingIndex(this.node.children.length-1);
      this.banner?.node.setSiblingIndex(this.node.children.length-1);
      this.openingHint?.node.setSiblingIndex(this.node.children.length-1);
      this.feedback?.node.setSiblingIndex(this.node.children.length-1);
      if(this.view==='rotate')this.rotateOrigin='home';else this.show('home');
      this.onResize();this.render(0);
      const backgroundReady=backgroundResult.then(result=>{
        if(result.ok===false)throw result.error;
        if(this.cancelled||!this.loadProgress.isCurrent(attempt)||this.world!==world||!world.isValid)return;
        this.background=new MarketBackground(world,[result.backgrounds[0],result.backgrounds[1]]);
        this.background.node.setSiblingIndex(0);
        const visible=view.getVisibleSize();
        this.background.update(this.session.state,visible.width,visible.height,this.effectiveSettings().reduceMotion);
        placeholder.destroy();
      });
      const [entries,ultimateTexture]=await Promise.all([
        Promise.all(atlasEntries.map(async ([key,file])=>[key,await loadTexture(file)] as [AtlasImage,Texture2D])),
        loadTexture('clay-ultimate-fx'),artworkReady,backgroundReady,
      ]);
      if(this.cancelled||!this.loadProgress.isCurrent(attempt))return;
      this.atlas=new SpriteAtlas(Object.fromEntries(entries) as AtlasTextures);
      this.skillFields=new SkillFieldView(world,this.atlas);
      this.statusZones=new StatusZonesLayer(world,this.atlas);
      this.elemental=new ElementalLayer(world,this.atlas);
      this.ultimate=new UltimateView(world,world,this.atlas,ultimateTexture);
      this.stalls=new MarketStallsView(world,this.atlas);
      this.pickups=new PickupsLayer(world,this.atlas);
      this.melee=new MeleeLayer(world);
      this.enemies=new EnemyLayer(world,this.atlas);
      this.pickups.floatingNode.setSiblingIndex(world.children.length-1);
      this.projectiles=new ProjectilesView(world,this.atlas);
      this.statusZones.backNode.setSiblingIndex(world.children.length-1);
      this.courier=new CourierView(world,this.atlas);
      this.courierGround=new CourierGroundView(world,this.courier.node);
      this.courierGround.node.setSiblingIndex(this.courier.node.getSiblingIndex());
      this.deliveryUse=new DeliveryUseView(world,this.atlas);
      // Match the web renderer: weapon shots follow the courier/hand pickup,
      // while foreground effects and attack warnings remain above them.
      this.projectiles.node.setSiblingIndex(world.children.length-1);
      this.statusZones.frontNode.setSiblingIndex(world.children.length-1);
      this.elemental.foregroundNode.setSiblingIndex(world.children.length-1);
      this.ultimate.airNode.setSiblingIndex(world.children.length-1);
      this.melee.effectNode.setSiblingIndex(world.children.length-1);
      this.giantPulse=new GiantPulseView(world);
      this.weaponImpacts=new WeaponImpactView(world);
      this.damage=new DamageLabelsView(world,this.atlas);
      this.skillFields.outlineNode.setSiblingIndex(world.children.length-1);
      this.enemies.warningNode.setSiblingIndex(world.children.length-1);
      this.projectiles.enemyShotNode.setSiblingIndex(world.children.length-1);
      void this.audio?.preload().then(ok=>console.info(`[AtlasSmoke] audio preload=${ok}`));
      this.joystick=new TouchJoystick(this.node,value=>{
        console.info(`[AtlasSmoke] joystick x=${value.x.toFixed(2)} y=${value.y.toFixed(2)} playerX=${this.session.state.player.x.toFixed(2)}`);
      });this.joystick.setSettings(this.settings);this.joystick.setEnabled(false);
      ui.node.setSiblingIndex(this.node.children.length-1);
      this.banner?.node.setSiblingIndex(this.node.children.length-1);
      this.openingHint?.node.setSiblingIndex(this.node.children.length-1);
      this.feedback?.node.setSiblingIndex(this.node.children.length-1);
      this.worldReady=true;this.applyViewVisibility(this.view);this.render(0);
      this.loadProgress.invalidate(attempt);
      this.completeWaitingAction();
      console.info('[AtlasSmoke] DEVELOPMENT PROTOTYPE: GameUi and real simulation ready; gameplay presentation incomplete.');
    }catch(error){
      if(this.cancelled||!this.loadProgress.invalidate(attempt))return;
      console.error('[AtlasSmoke] Failed to load or render atlas:',error);
      this.loadError='资源加载失败，请检查网络后重试。';
      this.waitingAction=null;
      if(!homeShown){this.destroyWorld();if(this.view!=='rotate')this.show('loading');else this.rotateOrigin='loading';}
      else if(this.view==='loading')this.show('loading');
      else if(this.view==='rotate'&&this.rotateOrigin==='loading')this.rotateOrigin='loading';
      else this.notice('部分资源加载失败，开始挑战时可重试。',5);
    }finally{this.initializing=false;}
  }

  update(dt:number):void {
    if(this.feedback&&this.feedbackTime>0){this.feedbackTime-=Math.min(.1,Math.max(0,dt));if(this.feedbackTime<=0)this.feedback.node.active=false;}
    if(!this.courier||!this.ui)return;
    this.frameQuality.sample(dt,this.view==='play'&&this.settings.quality==='standard');
    const running=this.session.isRunning;
    if(this.view==='countdown'){
      const elapsed=!Number.isFinite(dt)||dt<0||dt>.25?0:Math.min(.1,dt);
      this.countdownLeft-=elapsed;
      if(this.countdownLeft<=0&&!this.hidden&&this.session.resume())this.show('play');
    }else if(this.view==='play')this.session.update(dt,this.vector(),this.practiceSpeed);
    if(this.view==='play'&&!this.session.isRunning){
      const state=this.session.state;
      if(state.ended){if(state.revivesUsed===0&&!state.practice)this.show('revive');else this.finish();}
      else if(state.market.closing==='choice')this.show('closing');
    }
    this.render(running&&this.session.isRunning?dt:0);
    if(this.view==='play')this.ui.updateHud(this.hud());
    if(this.openingHint){
      const s=this.session.state;if(s.time>=3||s.kills>0)this.showOpeningHint=false;
      const visible=this.view==='play'&&this.showOpeningHint;this.openingHint.node.active=visible;
      if(visible){
        // Permission fallback has already updated settings before play begins.
        const text=openingHint(this.settings.mode,this.hasCoarsePointer());
        if(this.openingHint.string!==text)this.openingHint.string=text;
        if(this.lastOpeningHintText!==text){this.lastOpeningHintText=text;this.ui.announce(text);}
      }else this.lastOpeningHintText='';
    }
    if(this.recordCueAt>0&&Date.now()>=this.recordCueAt){
      this.recordCueAt=0;if(this.view==='result'&&!this.hidden)this.audio?.play('record');
    }
  }

  private hasCoarsePointer():boolean {
    if(sys.isBrowser&&typeof window!=='undefined'&&typeof window.matchMedia==='function'){
      try{return window.matchMedia('(pointer: coarse)').matches;}catch{/* Fall back to the engine platform classification. */}
    }
    return sys.isMobile;
  }

  private hud():HudState {
    return hudFromState(this.session.state,this.practiceSpeed);
  }

  private show(view:GameView):void {
    if(view!=='result')this.recordCueAt=0;
    const previous=this.view;
    this.cancelPendingInput();
    this.view=view;this.held.clear();
    if(view!=='play'||!this.settings.haptics||this.effectiveSettings().reduceMotion)this.haptics?.stop();
    this.applyViewVisibility(view);
    this.joystick?.setEnabled(view==='play'&&!this.hidden&&this.settings.mode==='joystick');
    this.motion?.setEnabled(view==='play'&&!this.hidden&&this.settings.mode==='tilt');
    this.audio?.setScene(this.hidden?'paused':audioSceneForView(view,this.settingsOrigin,this.catalogOrigin));
    this.ui?.show(view,{hud:this.hud(),settings:this.settings,systemReduceMotion:this.systemReduceMotion,best:this.storage.data.best,practiceAvailable:DEBUG,message:view==='loading'?this.loadError:'',
      labSpeed:this.practiceSpeed,isRecord:this.resultRecord,saved:this.resultSaved,hapticsAvailable:this.haptics?.available??false});
    if(view==='settings'&&previous==='rotate'){
      const preview=this.ui?.getSettingsPreview();if(preview)this.audio?.setSettings(preview);
    }
    console.info(`[AtlasSmoke] view=${view}`);
  }

  private applyViewVisibility(view:GameView):void {
    if(this.courier)this.courier.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.courierGround)this.courierGround.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.enemies)this.enemies.node.active=this.enemies.warningNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.pickups){this.pickups.groundNode.active=this.pickups.floatingNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);}
    if(this.projectiles)this.projectiles.node.active=this.projectiles.enemyShotNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.melee)this.melee.waveNode.active=this.melee.effectNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.damage)this.damage.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.statusZones)this.statusZones.groundNode.active=this.statusZones.backNode.active=this.statusZones.frontNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.giantPulse)this.giantPulse.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.weaponImpacts)this.weaponImpacts.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.deliveryUse)this.deliveryUse.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.skillFields)this.skillFields.groundNode.active=this.skillFields.outlineNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.elemental)this.elemental.groundNode.active=this.elemental.foregroundNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.stalls)this.stalls.node.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
    if(this.ultimate)this.ultimate.groundNode.active=this.ultimate.airNode.active=!['home','tutorial','catalog','settings','result','loading'].includes(view);
  }

  /** Wait without starting the simulation or opening a partially loaded catalog. */
  private waitForWorld(action:'start'|'practice'|'catalog'):void {
    if(this.hidden)return;
    if(this.worldReady){this.runPreparedAction(action);return;}
    this.waitingAction=this.loadError?null:action;
    this.show('loading');
  }

  private completeWaitingAction():void {
    if(!this.worldReady||this.hidden||this.view!=='loading')return;
    const action=this.waitingAction;this.waitingAction=null;
    if(action)this.runPreparedAction(action);else this.show('home');
  }

  private runPreparedAction(action:'start'|'practice'|'catalog'):void {
    if(action==='catalog'){this.session.pause();this.show('catalog');return;}
    if(action==='practice'){this.startPractice();return;}
    this.practiceSpeed=1;this.session.start(undefined,false);this.resetVisuals();this.show('play');this.audio?.play('start');
    if(!this.tutorialSeen){this.tutorialSeen=true;this.storage.setTutorialSeen();this.showOpeningHint=true;}
  }

  private action(action:GameAction,payload?:ActionPayload):void {
    this.audio?.unlock();this.audio?.play('ui');
    switch(action){
      case 'retry':
        if(this.view==='loading'){this.waitingAction=null;this.worldReady=false;this.destroyWorld();this.ui?.destroy();this.ui=null;void this.start();break;}
        if(DEBUG&&this.session.state.practice){const weapon=this.session.state.weapon.kind;this.prepareInput(()=>this.startPractice(weapon));break;}
        // A normal retry starts a fresh randomly seeded run.
      case 'start':
        if(this.hidden)return;
        this.prepareInput(()=>this.waitForWorld('start'));break;
      case 'practice':
        if(!DEBUG||this.hidden)return;
        this.prepareInput(()=>this.waitForWorld('practice'));break;
      case 'lab':
        if(DEBUG&&this.session.state.practice&&this.view==='play'){this.session.pause();this.show('lab');}break;
      case 'close-lab':if(DEBUG&&this.session.state.practice)this.closeLab();break;
      case 'choose-weapon':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice&&typeof payload==='string'&&WEAPON_KINDS.includes(payload as WeaponKind)){
          this.session.game.setWeapon(payload as WeaponKind);this.closeLab(()=>this.flushEvents());
        }break;
      case 'trigger-skill':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice&&typeof payload==='string'&&SKILL_KINDS.includes(payload as SkillKind)){
          this.session.game.triggerSkill(payload as SkillKind);this.closeLab(()=>this.flushEvents());
        }break;
      case 'spawn':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice&&payload&&typeof payload==='object'&&'kind' in payload){
          const {kind,group}=payload as {kind:EnemyKind;group:boolean};this.spawnPractice(kind,group);
        }break;
      case 'demo':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice&&typeof payload==='string')this.practiceDemo(payload);break;
      case 'heal':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice){this.session.game.healPlayer();this.flushEvents();this.ui?.updateHud(this.hud());}break;
      case 'clear':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice){this.session.game.clearArena();this.resetVisuals(false);this.flushEvents();this.ui?.updateHud(this.hud());}break;
      case 'reset-lab':
        if(DEBUG&&this.view==='lab'&&this.session.state.practice){const weapon=this.session.state.weapon.kind;this.session.game.reset(12345,true);this.session.game.setWeapon(weapon);this.resetVisuals();this.flushEvents();this.ui?.updateHud(this.hud());}break;
      case 'set-speed':if(DEBUG&&this.view==='lab'&&this.session.state.practice)this.practiceSpeed=payload===.5?.5:1;break;
      case 'dash':if(this.view==='play')console.info(`[AtlasSmoke] dash accepted=${this.session.dash(this.vector())}`);break;
      case 'pause':if(this.view==='play'||this.view==='countdown'){this.session.pause();this.countdownLeft=0;this.show('pause');}break;
      case 'resume':
        if(!this.hidden)this.prepareInput(()=>{if(this.session.state.practice){if(this.session.resume())this.show('play');}else this.beginCountdown();});break;
      case 'home':
        if(['play','pause'].includes(this.view)){this.session.pause();this.show('confirm');}
        else this.show('home');break;
      case 'abandon':this.session.pause();this.show('home');break;
      case 'tutorial':this.show('tutorial');break;
      case 'catalog':this.catalogOrigin=this.view;this.waitForWorld('catalog');break;
      case 'close-catalog':this.show(this.catalogOrigin==='play'?'pause':this.catalogOrigin);break;
      case 'settings':this.settingsOrigin=this.view;this.session.pause();this.show('settings');break;
      case 'apply-settings':
        if(payload&&typeof payload==='object'&&'mode' in payload){
          if(payload.quality!==this.settings.quality)this.frameQuality.reset();
          this.settings={...payload};
        }
        this.joystick?.setSettings(this.settings);this.motion?.setSettings(this.settings);this.audio?.setSettings(this.settings);
        if(!this.storage.saveSettings(this.settings))this.notice('设置仅在本次打开期间保留。');
        this.show(this.settingsOrigin==='play'?'pause':this.settingsOrigin);break;
      case 'preview-settings':
        if(payload&&typeof payload==='object'&&'mode' in payload)this.audio?.setSettings(payload);break;
      case 'cancel-settings':this.audio?.setSettings(this.settings);this.show(this.settingsOrigin==='play'?'pause':this.settingsOrigin);break;
      case 'request-tilt':if(typeof payload==='number')this.requestTilt(payload);break;
      case 'calibrate':if(!this.motion?.calibrate())this.notice('重力感应数据不可用，请重新授权或使用摇杆。');break;
      case 'fullscreen':
        if(!screen.supportsFullScreen){this.notice('当前设备不支持全屏，请使用浏览器的全屏功能。');break;}
        {const wasFullscreen=screen.fullScreen();
        void (wasFullscreen?screen.exitFullScreen():screen.requestFullScreen()).then(()=>{
          if(!wasFullscreen&&!screen.fullScreen())this.notice('若需要全屏，请使用浏览器的全屏功能。');
        }).catch(()=>this.notice('全屏不可用，请使用浏览器的全屏功能。'));}break;
      case 'revive':
        if(!this.hidden&&this.view==='revive')this.prepareInput(()=>{if(this.session.game.revive())this.beginCountdown();});break;
      case 'end-run':if(this.view==='revive')this.finish();break;
      case 'settle':case 'night':
        if(this.view!=='closing')break;
        if(action==='settle'){if(this.session.game.resolveClosing('settle'))this.finish();}
        else if(!this.hidden)this.prepareInput(()=>{
          if(this.session.game.resolveClosing('night')&&this.session.resume())this.show('play');
        });break;
      default:console.info(`[AtlasSmoke] Unsupported prototype action: ${action}`);
    }
  }

  private notice(message:string,duration=3):void {
    if(!this.feedback)return;
    this.feedback.string=message;this.feedback.node.active=true;this.feedbackTime=duration;this.ui?.announce(message);
  }

  private effectiveSettings():Settings {
    const reduceMotion=this.systemReduceMotion||this.settings.reduceMotion;
    const quality=this.frameQuality.simplifyEffects?'simple':this.settings.quality;
    return reduceMotion!==this.settings.reduceMotion||quality!==this.settings.quality?{...this.settings,reduceMotion,quality}:this.settings;
  }

  private onMotionPreference=(event:MediaQueryListEvent):void=>{
    this.systemReduceMotion=event.matches;
    if(event.matches)this.haptics?.stop();
    if(this.view==='settings')this.ui?.show('settings',{settings:this.settings,systemReduceMotion:this.systemReduceMotion,hapticsAvailable:this.haptics?.available??false});
  };

  private cancelPendingInput():void {
    this.inputRequest++;this.pendingInput=false;
    if(this.settingsPermissionId!==null){
      const id=this.settingsPermissionId;this.settingsPermissionId=null;
      this.ui?.resolveTiltPermission(id,false);
    }
  }

  private requestTilt(id:number):void {
    // A new UI request supersedes an earlier one that the user cancelled.
    const token=++this.inputRequest;this.settingsPermissionId=id;
    // request() must be called synchronously within the button gesture.
    const request=this.motion?.request()??Promise.resolve(false);
    void request.then(allowed=>{
      if(token!==this.inputRequest||this.hidden||this.view!=='settings')return;
      this.settingsPermissionId=null;
      const ready=allowed&&!!this.motion?.calibrate();
      this.ui?.resolveTiltPermission(id,ready);
      if(!ready)this.notice('重力感应不可用，请使用摇杆。');
    });
  }

  private prepareInput(onReady:()=>void):void {
    if(this.pendingInput||this.hidden)return;
    if(this.settings.mode!=='tilt'){onReady();return;}
    const token=++this.inputRequest;this.pendingInput=true;
    // Keep the permission request in the original user gesture.
    const request=this.motion?.request()??Promise.resolve(false);
    void request.then(allowed=>{
      if(token!==this.inputRequest||this.hidden)return;
      this.pendingInput=false;
      if(!allowed||!this.motion?.calibrate()){
        this.settings={...this.settings,mode:'joystick'};
        this.joystick?.setSettings(this.settings);this.motion?.setSettings(this.settings);
        this.storage.saveSettings(this.settings);
        this.notice('未取得重力感应数据，已切换摇杆。');
      }
      onReady();
    });
  }

  private startPractice(weapon:WeaponKind='tongs'):void {
    if(!DEBUG||this.hidden)return;
    this.practiceSpeed=1;this.session.start(undefined,true);this.session.game.setWeapon(weapon);
    this.session.game.drainEvents();this.session.pause();this.resetVisuals();this.show('lab');
  }
  private beginCountdown():void {this.session.pause();this.countdownLeft=1;this.show('countdown');this.audio?.play('ui');}

  private resetVisuals(resetEnemies=true):void {this.cameraShake.reset();this.frameQuality.reset();if(resetEnemies)this.enemies?.reset();this.courier?.reset();this.courierGround?.reset();this.melee?.reset();this.damage?.reset();this.giantPulse?.reset();this.skillFields?.reset();this.weaponImpacts?.reset();this.deliveryUse?.reset();this.statusZones?.reset();this.elemental?.reset();this.ultimate?.reset();}
  private flushEvents():void {this.onGameEvents(this.session.game.drainEvents(),this.session.state);}
  private closeLab(after?:()=>void):void {
    if(!this.hidden)this.prepareInput(()=>{if(this.session.resume()){this.show('play');after?.();}});
  }
  private spawnPractice(kind:EnemyKind,group:boolean):void {
    const state=this.session.state,p=state.player;
    let second:{x:number;y:number}|undefined;
    if(isGuard(kind)){
      const present=state.enemies.filter(e=>e.hp>0&&isGuard(e.kind));
      if(present.length&&(isEpic(kind)||present.some(e=>isEpic(e.kind)))){
        this.notice('史诗首领单独出战，请先击败守关怪或清空场地');return;
      }
      if(present.some(e=>e.kind===kind)||present.length>=CONFIG.waves.maxElites){
        this.notice('场上最多两种精英，每种一只');return;
      }
      if(present.length)second=eliteArrival(state,kind,{random:Math.random});
    }
    const count=group&&!isGuard(kind)?6:1,distance=isEpic(kind)?330:!group&&state.weapon.kind==='lunchbox'?WEAPONS.lunchbox.range:150;
    for(let i=0;i<count;i++){
      const angle=group?-Math.PI/3+i*Math.PI/3:Math.atan2(p.moveDirection.y,p.moveDirection.x);
      this.session.game.spawnEnemy(kind,second??{x:Math.max(110,Math.min(1170,p.x+Math.cos(angle)*distance)),y:Math.max(135,Math.min(610,p.y+Math.sin(angle)*distance))});
    }
    this.closeLab(()=>this.flushEvents());
  }
  private practiceDemo(name:string):void {
    const g=this.session.game;this.practiceSpeed=1;
    if(name==='pickup')g.setupPickupDemo();else if(name==='wave')g.setupWaveDemo();
    else if(name==='marketFood'||name==='marketUpgrade'||name==='marketFinal')g.setupMarketDemo(name);
    else if(name==='giantBun'||ULTIMATE_KINDS.some(k=>k===name)||ELEMENTAL_KINDS.some(k=>k===name))g.setupCombatDemo(name as UltimateKind|ElementalKind|'giantBun');
    else return;
    this.resetVisuals();this.closeLab(()=>this.flushEvents());
  }

  /** The default prototype store is session-only; release persistence is gated above. */
  private finish():void {
    this.session.pause();
    const state=this.session.state,best=this.storage.data.best;
    this.resultRecord=!state.practice&&(!best||state.kills>best.score||(state.kills===best.score&&state.time>best.time));
    this.resultSaved=state.practice?true:this.resultRecord
      ?this.storage.saveBest({score:state.kills,time:state.time,rulesVersion:RULES_VERSION,date:new Date().toISOString()})
      :this.storage.persistenceAvailable;
    // saveBest merges the latest visible record; another tab may have already
    // achieved a better result since this component last read its save.
    if(this.resultRecord){
      const merged=this.storage.data.best;
      this.resultRecord=!!merged&&merged.score===state.kills&&merged.time===state.time;
    }
    this.show('result');
    // Never celebrate a session-only, failed, practice, or superseded save.
    this.recordCueAt=this.resultRecord&&this.resultSaved?Date.now()+900:0;
  }
  private vector():{x:number;y:number} {
    const right=Math.max(this.held.get(KeyCode.KEY_D)??0,this.held.get(KeyCode.ARROW_RIGHT)??0);
    const left=Math.max(this.held.get(KeyCode.KEY_A)??0,this.held.get(KeyCode.ARROW_LEFT)??0);
    const down=Math.max(this.held.get(KeyCode.KEY_S)??0,this.held.get(KeyCode.ARROW_DOWN)??0);
    const up=Math.max(this.held.get(KeyCode.KEY_W)??0,this.held.get(KeyCode.ARROW_UP)??0);
    const x=right===left?0:right>left?1:-1,y=down===up?0:down>up?1:-1;
    if(x||y){const length=Math.hypot(x,y);return {x:x/length,y:y/length};}
    if(this.settings.mode==='tilt')return this.motion?.getVector()??{x:0,y:0};
    return this.joystick?.getVector()??{x:0,y:0};
  }
  private onKeyDown(event:EventKeyboard):void {
    if(!this.ui||this.held.has(event.keyCode))return;
    this.audio?.unlock();
    this.held.set(event.keyCode,++this.keyOrder);
    if(event.keyCode===KeyCode.SPACE||event.keyCode===KeyCode.SHIFT_LEFT||event.keyCode===KeyCode.SHIFT_RIGHT)this.action('dash');
    else if(event.keyCode===KeyCode.KEY_P){
      if(this.view==='play'||this.view==='countdown')this.action('pause');else if(this.view==='pause')this.action('resume');
    }else if(event.keyCode===KeyCode.ESCAPE)this.handleEscape();
  }
  private handleEscape():void {
    if(this.view==='play'||this.view==='countdown')this.action('pause');
    else if(this.view==='pause')this.action('resume');
    else if(this.view==='confirm')this.show('pause');
    else if(this.view==='settings')this.ui?.escapeSettings();
    else if(this.view==='lab')this.action('close-lab');
    else if(this.view==='catalog')this.action('close-catalog');
    else if(this.view==='tutorial'||this.view==='result')this.action('home');
  }
  private onKeyUp(event:EventKeyboard):void {this.held.delete(event.keyCode);}
  private onHide():void {
    this.hidden=true;this.waitingAction=null;this.cancelPendingInput();this.held.clear();this.joystick?.setEnabled(false);this.motion?.setEnabled(false);this.session.pause();this.audio?.setScene('paused');
    if(this.view==='play'||this.view==='countdown'){this.countdownLeft=0;this.show('pause');}
    console.info(`[AtlasSmoke] hidden; paused at ${this.session.state.time.toFixed(3)}`);
  }
  private onShow():void {
    this.hidden=false;this.held.clear();
    // Backgrounding pauses every scene; restore only the scene appropriate to
    // the current overlay's origin. Interrupted gameplay stays paused.
    this.audio?.setScene(audioSceneForView(this.view,this.settingsOrigin,this.catalogOrigin));
    this.completeWaitingAction();
    console.info('[AtlasSmoke] shown; interrupted play remains paused');
  }
  private onBlur=():void=>{
    this.waitingAction=null;this.cancelPendingInput();this.held.clear();this.joystick?.setEnabled(false);this.motion?.setEnabled(false);
    if(this.view==='play'||this.view==='countdown'){this.session.pause();this.countdownLeft=0;this.audio?.setScene('paused');this.show('pause');}
  };
  private onResize():void {
    if(!this.ui)return;
    const win=screen.windowSize,portrait=win.height>win.width;
    const policy=portrait?'portrait':win.width/win.height>=1280/720?'wide':'tall';
    if(policy!==this.viewportPolicy){
      this.viewportPolicy=policy;
      if(portrait)view.setDesignResolutionSize(720,1280,ResolutionPolicy.SHOW_ALL);
      else view.setDesignResolutionSize(1280,720,policy==='wide'?ResolutionPolicy.FIXED_HEIGHT:ResolutionPolicy.FIXED_WIDTH);
    }
    const size=view.getVisibleSize(),safe=sys.getSafeAreaRect(false);
    const left=(size.width-1280)/2,bottom=(size.height-720)/2;
    this.ui.setSafeInsets({left:Math.max(0,safe.x-left),right:Math.max(0,left+1280-safe.x-safe.width),
      bottom:Math.max(0,safe.y-bottom),top:Math.max(0,bottom+720-safe.y-safe.height)});
    if(portrait&&this.view!=='rotate'){
      // Rotation invalidates a pending gesture and any tilt calibration. The
      // user can start again after returning to landscape.
      this.waitingAction=null;
      this.rotateOrigin=this.view==='play'||this.view==='countdown'?'pause':this.view;
      if(this.view==='settings')this.audio?.setSettings(this.settings);
      this.countdownLeft=0;this.session.pause();this.show('rotate');
    }else if(!portrait&&this.view==='rotate'){this.show(this.rotateOrigin);this.completeWaitingAction();}
  }
  private render(dt:number):void {
    const state=this.session.state,alpha=this.session.interpolation;
    const s=this.view==='play'&&alpha!==null?sampleBattleFrame(state,alpha):state;
    const visible=view.getVisibleSize();
    const settings=this.effectiveSettings();
    const mode=this.view==='play'?'play':this.view==='result'?'result':this.view==='home'?'home':'pause';
    const {dx,dy,overscan}=this.cameraShake.frame(s,dt,mode,settings,visible.width,visible.height);
    this.world?.setPosition(dx,-dy);this.world?.setScale(overscan,overscan,1);
    this.background?.update(s,visible.width,visible.height,settings.reduceMotion);
    this.skillFields?.update(s,settings);
    this.elemental?.update(s,settings);this.stalls?.update(s,settings);
    this.statusZones?.update(s,settings);
    this.ultimate?.update(s,settings,visible.width,visible.height);
    this.enemies?.update(s,settings);
    this.pickups?.update(s,settings);
    this.courier?.update({player:s.player,weapon:s.weapon,time:s.time,dt,reduceMotion:settings.reduceMotion,
      dead:s.ended,trayInFlight:s.weapon.kind==='tray'&&s.projectiles.some(q=>q.kind==='tray'),playerSpeed:CONFIG.player.speed,
      skillUseAge:this.deliveryUse?.latestAge(s.time)});
    this.courierGround?.update(s,settings,this.view==='play'&&dt>0);
    this.melee?.update(s,settings,{release:this.courier?.launch,strike:this.courier?.strike});
    if(this.courier?.bagPoint&&this.courier.supplyHand)this.deliveryUse?.update(s,settings,this.courier.bagPoint,this.courier.supplyHand,this.courier.bagPose,this.courier.lidOpen);
    this.projectiles?.update(s,settings,this.courier?.launch??null,this.courier?.trayCatch??this.courier?.supplyHand??null);
    this.damage?.update(dt,s,settings);
    this.weaponImpacts?.update(s,settings);
    this.giantPulse?.update(s);
  }
  private destroyWorld():void {
    this.worldReady=false;
    this.haptics?.dispose();this.haptics=null;
    this.motion?.dispose();this.motion=null;
    this.audio?.dispose();this.audio=null;this.joystick?.destroy();this.joystick=null;
    this.skillFields?.destroy();this.skillFields=null;
    this.deliveryUse?.destroy();this.deliveryUse=null;
    this.weaponImpacts?.destroy();this.weaponImpacts=null;
    this.giantPulse?.destroy();this.giantPulse=null;
    this.damage?.destroy();this.damage=null;this.courierGround?.destroy();this.courierGround=null;this.courier?.destroy();this.courier=null;
    this.projectiles?.destroy();this.projectiles=null;this.enemies?.destroy();this.enemies=null;
    this.melee?.destroy();this.melee=null;this.pickups?.destroy();this.pickups=null;
    this.stalls?.destroy();this.stalls=null;this.ultimate?.destroy();this.ultimate=null;
    this.elemental?.destroy();this.elemental=null;this.statusZones?.destroy();this.statusZones=null;
    this.background?.destroy();this.background=null;this.atlas?.dispose();this.atlas=null;
    this.world?.destroy();this.world=null;
  }
  onDestroy():void {this.cancelled=true;this.loadProgress.cancel();this.cancelPendingInput();this.destroyWorld();this.ui?.destroy();}
}
