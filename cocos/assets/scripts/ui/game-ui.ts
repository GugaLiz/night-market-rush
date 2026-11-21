import {BlockInputEvents, Button, Color, EventMouse, Graphics, Label, Mask, Node, Rect, resources, screen, ScrollView, Size, Slider, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec2, view} from 'cc';
import {DEFAULT_SETTINGS, ENEMY_NAMES, EPIC_KINDS, ELITE_KINDS, ORDINARY_KINDS, SKILL_KINDS, SKILL_NAMES, WEAPON_KINDS, WEAPON_NAMES, isGuard, type EnemyKind, type Settings, type SkillKind, type WeaponKind} from '../domain/shared/types';
import {CONFIG} from '../domain/core/config';
import {CATALOG, ENEMY_GROUPS, ENEMY_GUIDE, SKILL_GUIDE, WEAPON_GUIDE, type EnemyGroup} from './catalog';
import {clayFrames} from '../presentation/clay-frames';
import {createWebAccessibilityBridge,type SemanticControl,type WebAccessibilityBridge} from './web-accessibility';
import {HudCombatFeedback} from './hud-combat-feedback';

/** Migration-stage UI, independent of browser and WeChat APIs. The host owns
 * the game state, transforms viewport/safe-area values to design coordinates,
 * and handles each action. No callback here changes the simulation. */
export type GameView = 'loading'|'home'|'tutorial'|'countdown'|'play'|'pause'|'confirm'|'revive'|'closing'|'result'|'rotate'|'settings'|'catalog'|'lab';
export type GameAction = 'start'|'tutorial'|'settings'|'catalog'|'close-catalog'|'practice'|'lab'|'fullscreen'|'retry'|'pause'|'dash'|'resume'|'home'|'abandon'|'revive'|'end-run'|'settle'|'night'|'preview-settings'|'apply-settings'|'cancel-settings'|'request-tilt'|'calibrate'|'close-lab'|'choose-weapon'|'trigger-skill'|'spawn'|'demo'|'heal'|'clear'|'reset-lab'|'set-speed';

export interface SafeInsets {left:number;right:number;top:number;bottom:number}
export interface HudState {
  kills:number; coins:number; wave:number; time:number;
  health:number; maxHealth:number; weaponName:string; weaponKind?:WeaponKind;
  dashReadyAt:number; dashUntil:number;
  orders?:number; closingSettled?:boolean; practice?:boolean;
  cause?:string; lastDamageAmount?:number; upgradeName?:string; upgradeDetail?:string;
  boss?:{name:string; health:number; maxHealth:number; move?:string}|null;
  waveMessage?:string; stageLabel?:string; combo?:number; comboRemaining?:number;
  statuses?:ReadonlyArray<{kind:string;label:string;seconds:number;active:boolean}>; sprintMultiplier?:number;
  weaponReady?:number;
}
export interface UiData {
  progress?:number; message?:string; countdown?:number;
  best?:{score:number;time:number}|null;
  hud?:HudState; practiceAvailable?:boolean; isRecord?:boolean; saved?:boolean;
  settings?:Settings; systemReduceMotion?:boolean; hapticsAvailable?:boolean;
  labSpeed?:number;
}
export type ActionPayload=Settings|WeaponKind|SkillKind|{kind:EnemyKind;group:boolean}|string|number;
type ActionHandler = (action:GameAction,payload?:ActionPayload)=>void;
interface StatusCard {node:Node;icon:Sprite;label:Label;time:Label;opacity:UIOpacity;iconSize:number}
interface HomeArtSlot {key:string;node:Node;sprite:Sprite;placeholder:Node;height:number}
const INK=new Color(74,43,29,255), CREAM=new Color(255,240,214,255);
const PAPER=new Color(255,243,221,255), PAPER_BORDER=new Color(154,104,73,255);
const ORANGE=new Color(255,151,66,255), TEAL=new Color(194,230,215,255);
const SHADE=new Color(21,26,48,168), DARK=new Color(61,36,31,224);
const WHITE=new Color(255,244,223,255), RED=new Color(216,102,91,255);
const LAB_DEMOS=['pickup','wave','giantBun','vortex','poison','frost','icebox','steamer','express','berry','marketFood','marketUpgrade','marketFinal'] as const;
const LAB_DEMO_LABELS=['取卡清场','连续换波','巨包三连坐','乌金涡锅','毒雾泡菜坛','冰封刨冰机','保冷箱','蒸笼开席','加急三连送','杨梅汽水','热汤与涡锅','配送箱改装','五分钟尾单'] as const;
const clamp=(n:number,low:number,high:number)=>Math.min(high,Math.max(low,n));
const timeText=(seconds:number)=>`${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;

/** Parent should be a centred 1280x720 UI node. Instances are disposed with
 * destroy(); rebuild only on view changes, not every game frame. */
export class GameUi {
  readonly node:Node;
  /** Await before showing the catalog or battle; home uses homeReady instead.
   * Failed artwork loads degrade to text UI without replacing active controls. */
  readonly ready:Promise<void>;
  /** The home screen can display placeholders while its artwork is loading. */
  readonly homeReady:Promise<void>;
  private hudRoot:Node|null=null;
  private modalRoot:Node|null=null;
  private current:GameView='loading';
  private data:UiData={};
  private labels:Record<string,Label>={};
  private healthFill:Graphics|null=null;
  private bossFill:Graphics|null=null;
  private weaponFill:Graphics|null=null;
  private weaponIcon:Sprite|null=null;
  private bossNode:Node|null=null;
  private dashButton:Button|null=null;
  private dashGraphic:Graphics|null=null;
  private lowHealthWarning:Node|null=null;
  private upgradeBadge:Node|null=null;
  private semanticDashState='';
  private rendering=false;
  private readonly combatFeedback=new HudCombatFeedback();
  private statusCards:StatusCard[]=[];
  private comboPanel:Node|null=null;
  private comboFuse:Graphics|null=null;
  private safe:SafeInsets={left:0,right:0,top:0,bottom:0};
  private draft:Settings={...DEFAULT_SETTINGS};
  private original:Settings={...DEFAULT_SETTINGS};
  private settingsTab:'operation'|'sound'|'display'='operation';
  private settingsConfirm:'default'|'cancel'|null=null;
  private catalogTab:keyof typeof CATALOG='weapons';
  private enemyGroup:EnemyGroup='normal';
  private catalogScroll:ScrollView|null=null;
  private catalogScrollKey:string|null=null;
  private readonly catalogOffsets=new Map<string,number>();
  private selectedWeapon:WeaponKind='tongs';
  private selectedSkill:SkillKind='fan';
  private selectedEnemy:EnemyKind='bun';
  private selectedDemo=0;
  private settingsFromBattle=false;
  private tiltPending=false;
  private tiltRequest=0;
  private readonly artwork=new Map<string,SpriteFrame>();
  private homeArtSlots:HomeArtSlot[]=[];
  private disposed=false;
  private homeScene=true;
  private accessibility:WebAccessibilityBridge|null=null;
  private accessibilityDocument:Document|null=null;
  private semanticLastView:GameView|null=null;
  private semanticFocusId:string|null=null;
  private semanticRing:Node|null=null;
  private semanticControls:SemanticControl[]=[];
  private readonly semanticTargets=new Map<string,{node:Node;activate:(value?:boolean|number)=>void}>();
  private announcedBattle='';
  private announcedAt=0;

  constructor(parent:Node,private readonly onAction:ActionHandler) {
    this.node=this.container(parent,'Game UI',1280,720,0,0);
    let homeReady!:()=>void;
    this.homeReady=new Promise<void>(resolve=>{homeReady=resolve;});
    this.ready=this.loadArtwork(homeReady);
  }

  /** Enable only on Web. The host supplies the same Escape policy as game input. */
  enableWebAccessibility(doc:Document,escape:()=>void):void {
    if(this.accessibility)return;
    this.accessibilityDocument=doc;
    this.accessibility=createWebAccessibilityBridge(doc,{
      activate:(id,value)=>this.semanticTargets.get(id)?.activate(value),
      focus:id=>{this.semanticFocusId=id;this.drawSemanticFocus(id);},escape,
    });
  }
  /** Host messages such as unavailable sensors and failed saves. */
  announce(message:string):void {this.accessibility?.announce(message);}
  private semanticControl(control:SemanticControl,node:Node,activate:(value?:boolean|number)=>void):void {
    if(!this.accessibility)return;
    this.semanticControls.push(control);this.semanticTargets.set(control.id,{node,activate});
  }
  private drawSemanticFocus(id:string|null):void {
    if(this.semanticRing?.isValid){this.semanticRing.removeFromParent();this.semanticRing.destroy();}
    this.semanticRing=null;
    const target=id?this.semanticTargets.get(id)?.node:null,transform=target?.getComponent(UITransform);
    if(!target?.isValid||!transform)return;
    const ring=this.container(target,'Semantic focus ring',transform.width+8,transform.height+8,0,0);
    const graphics=ring.addComponent(Graphics);graphics.lineWidth=4;graphics.strokeColor=new Color(12,104,98,255);
    graphics.roundRect(-transform.width/2-4,-transform.height/2-4,transform.width+8,transform.height+8,10);graphics.stroke();this.semanticRing=ring;
  }
  private semanticContent():string[] {
    const hud=this.data.hud;
    switch(this.current){
      case 'home':return [this.data.best?`本地最佳击败 ${this.data.best.score} 只，存活 ${timeText(this.data.best.time)}`:'本地最佳击败：等待你的第一单'];
      case 'loading':return [this.data.message??`加载 ${Math.round(clamp(this.data.progress??0,0,1)*100)}%`];
      case 'tutorial':return ['连续跑动逐渐提速，转弯和掉头保持跑速；停下后重新加速。迎上技能泡发动技能，走过金币才会入账，靠近武器箱换装。电脑使用方向键或 WASD 移动，空格或 Shift 冲刺；手机使用摇杆或倾斜移动。击败本波全部精英才能换波，第 2、4 波可进入摊位签单，首次倒下可免费复活。'];
      case 'countdown':return [`准备出发，${this.data.countdown??1}`];
      case 'play':return [hud?`第 ${hud.wave} 波，生命 ${Math.ceil(hud.health)} / ${hud.maxHealth}${hud.maxHealth>0&&hud.health/hud.maxHealth<.3?'，生命值低':''}，击败 ${hud.kills}，金币 ${hud.coins}，当前武器 ${hud.weaponName}${hud.upgradeName?`，配送箱改装 ${hud.upgradeName}`:''}`:'战斗中'];
      case 'pause':return [hud?`第 ${hud.wave} 波，击败 ${hud.kills}，用时 ${timeText(hud.time)}。${hud.upgradeName??''} ${hud.upgradeDetail??''}`:'已暂停'];
      case 'confirm':return ['本局进度将结束，不计入最佳纪录。'];
      case 'revive':return [`生命耗尽，本局还有一次免费复活机会。第 ${hud?.wave??1} 波，击败 ${hud?.kills??0}，金币 ${hud?.coins??0}。`];
      case 'closing':return [`尾单已送达，签收 ${hud?.orders??0} 单，击败 ${hud?.kills??0}。可以收摊结算，或带着当前装备和生命继续夜班。`];
      case 'result':return [`${hud?.closingSettled?'收摊结算':hud?.practice?'试验结束':'本局结束'}。${this.data.isRecord?'新纪录。':''}击败 ${hud?.kills??0}，签收 ${hud?.orders??0} 单，金币 ${hud?.coins??0}，存活 ${timeText(hud?.time??0)}，到达第 ${hud?.wave??1} 波。${hud?.practice?'试验记录不写入正式最佳成绩。':`本地最佳击败 ${this.data.best?.score??0}。`}${this.data.saved===false?'纪录暂未保存，关闭页面可能丢失。':''}`];
      case 'settings':return [this.settingsConfirm==='default'?'恢复默认设置？最佳纪录不会被删除。':this.settingsConfirm==='cancel'?'放弃未应用的修改？':this.settingsTab==='sound'?'音量可即时试听；取消将恢复原来的声音设置。':this.settingsTab==='display'?'简化特效保留敌人预警和技能判定。':'调整布局不改变移动速度。'];
      case 'catalog':{
        const page=CATALOG[this.catalogTab],group=this.catalogTab==='enemies'?ENEMY_GROUPS[this.enemyGroup]:null;
        const kinds:readonly string[]|null=group?group.kinds:null;
        return [group?.note??page.note,...page.cards.filter(item=>!kinds||kinds.includes(item.kind)).map(item=>`${item.title}，${item.role}。${item.description} ${item.detail}`)];
      }
      case 'lab':return [`当前武器 ${WEAPON_NAMES[this.selectedWeapon]}。${WEAPON_GUIDE[this.selectedWeapon].description} ${WEAPON_GUIDE[this.selectedWeapon].detail}`,
        `当前技能 ${SKILL_NAMES[this.selectedSkill]}。${SKILL_GUIDE[this.selectedSkill].description} ${SKILL_GUIDE[this.selectedSkill].detail}`,
        `当前敌人 ${ENEMY_NAMES[this.selectedEnemy]}。${ENEMY_GUIDE[this.selectedEnemy].description} ${ENEMY_GUIDE[this.selectedEnemy].detail}`,
        `当前试打 ${LAB_DEMO_LABELS[this.selectedDemo]}。`,
        '操作面板打开时模拟暂停。选择继续试验回到场地。'];
      case 'rotate':return ['请横屏游玩，转动设备或将窗口调成横向。'];
    }
  }
  private syncAccessibility(redrawFocus=true):void {
    if(!this.accessibility)return;
    const changed=this.semanticLastView!==this.current;
    const titles:Record<GameView,string>={home:'首页',loading:'加载中',tutorial:'玩法说明',countdown:'准备出发',play:'战斗',pause:'已暂停',confirm:'结束本局？',revive:'要继续这一单吗？',closing:'尾单已送达',result:'本局结果',rotate:'请横屏游玩',settings:'设置',catalog:'夜市图鉴',lab:'配送试验场'};
    const controls=this.semanticControls.map(control=>{
      const target=this.semanticTargets.get(control.id)?.node;
      const button=target?.getComponent(Button),slider=target?.getComponent(Slider);
      if(control.id==='Dash'&&control.kind==='button'){
        const hud=this.data.hud,remaining=hud?Math.max(0,hud.dashReadyAt-hud.time):0;
        return {...control,label:remaining>0?`冲刺冷却 ${remaining.toFixed(1)} 秒`:'冲刺',disabled:!!button&&!button.interactable};
      }
      if(control.kind==='slider'){
        const key=control.id==='music slider'?'music':'sfx',value=Math.round(this.draft[key]*100);
        return {...control,value,valueText:`${value}%`,disabled:this.draft.muted||!!slider&&!slider.enabled};
      }
      return {...control,disabled:control.disabled||!!button&&!button.interactable} as SemanticControl;
    });
    this.accessibility.setView({id:this.current,title:titles[this.current],modal:!['home','play','countdown','loading'].includes(this.current),controls,content:this.semanticContent(),
      initialFocus:this.current==='play'?undefined:controls.find(item=>!item.disabled)?.id});
    this.semanticLastView=this.current;
    if(changed&&this.current==='play')this.accessibilityDocument?.getElementById('GameCanvas')?.focus();
    if(redrawFocus)this.drawSemanticFocus(this.semanticFocusId);
  }

  /** Insets are design-space distances, computed by the platform adapter. */
  setSafeInsets(insets:SafeInsets):void {
    const next={left:Math.max(0,insets.left),right:Math.max(0,insets.right),
      top:Math.max(0,insets.top),bottom:Math.max(0,insets.bottom)};
    if(next.left===this.safe.left&&next.right===this.safe.right&&next.top===this.safe.top&&next.bottom===this.safe.bottom)return;
    this.safe=next;
    this.render();
  }

  show(view:GameView,data:UiData={}):void {
    if(view==='home')this.homeScene=true;
    else if(view==='play'||view==='pause'||view==='result'||view==='revive'||view==='closing'||view==='confirm'||view==='lab')this.homeScene=false;
    if(this.current==='settings'&&view!=='settings'){this.tiltPending=false;this.tiltRequest++;}
    if(view==='settings'&&this.current!=='settings'&&this.current!=='rotate'){
      this.original={...(data.settings??this.data.settings??DEFAULT_SETTINGS)};
      this.draft={...this.original};this.settingsTab='operation';this.settingsConfirm=null;
      this.settingsFromBattle=['play','pause','countdown','confirm','lab'].includes(this.current);
    }
    this.current=view;
    this.data={...this.data,...data};
    this.render();
  }

  /** Retain updates while portrait guidance is visible; repaint only the
   * loading screen, without replacing the orientation prompt. */
  updateLoadingProgress(progress:number):void {
    this.data.progress=clamp(progress,0,1);
    if(this.current==='loading')this.render();
  }

  /** The host answers the asynchronous sensor permission/sample request. */
  resolveTiltPermission(request:number,allowed:boolean):void {
    if(this.current!=='settings'||!this.tiltPending||request!==this.tiltRequest)return;
    this.tiltPending=false;this.draft.mode=allowed?'tilt':'joystick';
    this.onAction('preview-settings',{...this.draft});this.render();
  }

  /** The host restores a draft audio preview after an orientation interruption. */
  getSettingsPreview():Settings|null {return this.current==='settings'?{...this.draft}:null;}

  /** Escape closes the inner prompt first, then follows the Cancel button. */
  escapeSettings():void {
    if(this.current!=='settings')return;
    if(this.settingsConfirm){this.settingsConfirm=null;this.render();return;}
    if(JSON.stringify(this.draft)!==JSON.stringify(this.original)){
      this.settingsConfirm='cancel';this.render();
    }else this.onAction('cancel-settings');
  }

  updateHud(state:HudState):void {
    this.data.hud=state;
    if(this.current==='play'&&this.accessibility){
      const status=`第 ${state.wave} 波，生命 ${Math.ceil(Math.max(0,state.health))} / ${state.maxHealth}${state.maxHealth>0&&state.health/state.maxHealth<.3?'，生命值低':''}${state.upgradeName?`，配送箱改装 ${state.upgradeName}`:''}${state.statuses?.length?`，状态 ${state.statuses.map(item=>`${item.label}${item.active?'':'（未生效）'}`).join('、')}`:''}${state.boss?`，首领 ${state.boss.name} ${Math.ceil(state.boss.health)} / ${state.boss.maxHealth}`:''}`;
      const now=Date.now();if(status!==this.announcedBattle&&now-this.announcedAt>=3000){this.announcedBattle=status;this.announcedAt=now;this.accessibility.announce(status);}
    }
    if(!this.hudRoot)return;
    this.setLabel('kills',String(state.kills));
    this.setLabel('coins',`${state.coins} 金币`);
    this.setLabel('health',`${Math.ceil(Math.max(0,state.health))} / ${state.maxHealth}`);
    this.setLabel('wave',`波次 ${state.wave}`);
    this.setLabel('time',timeText(state.time));
    this.setLabel('weapon',state.weaponName);
    const weaponFrame=state.weaponKind?this.artwork.get(state.weaponKind):undefined;
    if(this.weaponIcon&&weaponFrame&&this.weaponIcon.spriteFrame!==weaponFrame){
      this.weaponIcon.spriteFrame=weaponFrame;
      this.weaponIcon.node.getComponent(UITransform)?.setContentSize(28*weaponFrame.originalSize.width/weaponFrame.originalSize.height,28);
    }
    this.setLabel('waveMessage',state.waveMessage??'');
    this.setLabel('stage',state.stageLabel??'');
    const feedback=this.combatFeedback.update(state.kills,state.time,!!this.data.settings?.reduceMotion||!!this.data.systemReduceMotion);
    const comboActive=(state.combo??0)>1&&(state.comboRemaining??0)>0;
    if(this.comboPanel)this.comboPanel.active=comboActive;
    this.setLabel('combo',comboActive?`连击 ×${state.combo}`:'');
    this.setLabel('burst',comboActive?feedback.burstLabel:'');
    if(this.comboFuse){
      this.comboFuse.clear();const fraction=clamp((state.comboRemaining??0)/CONFIG.rewards.comboDuration,0,1);
      if(fraction>0){this.comboFuse.fillColor=ORANGE;this.comboFuse.roundRect(-80,-2,160*fraction,4,Math.min(2,80*fraction));this.comboFuse.fill();}
    }
    if(this.labels.kills)this.labels.kills.node.setScale(feedback.pulseTarget==='kills'?feedback.pulse:1,feedback.pulseTarget==='kills'?feedback.pulse:1,1);
    if(this.labels.combo)this.labels.combo.node.setScale(feedback.pulseTarget==='combo'?feedback.pulse:1,feedback.pulseTarget==='combo'?feedback.pulse:1,1);
    for(let i=0;i<this.statusCards.length;i++){
      const card=this.statusCards[i],item=state.statuses?.[i];card.node.active=!!item;
      if(!item)continue;
      card.label.string=item.label;card.time.string=`${Math.max(0,item.seconds).toFixed(1)}秒`;
      card.opacity.opacity=item.active?255:145;
      const frame=this.artwork.get(item.kind);card.icon.enabled=!!frame;
      if(frame&&card.icon.spriteFrame!==frame){card.icon.spriteFrame=frame;card.icon.node.getComponent(UITransform)?.setContentSize(card.iconSize*frame.originalSize.width/frame.originalSize.height,card.iconSize);}
    }
    const sprint=state.sprintMultiplier??1;
    this.setLabel('sprint',sprint>=1.01?`连续跑动 +${Math.round((sprint-1)*100)}%`:'');
    const remaining=Math.max(0,state.dashReadyAt-state.time);
    this.setLabel('dashStatus',state.dashUntil>state.time?'冲刺中':remaining>0?`${remaining.toFixed(1)}秒`:'就绪');
    if(this.dashButton)this.dashButton.interactable=this.current==='play'&&remaining<=0;
    this.drawDashCooldown(remaining);
    const dashState=remaining>0?remaining.toFixed(1):'ready';
    if(this.current==='play'&&this.semanticDashState!==dashState){
      this.semanticDashState=dashState;if(!this.rendering&&this.semanticLastView==='play')this.syncAccessibility(false);
    }
    if(this.upgradeBadge){this.upgradeBadge.active=!!state.upgradeName;this.setLabel('upgrade',state.upgradeName??'');}
    const ratio=state.maxHealth>0?clamp(state.health/state.maxHealth,0,1):0;
    if(this.lowHealthWarning)this.lowHealthWarning.active=state.maxHealth>0&&ratio<.3;
    if(this.healthFill){
      this.healthFill.clear();this.healthFill.fillColor=ratio<.3?RED:new Color(231,135,109,255);
      if(ratio>0){this.healthFill.roundRect(-76,-3,152*ratio,6,Math.min(3,76*ratio));this.healthFill.fill();}
    }
    const boss=state.boss;
    if(this.bossNode)this.bossNode.active=!!boss;
    this.setLabel('boss',boss?`史诗  ${boss.name}  ${Math.ceil(Math.max(0,boss.health))} / ${boss.maxHealth}${boss.move?'  '+boss.move:''}`:'');
    if(this.bossFill){
      this.bossFill.clear();const fraction=boss&&boss.maxHealth>0?clamp(boss.health/boss.maxHealth,0,1):0;
      if(fraction>0){this.bossFill.fillColor=new Color(237,154,166,255);this.bossFill.roundRect(-150,-3,300*fraction,6,Math.min(3,150*fraction));this.bossFill.fill();}
    }
    if(this.weaponFill){
      this.weaponFill.clear();const fraction=clamp(state.weaponReady??1,0,1);
      if(fraction>0){this.weaponFill.fillColor=ORANGE;this.weaponFill.roundRect(-70,-2,140*fraction,4,Math.min(2,70*fraction));this.weaponFill.fill();}
    }
  }

  private drawDashCooldown(remaining:number):void {
    const g=this.dashGraphic;if(!g)return;
    const ready=remaining<=0,progress=clamp(1-remaining/CONFIG.player.dashCooldown,0,1);
    g.clear();g.fillColor=ready?ORANGE:new Color(73,62,53,255);g.circle(0,0,32);g.fill();
    if(!ready&&progress>0){
      // Graphics.arc starts a new subpath in Creator 3.8. Draw the sector
      // explicitly so the progress always connects to the centre.
      g.fillColor=new Color(105,158,134,255);g.moveTo(0,0);
      const steps=Math.max(1,Math.ceil(progress*48));
      for(let i=0;i<=steps;i++){const angle=Math.PI/2-Math.PI*2*progress*i/steps;g.lineTo(Math.cos(angle)*32,Math.sin(angle)*32);}
      g.close();g.fill();
    }
  }

  destroy():void {
    this.disposed=true;this.homeArtSlots=[];this.accessibility?.destroy();this.accessibility=null;this.node.destroy();this.hudRoot=null;this.modalRoot=null;this.labels={};
    for(const frame of new Set(this.artwork.values()))frame.destroy();this.artwork.clear();
  }

  private render():void {
    this.rendering=true;
    this.homeArtSlots=[];
    this.saveCatalogOffset();
    this.semanticControls=[];this.semanticTargets.clear();this.semanticRing=null;
    // removeAllChildren only detaches; destroy old nodes so listeners and renderers
    // do not survive repeated view changes.
    for(const child of [...this.node.children]){child.removeFromParent();child.destroy();}
    this.hudRoot=null;this.modalRoot=null;
    this.labels={};this.healthFill=null;this.bossFill=null;this.weaponFill=null;this.weaponIcon=null;this.bossNode=null;this.dashButton=null;this.dashGraphic=null;this.lowHealthWarning=null;this.upgradeBadge=null;this.statusCards=[];this.comboPanel=null;this.comboFuse=null;
    if(this.homeScene&&this.current!=='loading'&&this.current!=='rotate')this.homeArtwork();
    const state=this.data.hud;
    if(state&&(['play','pause','countdown','confirm','lab'].includes(this.current)||(this.current==='settings'&&this.settingsFromBattle))){
      this.buildHud();this.updateHud(state);
    }
    if(this.current==='play'){this.rendering=false;this.syncAccessibility();return;}
    this.modalRoot=this.container(this.node,'Overlay',1280,720,0,0);
    switch(this.current){
      case 'home':this.home();break;
      case 'loading':this.loading();break;
      case 'tutorial':this.tutorial();break;
      case 'countdown':this.countdown();break;
      case 'pause':this.pause();break;
      case 'confirm':this.confirm();break;
      case 'revive':this.revive();break;
      case 'closing':this.closing();break;
      case 'result':this.result();break;
      case 'rotate':this.rotate();break;
      case 'settings':this.settings();break;
      case 'catalog':this.catalog();break;
      case 'lab':this.lab();break;
    }
    this.rendering=false;this.syncAccessibility();
  }

  private container(parent:Node,name:string,w:number,h:number,x:number,y:number):Node {
    const node=new Node(name);node.layer=parent.layer;
    const transform=node.addComponent(UITransform);transform.setContentSize(w,h);
    node.setPosition(x,y,0);parent.addChild(node);return node;
  }
  private shape(parent:Node,name:string,x:number,y:number,w:number,h:number,color:Color,radius=0,border?:Color):Node {
    const node=this.container(parent,name,w,h,x,y),g=node.addComponent(Graphics);
    g.fillColor=color;g.roundRect(-w/2,-h/2,w,h,radius);g.fill();
    if(border){g.lineWidth=2;g.strokeColor=border;g.roundRect(-w/2,-h/2,w,h,radius);g.stroke();}
    return node;
  }
  private text(parent:Node,name:string,value:string,x:number,y:number,w:number,h:number,size:number,color:Color=INK,bold=false,left=false):Label {
    const node=this.container(parent,name,w,h,x,y),label=node.addComponent(Label);
    label.string=value;label.fontSize=size;label.lineHeight=Math.ceil(size*1.35);label.color=color;
    label.isBold=bold;label.horizontalAlign=left?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
    label.overflow=Label.Overflow.SHRINK;label.enableWrapText=true;return label;
  }
  private async loadArtwork(homeReady:()=>void):Promise<void> {
    const add=(name:string,texture:Texture2D,source?:readonly [number,number,number,number])=>{
      const [x,y,w,h]=source??[0,0,texture.width,texture.height];
      const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(x,y,w,h);frame.originalSize=new Size(w,h);frame.packable=false;this.artwork.set(name,frame);
      this.completeHomeArt(name,frame);
    };
    const load=(path:string,frames:Record<string,readonly [number,number,number,number]>|string,showWhileLoading=false)=>new Promise<void>(resolve=>{
      resources.load(path,Texture2D,(error,texture)=>{
        if(!error&&texture&&!this.disposed){
          if(typeof frames==='string')add(frames,texture);
          else for(const [name,rect] of Object.entries(frames))add(name,texture,rect);
          // Keep the failure button stable and never replace portrait guidance.
          if(showWhileLoading&&this.current==='loading'&&!this.data.message)this.render();
        }
        resolve();
      });
    });
    homeReady();
    if(this.disposed)return;
    await Promise.all([
      load('art/clay-chibi-home/texture','courierHome',true),load('art/clay-market-mascots/texture',clayFrames.mascots,true),
      load('ui/delivery-box/texture','brand',true),
      load('art/clay-bun-courier-rig/texture',clayFrames.rig),
      load('art/clay-weapons/texture',clayFrames.weapons),load('art/clay-supplies/texture',clayFrames.supplies),
      load('art/clay-elemental-tools/texture',clayFrames.elementals),load('art/clay-market-bosses/texture',clayFrames.bosses),
      load('art/clay-market-elites/texture',clayFrames.elites),load('art/clay-market-champions/texture',clayFrames.champions),
      load('art/clay-street-snacks/texture',clayFrames.streetSnacks),load('art/clay-actors/texture',clayFrames.ultimates),
      load('art/clay-soup-dumpling/texture','health'),
    ]);
  }
  private sprite(parent:Node,name:string,key:string,x:number,y:number,height:number,flip=false):Node|null {
    const frame=this.artwork.get(key);if(!frame)return null;
    const width=height*frame.originalSize.width/frame.originalSize.height;
    const node=this.container(parent,name,width,height,x,y),sprite=node.addComponent(Sprite);
    sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;node.getComponent(UITransform)!.setContentSize(width,height);
    if(flip)node.setScale(-1,1,1);return node;
  }
  /** Keep the interactive tree stable while the first home images download. */
  private homeSprite(parent:Node,name:string,key:'courierHome'|'bun'|'brand',x:number,y:number,height:number,flip=false):Node {
    const existing=this.sprite(parent,name,key,x,y,height,flip);if(existing)return existing;
    const node=this.container(parent,name,height,height,x,y),sprite=node.addComponent(Sprite);
    sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.enabled=false;
    if(flip)node.setScale(-1,1,1);
    const placeholder=this.container(node,`${name} placeholder`,height,height,0,0);
    if(key==='courierHome'){
      this.ellipse(placeholder,'Courier legs',0,-height*.31,height*.16,height*.12,new Color(73,73,76,255));
      this.ellipse(placeholder,'Courier coat',0,-height*.13,height*.19,height*.22,new Color(216,111,48,255));
      this.ellipse(placeholder,'Courier hair',0,height*.10,height*.17,height*.18,new Color(96,57,43,255));
      this.ellipse(placeholder,'Courier face',0,height*.10,height*.15,height*.16,new Color(242,190,145,255));
      this.ellipse(placeholder,'Courier left eye',-height*.055,height*.10,height*.012,height*.019,INK);
      this.ellipse(placeholder,'Courier right eye',height*.055,height*.10,height*.012,height*.019,INK);
      this.shape(placeholder,'Courier smile',0,height*.045,height*.055,height*.012,new Color(159,78,63,255),3);
      this.ellipse(placeholder,'Courier helmet',0,height*.22,height*.18,height*.09,ORANGE);
      this.shape(placeholder,'Helmet band',0,height*.19,height*.27,height*.018,new Color(255,218,168,255),3);
      this.shape(placeholder,'Courier bag',-height*.13,-height*.20,height*.17,height*.16,new Color(67,130,111,255),8);
      this.text(placeholder,'Courier bag mark','送',-height*.13,-height*.20,height*.12,height*.10,height*.06,CREAM,true);
    }else if(key==='bun'){
      this.ellipse(placeholder,'Bun body',0,0,height*.40,height*.35,CREAM);
      this.ellipse(placeholder,'Bun left eye',-height*.11,height*.02,height*.025,height*.04,INK);
      this.ellipse(placeholder,'Bun right eye',height*.11,height*.02,height*.025,height*.04,INK);
      this.shape(placeholder,'Bun smile',0,-height*.10,height*.09,height*.018,new Color(175,100,72,255),2);
    }else{
      this.shape(placeholder,'Delivery box',0,0,height*.72,height*.62,new Color(67,130,111,255),8);
      this.text(placeholder,'Delivery mark','送',0,0,height*.6,height*.5,height*.32,CREAM,true);
    }
    this.homeArtSlots.push({key,node,sprite,placeholder,height});
    return node;
  }
  private completeHomeArt(key:string,frame:SpriteFrame):void {
    for(const slot of this.homeArtSlots){
      if(slot.key!==key||!slot.node.isValid)continue;
      slot.node.getComponent(UITransform)?.setContentSize(slot.height*frame.originalSize.width/frame.originalSize.height,slot.height);
      slot.sprite.spriteFrame=frame;slot.sprite.enabled=true;slot.placeholder.active=false;
    }
    this.homeArtSlots=this.homeArtSlots.filter(slot=>slot.key!==key&&slot.node.isValid);
  }
  private minimumTarget():number {
    // Device-independent pixels, accounting for Creator's pixel-ratio cap.
    const scale=view.getScaleY()/Math.max(1,screen.devicePixelRatio);
    return Number.isFinite(scale)&&scale>0?Math.min(96,Math.max(44,44/scale)):44;
  }
  private touchTarget(node:Node,w:number,h:number):void {
    const min=this.minimumTarget();
    node.getComponent(UITransform)?.setContentSize(Math.max(w,min),Math.max(h,min));
  }
  private click(node:Node,callback:()=>void):void {
    let rejectMouse=false;
    node.on(Node.EventType.TOUCH_START,()=>{rejectMouse=false;});
    // Creator synthesizes touch before it dispatches the underlying mouse event.
    node.on(Node.EventType.MOUSE_DOWN,(event:EventMouse)=>{rejectMouse=event.getButton()!==EventMouse.BUTTON_LEFT;});
    node.on('click',()=>{if(!rejectMouse)callback();rejectMouse=false;});
  }
  private ellipse(parent:Node,name:string,x:number,y:number,rx:number,ry:number,color:Color):void {
    const node=this.container(parent,name,rx*2,ry*2,x,y),g=node.addComponent(Graphics);
    g.fillColor=color;g.ellipse(0,0,rx,ry);g.fill();
  }
  private homeArtwork():void {
    this.ellipse(this.node,'Courier shadow',221,-225,92,17,new Color(23,17,23,64));
    this.homeSprite(this.node,'Home courier','courierHome',221,-36.5,373);
    this.ellipse(this.node,'Bun shadow',450,-228,47,10,new Color(23,17,23,56));
    this.homeSprite(this.node,'Home bun','bun',450,-165.5,123,true);
  }
  private button(parent:Node,name:string,title:string,action:GameAction,x:number,y:number,w:number,h:number,primary=false):Button {
    const homeTool=parent.name==='Home card'&&(name==='Practice'||name==='Catalog');
    const fill=primary?ORANGE:homeTool?TEAL:new Color(255,244,224,255);
    const border=primary?new Color(163,79,32,255):homeTool?new Color(86,131,123,255):PAPER_BORDER;
    this.shape(parent,`${name} shadow`,x,y-4,w,h,primary?new Color(169,86,41,255):homeTool?new Color(100,137,126,255):new Color(186,161,132,255),12);
    const node=this.shape(parent,name,x,y,w,h,fill,12,border);
    this.touchTarget(node,w,h);
    const button=node.addComponent(Button);button.transition=Button.Transition.NONE;
    const homeStart=parent.name==='Home card'&&name==='Start';
    this.text(node,`${name} text`,title,homeStart?-20:0,0,w-(homeStart?54:12),h-6,homeStart?28:20,homeTool?new Color(32,76,68,255):INK,true,homeStart);
    if(homeStart)this.text(node,'Start arrow','→',w/2-35,0,42,h-4,32,INK,true);
    // Native touch-start matches the web dash press; other actions require a completed click.
    if(action==='dash')this.dashListener(node,button);
    else this.click(node,()=>this.onAction(action));
    if(parent!==this.hudRoot||this.current==='play')this.semanticControl({id:name,kind:'button',label:action==='pause'?'暂停游戏':title},node,()=>{if(button.interactable)this.onAction(action);});
    return button;
  }
  private callbackButton(parent:Node,name:string,title:string,callback:()=>void,x:number,y:number,w:number,h:number,primary=false):Button {
    const activeTab=name.startsWith('Tab ')&&primary;
    const node=this.shape(parent,name,x,y,w,h,activeTab?new Color(50,127,121,255):primary?ORANGE:new Color(255,240,215,255),10,PAPER_BORDER);
    this.touchTarget(node,w,h);
    const button=node.addComponent(Button);button.transition=Button.Transition.NONE;
    this.text(node,`${name} text`,title,0,0,w-10,h-4,activeTab?22:18,activeTab?WHITE:INK,true);this.click(node,callback);
    const choice=/^(Tab |Catalog |Size |Hand |Quality |Sensitivity |Joystick mode|Tilt mode|Half speed|Full speed)/.test(name)||/^Enemy (normal|elite|epic)$/.test(name);
    const switchLabels:Record<string,string>={'Mute':'总静音','Toggle reduceMotion':'减少动态','Toggle shake':'画面震动','Toggle haptics':'设备振动'};
    const arrows:Record<string,string>={'Weapon previous':'上一武器','Weapon next':'下一武器','Skill previous':'上一技能','Skill next':'下一技能','Enemy previous':'上一敌人','Enemy next':'下一敌人','Demo previous':'上一试打','Demo next':'下一试打'};
    const semantic:SemanticControl=switchLabels[name]?{id:name,kind:'switch',label:switchLabels[name],checked:primary}:choice?{id:name,kind:'tab',label:title,selected:primary}:{id:name,kind:'button',label:arrows[name]??title};
    this.semanticControl(semantic,node,()=>{if(button.interactable)callback();});return button;
  }
  private link(parent:Node,name:string,title:string,action:GameAction,x:number,y:number,w:number):void {
    const node=this.container(parent,name,w,34,x,y),button=node.addComponent(Button);button.transition=Button.Transition.NONE;
    this.touchTarget(node,w,34);
    const label=this.text(node,`${name} text`,title,0,0,w,28,15,new Color(119,81,58,255),true);label.isUnderline=true;
    this.click(node,()=>this.onAction(action));this.semanticControl({id:name,kind:'button',label:title},node,()=>this.onAction(action));
  }
  private dashListener(node:Node,button:Button):void {
    let pending:ReturnType<typeof setTimeout>|null=null;
    node.on(Node.EventType.TOUCH_START,()=>{
      if(pending!==null)clearTimeout(pending);
      pending=setTimeout(()=>{pending=null;if(node.isValid&&this.current==='play'&&button.interactable)this.onAction('dash');},0);
    });
    node.on(Node.EventType.MOUSE_DOWN,(event:EventMouse)=>{
      if(event.getButton()!==EventMouse.BUTTON_LEFT&&pending!==null){clearTimeout(pending);pending=null;}
    });
  }
  private volumeSlider(parent:Node,key:'music'|'sfx',x:number,y:number):void {
    const node=this.container(parent,`${key} slider`,350,48,x,y);
    this.touchTarget(node,350,48);
    this.shape(node,'Track',0,0,350,8,new Color(218,197,166,255),4,new Color(173,136,97,255));
    const progress=this.container(node,'Progress',350,8,0,0).addComponent(Graphics);
    const draw=(value:number)=>{progress.clear();if(value>0){progress.fillColor=new Color(55,126,117,255);progress.roundRect(-175,-4,350*value,8,Math.min(4,175*value));progress.fill();}};
    draw(this.draft[key]);
    const handle=this.container(node,'Handle',28,28,-175+350*this.draft[key],0);
    const target=handle.addComponent(Sprite);target.sizeMode=Sprite.SizeMode.CUSTOM;
    const knob=this.container(handle,'Knob',28,28,0,0).addComponent(Graphics);
    knob.fillColor=new Color(255,244,221,255);knob.strokeColor=new Color(120,80,54,255);knob.lineWidth=2;knob.circle(0,0,13);knob.fill();knob.stroke();
    const slider=node.addComponent(Slider);slider.handle=target;slider.progress=this.draft[key];slider.enabled=!this.draft.muted;
    const label=this.text(parent,`${key} value`,`${Math.round(this.draft[key]*100)}%`,x+230,y,82,40,18,INK,true);
    const setValue=(value:number)=>{
      const next=Math.round(clamp(value,0,1)*100)/100;
      this.draft[key]=next;slider.progress=next;draw(next);label.string=`${Math.round(next*100)}%`;this.onAction('preview-settings',{...this.draft});
    };
    node.on('slide',(value:Slider)=>{setValue(value.progress);this.syncAccessibility();});
    this.semanticControl({id:`${key} slider`,kind:'slider',label:key==='music'?'音乐音量':'音效音量',min:0,max:100,step:1,value:Math.round(this.draft[key]*100),valueText:`${Math.round(this.draft[key]*100)}%`,disabled:this.draft.muted},node,value=>{if(typeof value==='number'&&slider.enabled){setValue(value/100);this.syncAccessibility();}});
  }
  private setLabel(key:string,value:string):void {const label=this.labels[key];if(label&&label.string!==value)label.string=value;}
  private backdrop():Node {
    const root=this.modalRoot!;this.shape(root,'Dim',0,0,1280,720,SHADE).addComponent(BlockInputEvents);return root;
  }
  private card(w:number,h:number):Node {
    const root=this.backdrop();this.shape(root,'Paper shadow',0,-9,w,h,new Color(37,29,33,50),25);
    const paper=this.shape(root,'Paper',0,0,w,h,PAPER,25,PAPER_BORDER);
    this.shape(paper,'Paper inset',0,0,w-12,h-12,new Color(255,245,227,20),21,new Color(247,216,170,90));return paper;
  }
  private buildHud():void {
    const root=this.hudRoot=this.container(this.node,'HUD',1280,720,0,0);
    const left=-640+this.safe.left,right=640-this.safe.right,top=360-this.safe.top,bottom=-360+this.safe.bottom;
    this.shape(root,'Battle ledger',left+130,top-45,220,60,DARK,4,new Color(223,190,158,150));
    this.sprite(root,'Tally bun','bun',left+50,top-48,42);
    this.text(root,'Kill caption','击败',left+83,top-18,44,18,12,CREAM,true);
    this.labels.kills=this.text(root,'Kills','0',left+84,top-43,68,34,30,WHITE,true);
    this.text(root,'Heart','♥',left+120,top-19,22,22,20,new Color(255,148,119,255),true);
    this.labels.health=this.text(root,'Health','100 / 100',left+174,top-19,90,18,12,WHITE,true);
    const bar=this.shape(root,'Health track',left+173,top-32,78,5,new Color(72,43,34,255),3);
    this.healthFill=this.container(bar,'Health fill',152,6,0,0).addComponent(Graphics);
    this.healthFill.node.setScale(.51,1,1);
    const warning=this.lowHealthWarning=this.shape(root,'Low health warning',left+175,top-65,86,17,new Color(135,55,37,255),4,new Color(255,182,132,255));
    this.text(warning,'Low health text','生命值低',0,0,80,16,11,WHITE,true);warning.active=false;
    this.text(root,'Coin icon','●',left+120,top-46,22,22,17,new Color(255,193,72,255),true);
    this.labels.coins=this.text(root,'Coins','0 金币',left+173,top-46,90,20,12,CREAM,true);
    this.shape(root,'Timing',right-126,top-32,120,34,DARK,5,new Color(223,190,158,100));
    this.labels.wave=this.text(root,'Wave','波次 1',right-154,top-32,62,26,14,WHITE,true);
    this.labels.time=this.text(root,'Time','00:00',right-95,top-32,58,26,15,WHITE,true);
    this.button(root,'Pause','Ⅱ','pause',right-39,top-Math.max(33,this.minimumTarget()/2+4),43,39);
    const rightHand=this.data.settings?.hand==='right',dashX=rightHand?left+62:right-62;
    const dash=this.container(root,'Dash',68,68,dashX,bottom+100),g=this.dashGraphic=dash.addComponent(Graphics);
    this.touchTarget(dash,68,68);this.drawDashCooldown(0);
    const dashBorder=this.container(dash,'Dash border',68,68,0,0).addComponent(Graphics);
    dashBorder.strokeColor=new Color(255,229,188,255);dashBorder.lineWidth=2;dashBorder.circle(0,0,32);dashBorder.stroke();
    this.dashButton=dash.addComponent(Button);this.dashButton.transition=Button.Transition.NONE;
    if(this.current==='play')this.semanticControl({id:'Dash',kind:'button',label:'冲刺'},dash,()=>{if(this.dashButton?.interactable)this.onAction('dash');});
    this.text(dash,'Dash icon','»',0,12,52,26,23,WHITE,true);
    this.text(dash,'Dash title','冲刺',0,-5,52,20,15,WHITE,true);
    this.labels.dashStatus=this.text(dash,'Dash status','就绪',0,-21,52,16,11,WHITE);
    this.dashListener(dash,this.dashButton);
    const weaponX=rightHand?left+82:right-82;
    this.shape(root,'Weapon card',weaponX,bottom+32,110,40,DARK,5,new Color(223,190,158,150));
    if(this.data.hud?.weaponKind)this.weaponIcon=this.sprite(root,'Weapon icon',this.data.hud.weaponKind,weaponX-36,bottom+32,28)?.getComponent(Sprite)??null;
    this.labels.weapon=this.text(root,'Weapon','',weaponX+12,bottom+36,66,20,13,WHITE,true);
    const upgrade=this.upgradeBadge=this.shape(root,'Upgrade badge',weaponX,bottom+59,86,16,new Color(50,110,101,255),4,new Color(230,204,160,255));
    this.labels.upgrade=this.text(upgrade,'Upgrade badge name','',0,0,80,15,11,WHITE,true);upgrade.active=false;
    this.weaponFill=this.container(root,'Weapon readiness',140,4,weaponX+10,bottom+23).addComponent(Graphics);
    this.weaponFill.node.setScale(.42,1,1);
    this.labels.waveMessage=this.text(root,'Wave message','',0,top-108,580,36,24,WHITE,true);
    const bossRoot=this.bossNode=this.shape(root,'Boss panel',0,top-36,310,43,new Color(67,37,54,242),6,new Color(222,177,136,255));
    this.labels.boss=this.text(bossRoot,'Boss','',0,5,290,24,14,WHITE,true);
    this.bossFill=this.container(bossRoot,'Boss health',300,6,0,-12).addComponent(Graphics);bossRoot.active=false;
    this.labels.stage=this.text(root,'Stage','',left+100,top-105,190,25,12,WHITE);
    const combo=this.comboPanel=this.shape(root,'Combo panel',left+105,top-96,170,32,new Color(100,54,35,238),5,new Color(240,188,127,255));
    this.labels.combo=this.text(combo,'Combo count','',-31,4,98,22,15,WHITE,true);
    this.labels.burst=this.text(combo,'Combo burst','',47,4,72,20,10,CREAM,true);
    this.comboFuse=this.container(combo,'Combo fuse',160,4,0,-12).addComponent(Graphics);combo.active=false;
    // Preserve readable text in short landscape windows. Creator's scale is
    // in physical pixels, so divide by the device ratio to estimate CSS pixels.
    const uiScale=view.getScaleY()/Math.max(1,screen.devicePixelRatio);
    const statusFont=Number.isFinite(uiScale)&&uiScale>0?clamp(12/uiScale,11,24):11;
    const statusWidth=Math.min(Math.max(90,(right-left-245)/3),Math.max(126,Math.ceil(statusFont*8+35)));
    const statusLine=Math.ceil(statusFont*1.35),statusHeight=Math.max(36,statusLine*2+4),statusGap=4,iconSize=Math.max(22,statusFont*1.35);
    for(let i=0;i<6;i++){
      const x=right-statusWidth/2-5-(i%3)*(statusWidth+statusGap);
      const y=top-80-statusHeight/2-Math.floor(i/3)*(statusHeight+statusGap);
      const node=this.shape(root,`Status card ${i}`,x,y,statusWidth,statusHeight,new Color(44,55,55,230),6,new Color(183,218,183,190));
      const opacity=node.addComponent(UIOpacity),iconNode=this.container(node,'Status icon',iconSize,iconSize,-statusWidth/2+18,0);
      const icon=iconNode.addComponent(Sprite);icon.sizeMode=Sprite.SizeMode.CUSTOM;
      const label=this.text(node,'Status label','',16,statusLine/2,statusWidth-38,statusLine,statusFont,WHITE,true);
      const time=this.text(node,'Status time','',16,-statusLine/2,statusWidth-38,statusLine,statusFont,CREAM);node.active=false;
      this.statusCards.push({node,icon,label,time,opacity,iconSize});
    }
    this.labels.sprint=this.text(root,'Sprint','',left+115,top-137,210,28,13,WHITE);
    if(this.data.hud?.practice)this.button(root,'Open lab','试验工具','lab',right-260,top-40,125,42);
  }
  private home():void {
    const root=this.modalRoot!;
    const x=-315+this.safe.left;
    this.shape(root,'Home shadow',x,-8,492,438,new Color(100,71,51,215),30);
    const card=this.shape(root,'Home card',x,0,492,438,new Color(255,243,218,255),30,PAPER_BORDER);
    this.shape(card,'Home highlight',0,1,484,430,new Color(255,255,255,12),26,new Color(255,251,235,160));
    this.homeSprite(card,'Brand icon','brand',-177,137,64);
    this.text(card,'Brand night','夜市',-52,135,160,94,76,INK,true);
    this.text(card,'Brand rush','急送',102,135,160,94,76,new Color(189,78,32,255),true);
    this.text(card,'Description','穿过食物小妖，抢到外卖道具，给自己清出一条路。',0,69,420,30,16,INK,false,true);
    const best=this.data.best;
    this.text(card,'Best caption','本地最佳击败',-155,24,112,28,13,new Color(141,107,77,255),false,true);
    this.text(card,'Best',best?`${best.score} 只`:'等待你的第一单',-35,24,155,28,16,INK,true,true);
    if(best)this.text(card,'Best time',`存活 ${timeText(best.time)}`,145,24,130,28,13,new Color(141,107,77,255));
    this.shape(card,'Best divider',0,4,420,1,new Color(193,164,126,130));
    this.button(card,'Start','开始挑战','start',0,-43,420,62,true);
    const withPractice=this.data.practiceAvailable===true;
    if(withPractice){this.button(card,'Practice','配送试验场','practice',-108,-119,204,42);this.button(card,'Catalog','夜市图鉴','catalog',108,-119,204,42);}
    else this.button(card,'Catalog','夜市图鉴','catalog',0,-119,420,42);
    this.link(card,'Tutorial','玩法说明','tutorial',-165,-171,85);
    this.link(card,'Settings','操作设置','settings',-60,-171,85);
    this.link(card,'Fullscreen','▣ 全屏','fullscreen',170,-171,85);
  }
  private loading():void {
    const c=this.card(900,460),percent=Math.round(clamp(this.data.progress??0,0,1)*100);
    this.shape(c,'Art panel',235,0,360,398,new Color(236,225,197,255),20);
    this.ellipse(c,'Night market glow',235,20,145,145,new Color(255,204,140,170));
    this.ellipse(c,'Ground shadow',240,-155,145,17,new Color(100,69,52,55));
    // Keep a visible scene even before the artwork has downloaded.
    if(!this.artwork.has('courierHome')){
      this.ellipse(c,'Courier placeholder',197,-18,65,84,new Color(76,142,126,255));
      this.text(c,'Courier placeholder mark','送',197,-18,90,70,42,CREAM,true);
    }
    if(!this.artwork.has('bun')){
      this.ellipse(c,'Bun placeholder',328,-94,48,44,new Color(255,243,221,255));
      this.text(c,'Bun placeholder face','•ᴗ•',328,-94,75,40,24,INK,true);
    }
    this.sprite(c,'Loading courier','courierHome',175,2,280);
    this.sprite(c,'Loading bun','bun',331,-91,110,true);
    this.sprite(c,'Loading brand','brand',-384,165,56);
    this.text(c,'Kicker','夜市急送',-190,165,300,34,19,new Color(119,78,53,255),true,true);
    this.text(c,'Title','夜市正在开张',-190,95,420,60,34,INK,true,true);
    this.text(c,'Text','配送员已就位，包子怪也赶来了！',-190,43,420,42,18,INK,false,true);
    this.text(c,'Progress label','正在准备夜市',-285,-28,225,30,16,new Color(119,78,53,255),true,true);
    this.text(c,'Progress text',String(percent)+'%',-25,-28,100,30,18,INK,true);
    this.shape(c,'Track',-190,-62,420,14,new Color(221,205,176,255),7);
    if(percent>0)this.shape(c,'Progress',-400+2.1*percent,-62,4.2*percent,14,ORANGE,Math.min(7,2.1*percent));
    if(this.data.message){
      this.text(c,'Error',this.data.message,-190,-105,420,40,16,RED);
      this.button(c,'Retry','重试','retry',-190,-161,160,44,true);
    }else this.text(c,'Hint','马上出发，记得躲开追来的小吃。',-190,-118,420,38,15,new Color(139,102,75,255),false,true);
  }
  private tutorial():void {
    const c=this.card(1000,570);this.text(c,'Title','走位取道具，清出路线收金币',0,238,920,50,30,INK,true);
    this.text(c,'Intro','连续跑动会逐渐提速，转弯和掉头都能保持跑速。停下来，再起步会重新加速。',0,182,900,50,18);
    this.text(c,'Guide','迎上技能泡，立即发动技能\n走过金币后才会入账\n靠近武器箱可换装，旧武器可以回来取',0,62,850,160,22);
    this.text(c,'Controls','电脑：WASD / 方向键移动，Space / Shift 冲刺\n手机：摇杆 / 倾斜移动，点按冲刺',0,-60,850,65,18);
    this.text(c,'Rules',`击败本波全部精英才能换波。第 2、4 波各有两家摊位亮灯，进圈签一单，也可以绕过。红心汤包最多回 ${CONFIG.skills.health.amount} 点生命，首次倒下可免费复活。`,0,-135,900,65,15);
    this.button(c,'Catalog','查看全部图鉴','catalog',-270,-215,225,52);
    this.button(c,'Home','返回首页','home',0,-215,225,52);
    this.button(c,'Start','开始挑战','start',270,-215,225,52,true);
  }
  private countdown():void {
    const root=this.backdrop();this.text(root,'Ready','准备出发',0,90,500,55,28,WHITE,true);
    this.text(root,'Number',String(this.data.countdown??1),0,-10,220,135,100,WHITE,true);
    this.text(root,'Hint','移动躲避，触碰道具反击',0,-105,500,40,20,WHITE);
  }
  private pause():void {
    const c=this.card(536,478),s=this.data.hud;
    this.shape(c,'Tape',0,234,138,24,new Color(255,190,124,255),0,new Color(199,150,102,255));
    this.text(c,'Title','已暂停',0,181,460,55,40,INK,true);
    this.shape(c,'Divider',0,140,462,2,new Color(202,155,101,200));
    this.text(c,'Summary',`第 ${s?.wave??1} 波  ·  击败 ${s?.kills??0}  ·  用时 ${timeText(s?.time??0)}`,0,102,460,42,20,INK,true);
    if(s?.upgradeName)this.text(c,'Upgrade',`${s.upgradeName} · ${s.upgradeDetail??''}`,0,9,440,68,17);
    else this.sprite(c,'Pause brand','brand',0,5,115);
    this.button(c,'Resume','继续挑战','resume',0,-118,466,52,true);
    this.button(c,'Settings','设置','settings',-159,-186,147,52);
    this.button(c,'Fullscreen','▣ 全屏','fullscreen',0,-186,147,52);
    this.button(c,'Home','返回首页','home',159,-186,147,52);
  }
  private confirm():void {
    const c=this.card(540,300);this.text(c,'Title','结束本局？',0,93,480,52,30,INK,true);
    this.text(c,'Hint','本局进度将结束，不计入最佳纪录。',0,35,470,44,19);
    this.button(c,'Continue','继续挑战','resume',-120,-75,200,52,true);
    this.button(c,'Abandon','返回首页','abandon',120,-75,200,52);
  }
  private revive():void {
    const c=this.card(540,330),s=this.data.hud;this.text(c,'Title','要继续这一单吗？',0,110,470,55,32,INK,true);
    this.text(c,'Hint',`生命耗尽，本局还有一次免费复活机会。\n第 ${s?.wave??1} 波 · 击败 ${s?.kills??0} · 金币 ${s?.coins??0}`,0,45,460,50,18);
    this.button(c,'Revive','免费复活','revive',0,-28,380,54,true);
    this.button(c,'Finish','结束本局','end-run',0,-101,380,45);
  }
  private closing():void {
    const c=this.card(620,340),s=this.data.hud;this.text(c,'Title','尾单已送达',0,115,560,50,30,INK,true);
    this.text(c,'Hint',`签收 ${s?.orders??0} 单 · 击败 ${s?.kills??0} 只\n可以结清今天的单，也可以带着当前装备和生命继续跑夜班。`,0,45,540,70,18);
    this.button(c,'Settle','收摊结算','settle',-135,-65,240,55,true);
    this.button(c,'Continue','继续夜班','night',135,-65,240,55);
  }
  private result():void {
    const c=this.card(640,430),s=this.data.hud;
    const title=s?.closingSettled?'收摊结算':s?.practice?'试验结束':'本局结束';
    this.text(c,'Receipt stamp','夜市急送 / 本局小票',0,191,530,24,12,new Color(168,117,74,255),true);
    this.shape(c,'Receipt divider top',0,172,576,2,new Color(202,155,101,150));
    this.text(c,'Title',`${title}${this.data.isRecord?' · 新纪录':''}`,0,142,570,44,32,INK,true);
    this.text(c,'Score caption','本局击败',0,108,200,25,15,INK,true);
    this.text(c,'Score',String(s?.kills??0),0,71,220,48,42,INK,true);
    this.shape(c,'Receipt divider',0,35,576,2,new Color(202,155,101,150));
    const stats:[string,string][]=[['签收订单',String(s?.orders??0)],['已收金币',String(s?.coins??0)],['存活时间',timeText(s?.time??0)],['到达波次',String(s?.wave??1)]];
    stats.forEach(([name,value],i)=>{
      const x=-212+i*141;this.shape(c,`Stat ${name}`,x,-14,135,58,new Color(247,229,198,255),9);
      this.text(c,`Stat label ${name}`,name,x,0,125,22,13,INK,true);
      this.text(c,`Stat value ${name}`,value,x,-22,125,24,17,INK,true);
    });
    const reason=s?.practice?'试验记录不写入正式最佳成绩。':s?.closingSettled?'':`生命耗尽 · ${s?.cause??'敌人'}${s?.lastDamageAmount?` 造成 ${s.lastDamageAmount} 点最后伤害`:''}`;
    this.text(c,'Reason',reason,0,-79,560,26,14,new Color(138,109,85,255));
    if(!s?.practice)this.text(c,'Best',`本地最佳击败 ${this.data.best?.score??0}`,0,-103,520,23,13,new Color(121,84,50,255));
    if(this.data.saved===false)this.text(c,'Save warning','纪录暂未保存，关闭页面可能丢失。',0,-124,520,22,13,RED);
    this.button(c,'Retry','再来一局','retry',-145,-171,280,50,true);
    this.button(c,'Home','返回首页','home',145,-171,280,50);
  }
  private changeSetting<K extends keyof Settings>(key:K,value:Settings[K]):void {
    if(key==='mode'&&value==='joystick'){this.tiltPending=false;this.tiltRequest++;}
    this.draft[key]=value;this.settingsConfirm=null;this.onAction('preview-settings',{...this.draft});this.render();
  }
  private settings():void {
    const c=this.card(856,582),d=this.draft;
    this.text(c,'Title','设置',0,244,780,50,38,INK,true);
    this.text(c,'Ticket left','▱',-75,246,35,36,25,new Color(207,156,99,255),true);
    this.text(c,'Ticket right','▱',75,246,35,36,25,new Color(207,156,99,255),true);
    for(const [i,tab] of (['operation','sound','display'] as const).entries()){
      const label=tab==='operation'?'操作':tab==='sound'?'声音':'画面';
      this.callbackButton(c,`Tab ${tab}`,label,()=>{this.settingsTab=tab;this.settingsConfirm=null;this.render();},(i-1)*263,182,263,50,this.settingsTab===tab);
    }
    const row=(name:string,y:number,height=88)=>{
      this.shape(c,`Row ${name}`,0,y,790,height,new Color(239,218,180,58),12,new Color(203,163,126,112));
      this.text(c,`Setting ${name}`,name,-305,y,150,38,20,INK,true,true);
    };
    if(this.settingsTab==='operation'){
      row('操作方式',92);
      this.callbackButton(c,'Joystick mode','摇杆',()=>this.changeSetting('mode','joystick'),7,92,240,66,d.mode==='joystick');
      this.callbackButton(c,'Tilt mode',this.tiltPending?'授权中…':'重力感应',()=>{if(this.tiltPending)return;this.tiltPending=true;this.onAction('request-tilt',++this.tiltRequest);this.render();},257,92,240,66,d.mode==='tilt');
      if(d.mode==='joystick'){
        row('摇杆大小',-7);
        (['small','medium','large'] as const).forEach((value,i)=>this.callbackButton(c,`Size ${value}`,['小','中','大'][i],()=>this.changeSetting('joystickSize',value),-34+i*166,-7,156,66,d.joystickSize===value));
        row('操作手位',-106);
        (['left','right'] as const).forEach((value,i)=>this.callbackButton(c,`Hand ${value}`,i===0?'左手':'右手',()=>this.changeSetting('hand',value),7+i*250,-106,240,66,d.hand===value));
        this.text(c,'Note','调整布局不改变移动速度。',0,-177,720,32,15,new Color(141,107,76,255));
      }else{
        row('灵敏度',-7);
        (['low','medium','high'] as const).forEach((value,i)=>this.callbackButton(c,`Sensitivity ${value}`,['低','中','高'][i],()=>this.changeSetting('sensitivity',value),-34+i*166,-7,156,66,d.sensitivity===value));
        row('中立姿态',-106);this.button(c,'Calibrate','重新校准','calibrate',133,-106,240,55);
        this.text(c,'Note','保持舒适横屏姿势再校准。灵敏度不改变最高速度。',0,-177,720,32,15,new Color(141,107,76,255));
      }
    }else if(this.settingsTab==='sound'){
      row('总静音',92);this.callbackButton(c,'Mute',d.muted?'开启':'关闭',()=>this.changeSetting('muted',!d.muted),255,92,160,52,d.muted);
      (['music','sfx'] as const).forEach((key,i)=>{
        const y=-7-i*99;row(key==='music'?'音乐音量':'音效音量',y);
        this.volumeSlider(c,key,105,y);
      });
      this.text(c,'Note','音量可即时试听；取消将恢复原来的声音设置。',0,-177,720,32,15,new Color(141,107,76,255));
    }else{
      const rows:[keyof Pick<Settings,'reduceMotion'|'shake'|'haptics'>,string][]=[['reduceMotion','减少动态'],['shake','画面震动'],['haptics','设备振动']];
      rows.forEach(([key,label],i)=>{
        const y=112-i*68;row(label,y,60);
        const disabled=(key!=='reduceMotion'&&(d.reduceMotion||this.data.systemReduceMotion===true))||(key==='haptics'&&this.data.hapticsAvailable===false);
        const toggle=this.callbackButton(c,`Toggle ${key}`,disabled?'不可用':d[key]?'开启':'关闭',()=>this.changeSetting(key,!d[key]),255,y,160,44,!disabled&&d[key]);toggle.interactable=!disabled;
      });
      row('特效质量',-92,60);
      (['standard','simple'] as const).forEach((value,i)=>this.callbackButton(c,`Quality ${value}`,i===0?'标准':'简化',()=>this.changeSetting('quality',value),7+i*250,-92,240,44,d.quality===value));
      this.text(c,'Note','简化特效保留敌人预警和技能判定。',0,-150,720,34,15,new Color(141,107,76,255));
    }
    if(this.settingsConfirm){
      const isDefault=this.settingsConfirm==='default';
      this.text(c,'Confirm',isDefault?'恢复默认设置？最佳纪录不会被删除。':'放弃未应用的修改？',-110,-181,470,35,17,INK,true);
      this.callbackButton(c,'Keep editing',isDefault?'取消':'继续编辑',()=>{this.settingsConfirm=null;this.render();},150,-181,120,38);
      this.callbackButton(c,'Confirm choice',isDefault?'恢复默认':'放弃修改',()=>{
        if(isDefault){this.draft={...DEFAULT_SETTINGS};this.onAction('preview-settings',{...this.draft});this.settingsConfirm=null;this.render();}
        else {this.onAction('preview-settings',{...this.original});this.onAction('cancel-settings');}
      },290,-181,130,38,true);
    }
    this.shape(c,'Footer divider',0,-203,790,2,new Color(206,177,142,255));
    this.callbackButton(c,'Defaults','恢复默认',()=>{this.settingsConfirm='default';this.render();},-305,-245,150,44);
    this.callbackButton(c,'Cancel','取消',()=>{
      if(JSON.stringify(this.draft)!==JSON.stringify(this.original)){this.settingsConfirm='cancel';this.render();}
      else this.onAction('cancel-settings');
    },215,-245,110,50);
    this.callbackButton(c,'Apply','应用',()=>this.onAction('apply-settings',{...this.draft}),340,-245,110,50,true);
  }
  private saveCatalogOffset():void {
    if(this.catalogScroll&&this.catalogScrollKey){
      const max=this.catalogScroll.getMaxScrollOffset().y;
      this.catalogOffsets.set(this.catalogScrollKey,clamp(this.catalogScroll.getScrollOffset().y,0,max));
    }
    this.catalogScroll=null;this.catalogScrollKey=null;
  }
  private catalog():void {
    const c=this.card(1110,650),page=CATALOG[this.catalogTab];
    this.text(c,'Title','夜市图鉴',-345,280,360,48,29,INK,true);
    this.button(c,'Back','返回','close-catalog',430,280,150,42);
    (['weapons','skills','enemies'] as const).forEach((tab,i)=>this.callbackButton(c,`Catalog ${tab}`,CATALOG[tab].label,()=>{this.catalogTab=tab;this.render();},-300+i*300,225,260,42,this.catalogTab===tab));
    const group=this.catalogTab==='enemies'?ENEMY_GROUPS[this.enemyGroup]:null;
    if(group){
      (['normal','elite','epic'] as const).forEach((key,i)=>this.callbackButton(c,`Enemy ${key}`,`${ENEMY_GROUPS[key].label} ${ENEMY_GROUPS[key].kinds.length}`,()=>{this.enemyGroup=key;this.render();},-315+i*180,170,160,38,this.enemyGroup===key));
    }
    const kinds:readonly string[]|null=group?group.kinds:null;
    const cards=page.cards.filter(item=>!kinds||kinds.includes(item.kind));
    this.text(c,'Note',group?.note??page.note,0,group?120:165,1000,38,15);
    // Keep controls outside the masked viewport so scrolling cannot obscure them.
    const top=group?92:137,bottom=-305,viewportHeight=top-bottom;
    const viewport=this.container(c,'Catalog viewport',1020,viewportHeight,0,(top+bottom)/2);
    viewport.addComponent(Mask);
    const heights=cards.map(item=>{
      // CJK characters may each occupy a full em. A conservative wrap estimate
      // keeps long descriptions readable without shrinking the font.
      const lines=`${item.description}
${item.detail}`.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(Array.from(line).length/24)),0);
      return Math.max(142,lines*25+30);
    });
    const contentHeight=Math.max(viewportHeight,heights.reduce((sum,height)=>sum+height+12,12));
    const content=this.container(viewport,'Catalog content',1020,contentHeight,0,(viewportHeight-contentHeight)/2);
    let cursor=contentHeight/2-12;
    cards.forEach((item,i)=>{
      const height=heights[i],y=cursor-height/2;cursor-=height+12;
      this.shape(content,`Card ${item.kind}`,0,y,1000,height,new Color(255,250,235,255),8,new Color(203,180,146,255));
      const frame=this.artwork.get(item.kind),iconHeight=frame?Math.min(76,100*frame.originalSize.height/frame.originalSize.width):76;
      this.sprite(content,`Catalog icon ${item.kind}`,item.kind,-440,y,iconHeight);
      this.text(content,`Card title ${item.kind}`,`${item.title} · ${item.role}`,-260,y,200,height-20,19,INK,true,true);
      const detail=this.text(content,`Card detail ${item.kind}`,`${item.description}
${item.detail}`,182,y,620,height-20,18,INK,false,true);
      detail.overflow=Label.Overflow.CLAMP;
    });
    const scroll=viewport.addComponent(ScrollView);scroll.horizontal=false;scroll.vertical=true;scroll.content=content;
    const key=group?`enemies:${this.enemyGroup}`:this.catalogTab;
    this.catalogScroll=scroll;this.catalogScrollKey=key;
    scroll.scrollToOffset(new Vec2(0,clamp(this.catalogOffsets.get(key)??0,0,scroll.getMaxScrollOffset().y)));
    const scrollBy=(distance:number)=>scroll.scrollToOffset(new Vec2(0,clamp(scroll.getScrollOffset().y+distance,0,scroll.getMaxScrollOffset().y)),.15);
    this.semanticControl({id:'Catalog scroll up',kind:'button',label:'图鉴向上滚动'},viewport,()=>scrollBy(-viewportHeight*.8));
    this.semanticControl({id:'Catalog scroll down',kind:'button',label:'图鉴向下滚动'},viewport,()=>scrollBy(viewportHeight*.8));
  }
  private lab():void {
    const c=this.card(1120,660);
    this.text(c,'Kicker','自由体验 · 不记入正式纪录',-305,290,420,25,15);
    this.text(c,'Title','配送试验场',-335,250,350,48,29,INK,true);
    this.button(c,'Close lab','继续试验','close-lab',420,265,190,45,true);
    const enemies:EnemyKind[]=[...ORDINARY_KINDS,...ELITE_KINDS,...EPIC_KINDS];
    const choose=<T extends string>(name:string,items:readonly T[],selected:T,label:(value:T)=>string,set:(value:T)=>void,x:number)=>{
      this.text(c,`${name} choice`,label(selected),x,150,180,42,19,INK,true);
      const select=(offset:number)=>{
        const value=items[(items.indexOf(selected)+items.length+offset)%items.length];set(value);this.render();
        this.announce(`当前${name==='Weapon'?'武器':name==='Skill'?'技能':'敌人'} ${label(value)}`);
      };
      this.callbackButton(c,`${name} previous`,'‹',()=>select(-1),x-135,150,50,40);
      this.callbackButton(c,`${name} next`,'›',()=>select(1),x+135,150,50,40);
    };
    choose('Weapon',WEAPON_KINDS,this.selectedWeapon,v=>WEAPON_NAMES[v],v=>{this.selectedWeapon=v;},-350);
    choose('Skill',SKILL_KINDS,this.selectedSkill,v=>SKILL_NAMES[v],v=>{this.selectedSkill=v;},0);
    choose('Enemy',enemies,this.selectedEnemy,v=>ENEMY_NAMES[v],v=>{this.selectedEnemy=v;},350);
    const descriptions=[WEAPON_GUIDE[this.selectedWeapon],SKILL_GUIDE[this.selectedSkill],ENEMY_GUIDE[this.selectedEnemy]];
    descriptions.forEach((entry,i)=>this.text(c,`Description ${i}`,`${entry.description}\n${entry.detail}`,-350+i*350,58,310,125,16));
    this.callbackButton(c,'Choose weapon','装备并体验',()=>this.onAction('choose-weapon',this.selectedWeapon),-350,-30,260,42,true);
    this.callbackButton(c,'Trigger skill','触发并体验',()=>this.onAction('trigger-skill',this.selectedSkill),0,-30,260,42,true);
    this.callbackButton(c,'Spawn single','生成单只',()=>this.onAction('spawn',{kind:this.selectedEnemy,group:false}),290,-30,120,42);
    const spawnGroup=this.callbackButton(c,'Spawn group','生成敌群',()=>this.onAction('spawn',{kind:this.selectedEnemy,group:true}),425,-30,120,42);spawnGroup.interactable=!isGuard(this.selectedEnemy);
    const selectDemo=(offset:number)=>{
      this.selectedDemo=(this.selectedDemo+LAB_DEMOS.length+offset)%LAB_DEMOS.length;this.render();
      this.announce(`当前试打 ${LAB_DEMO_LABELS[this.selectedDemo]}`);
    };
    this.callbackButton(c,'Demo previous','‹',()=>selectDemo(-1),-360,-115,55,40);
    this.text(c,'Demo',LAB_DEMO_LABELS[this.selectedDemo],-200,-115,260,35,17,INK,true);
    this.callbackButton(c,'Demo next','›',()=>selectDemo(1),-40,-115,55,40);
    this.callbackButton(c,'Run demo','实战试打',()=>this.onAction('demo',LAB_DEMOS[this.selectedDemo]),135,-115,190,40,true);
    const speed=(value:number)=>{this.data.labSpeed=value;this.onAction('set-speed',value);this.render();};
    this.callbackButton(c,'Half speed','0.5×',()=>speed(.5),-350,-195,120,40,this.data.labSpeed===.5);
    this.callbackButton(c,'Full speed','1×',()=>speed(1),-215,-195,120,40,this.data.labSpeed!==.5);
    this.button(c,'Heal','补满生命','heal',-55,-195,140,40);
    this.button(c,'Clear','清空场地','clear',105,-195,140,40);
    this.button(c,'Reset','重置试验','reset-lab',265,-195,140,40);
    this.button(c,'Catalog','查看图鉴','catalog',425,-195,140,40);
    this.text(c,'Lab note','操作面板打开时模拟暂停。点击“继续试验”回到场地。',0,-275,950,35,16);
  }
  private rotate():void {
    const root=this.backdrop();this.text(root,'Rotate','请横屏游玩',0,45,650,65,36,WHITE,true);
    this.text(root,'Hint','转动设备，或将窗口调成横向。',0,-25,650,50,20,WHITE);
  }
}
