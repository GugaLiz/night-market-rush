import {Color, Graphics, Node, Sprite, UITransform, UIOpacity} from 'cc';
import {CONFIG, WORLD} from '../domain/core/config';
import {siumaiHop} from '../domain/core/enemies';
import {clamp} from '../domain/core/geometry';
import {giantJumpHeight} from '../domain/core/giant-bun';
import {TOSS_DURATION} from '../domain/core/ultimates';
import {isEpic, isGuard, type Enemy, type GameEvent, type GameState, type GuardShape, type Settings} from '../domain/shared/types';
import {enemyHeight} from './damage-model';
import {SpriteAtlas} from './sprite-atlas';
import {enemyWarnings, type EnemyWarning} from './enemy-warning-model';
import {EnemyFeedbackModel,enemyFallPose,enemyRecoil,fallenSprite,type EnemyFall} from './enemy-feedback-model';
import {brittleIceVisual} from './brittle-ice-model';
import {drawBrittleIce} from './brittle-ice-view';
import {enemyRangedDetail} from './enemy-ranged-detail-model';
import {drawEnemyRangedDetail} from './enemy-ranged-detail-view';
import {guardCues} from './guard-cue-model';
import {drawGuardCues} from './guard-cue-view';
import {drawGiantJumpGuide} from './giant-jump-guide-view';
import {syrupDrop,syrupLanding,type SyrupDrop,type SyrupLanding} from './enemy-syrup-model';
export {enemyHeight} from './damage-model';

const fullTurn=Math.PI*2;
const inverted=new Set(['eliteKettle','eliteSesame','eliteSkewer','eliteTanghulu','eliteRoll']);
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;

/** Same expression selection as the original canvas renderer. */
export function enemyExpression(e:Enemy,time:number):string {
  const hurt=time-e.hurtAt<.16,low=e.hp<=e.maxHp*.35;
  if(isGuard(e.kind)&&e.kind!=='giantBun')return e.kind;
  if(e.kind==='onigiri'||e.kind==='siumai'||e.kind==='zongzi'){
    if(hurt)return e.kind+'Hurt';
    if(low)return e.kind+'Low';
    return e.alerted&&e.stunUntil<=time?e.kind+'Alert':e.kind;
  }
  if(e.kind==='giantBun'||e.kind==='bun'){
    if(hurt)return e.kind+'Hurt';
    if(low)return e.kind+'Low';
    if(e.kind==='giantBun')return e.kind;
  }
  if(e.phase==='warn'||e.phase==='dash'||(e.shotWarnUntil??0)>time||(e.volleyRemaining??0)>0)return e.kind;
  if(e.stunUntil>time||hurt||e.phase==='recover')return e.kind+'Curious';
  if(low)return e.kind+'Low';
  if(e.lureX!==undefined)return e.kind+'Grin';
  const mood=e.id%3;
  return mood===0?e.kind:mood===1?e.kind+'Grin':e.kind+'Curious';
}

export interface EnemyPose {lift:number;scaleX:number;scaleY:number;tilt:number}

/** Time-derived animation, including attack wind-up and jump, never mutates gameplay. */
export function enemyAttackPose(e:Enemy,time:number,reduceMotion:boolean):EnemyPose {
  const pose={lift:0,scaleX:1,scaleY:1,tilt:0};
  const j=e.jump,amount=reduceMotion?.38:1;
  if(e.guardCast){
    const mark=e.guardCast.marks.find(m=>time>=m.warnAt&&time<m.endAt);
    if(mark){
      const armed=time<mark.hitAt;
      const u=armed?clamp((time-mark.warnAt)/Math.max(.001,mark.hitAt-mark.warnAt),0,1):
        1-clamp((time-mark.hitAt)/Math.max(.001,mark.endAt-mark.hitAt),0,1);
      const brace=(armed?1:-.67)*u*amount;
      pose.tilt=-e.facing*.10*brace;
      pose.scaleX+=.07*brace;pose.scaleY-=.08*brace;
      if(mark.shape.kind==='fan')pose.tilt+=e.facing*.11*brace;
    }
  }else if(j){
    const u=clamp((time-j.startedAt)/(j.until-j.startedAt),0,1);
    if(j.phase==='flight'){
      const height=4*u*(1-u);
      pose.lift=giantJumpHeight(e,time)*amount;
      pose.scaleX-=.10*height*amount;pose.scaleY+=.14*height*amount;
      pose.tilt=e.facing*Math.sin(u*fullTurn)*.095*amount;
    }else{
      const squat=j.phase==='warn'?u:Math.max(0,1-(time-j.startedAt)/(j.hop===3?.98:.28));
      pose.scaleX+=squat*.23*amount;pose.scaleY-=squat*.31*amount;
    }
  }else if((e.kind==='box'||e.kind==='eliteCrab')&&(e.phase==='warn'||e.phase==='dash')){
    const warning=e.kind==='eliteCrab'?CONFIG.elites.crab.warning:CONFIG.dash.warning;
    const u=e.phase==='warn'?1-clamp((e.phaseUntil-time)/warning,0,1):1;
    pose.tilt=e.facing*.14*u*amount;pose.scaleY-=.1*u*amount;pose.scaleX+=.08*u*amount;
  }else if((e.kind==='bowl'||e.kind==='eliteKettle'||e.kind==='eliteSesame')&&(e.shotWarnUntil??0)>time){
    const warning=e.kind==='bowl'?CONFIG.ranged.warning:e.kind==='eliteKettle'?CONFIG.elites.kettle.warning:CONFIG.elites.sesame.warning;
    const u=clamp(1-((e.shotWarnUntil??time)-time)/warning,0,1);
    pose.tilt=-e.facing*.13*u*amount;pose.scaleY+=.05*u*amount;
  }else if(!reduceMotion&&e.kind!=='giantBun'&&e.stunUntil<=time&&(e.chilledUntil??0)<=time&&(e.frostUntil??0)<=time&&
    e.phase!=='recover'&&(e.volleyRemaining??0)===0){
    const pace=e.alerted?1.42:1;
    const phase=(time-e.spawnAt)*(e.kind==='bun'?7.6:e.kind==='box'?8.9:5.6)*pace+e.id*2.4;
    const wave=Math.sin(phase);
    const resting=(e.march&&!e.march.x&&!e.march.y)||
      (e.lureX!==undefined&&Math.hypot(e.lureX-e.x,(e.lureY??e.y)-e.y)<24);
    if(resting)pose.scaleY+=.016*Math.sin(time*2.8+e.id);
    else if(e.kind==='siumai'){
      const hop=siumaiHop(e,time);
      pose.lift=hop*(e.alerted?10:6.5);pose.scaleX+=.10-hop*.15;pose.scaleY+=hop*.16-.10;
    }else if(e.kind==='onigiri'){
      const roll=Math.sin((time-e.spawnAt)*7*pace+e.id);
      pose.tilt=e.facing*(roll*.18+.045);pose.lift=Math.abs(roll)*2;
    }else if(e.kind==='zongzi'){
      const sway=Math.sin((time-e.spawnAt)*4.9*pace+e.id);
      pose.tilt=e.facing*sway*.12;pose.lift=Math.abs(sway)*1.5;
    }else{
      const hop=Math.max(0,wave);
      pose.lift=hop*(e.kind==='bun'?5.4:e.kind==='box'?2:1.6)*pace;
      const squash=e.kind==='bun'?.055:.021;
      pose.scaleX-=wave*squash;pose.scaleY+=wave*squash;
      pose.tilt=e.facing*Math.cos(phase)*(e.kind==='box'?.077:e.kind==='bowl'?.048:.038);
    }
  }
  return pose;
}

interface EnemyNode {node:Node; sprite:Sprite; transform:UITransform; opacity:UIOpacity; image:string}
interface AuraNode {node:Node;opacity:UIOpacity;parts:Array<{node:Node;sprite:Sprite;transform:UITransform}>}
const rgba=(r:number,g:number,b:number,a=255)=>new Color(r,g,b,a);
const auraColors:Record<string,[string,string]>={
  giantBun:['#ffad26','#ffeb9b'],eliteCrab:['#fc493e','#ffb08a'],eliteKettle:['#19cca6','#b8ffe0'],
  eliteSesame:['#b25cff','#f4c5ff'],eliteSkewer:['#d67031','#ffe4a8'],eliteLotus:['#dc76a6','#ffe3ee'],
  eliteChili:['#ff352b','#ffe15f'],eliteTofu:['#6979d9','#dbe5ff'],eliteTanghulu:['#c93668','#ffd9b1'],eliteRoll:['#389c51','#d8ff9c'],
  epicHotpot:['#d83d24','#ffe495'],epicDragon:['#dc8724','#fff2b5'],epicOpera:['#199f95','#b8fff0'],
  epicPearl:['#a363cd','#f6d6ff'],epicSteamer:['#8eaa52','#f4ffca'],
};
const white=rgba(255,255,255),hurtTint=rgba(255,225,205);

/**
 * Enemy-only presentation layer for a 1280x720 centre-origin, Y-up UI world.
 * GameState remains authoritative and can be passed as a render-interpolated snapshot.
 * Ground warnings, actor sprites and simple status outlines are separate child layers.
 */
export class EnemyLayer {
  readonly node:Node;
  /** Independent sibling: the host must place it above actors and market signs. */
  readonly warningNode:Node;
  private readonly ground:Graphics;
  private readonly foreground:Graphics;
  private readonly syrup:Graphics;
  private readonly auras:Node;
  private readonly actors:Node;
  private readonly fallenActors:Node;
  private readonly status:Graphics;
  private readonly feedback=new EnemyFeedbackModel();
  private readonly live=new Map<number,EnemyNode>();
  private readonly pool:EnemyNode[]=[];
  private readonly liveAuras=new Map<number,AuraNode>();
  private readonly auraPool:AuraNode[]=[];
  private readonly fallen=new Map<number,{body:EnemyNode;ghost:EnemyNode}>();
  private readonly fallenPool:Array<{body:EnemyNode;ghost:EnemyNode}>=[];

  constructor(parent:Node,private readonly atlas:SpriteAtlas){
    this.node=this.makeNode('EnemyLayer',parent);
    this.ground=this.makeNode('EnemyGround',this.node).addComponent(Graphics);
    this.auras=this.makeNode('GuardAuras',this.node);
    this.actors=this.makeNode('EnemyActors',this.node);
    this.fallenActors=this.makeNode('FallenEnemies',this.node);
    this.status=this.makeNode('EnemyStatus',this.node).addComponent(Graphics);
    this.warningNode=this.makeNode('EnemyWarningOutlines',parent);
    this.syrup=this.makeNode('Sesame syrup drops',this.warningNode).addComponent(Graphics);
    this.foreground=this.makeNode('Warning outlines',this.warningNode).addComponent(Graphics);
  }

  events(events:readonly GameEvent[],time:number):void {this.feedback.events(events,time);}

  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    const {time}=state;
    this.ground.clear();this.status.clear();this.syrup.clear();this.foreground.clear();
    const present=new Set<number>();
    const sorted=[...state.enemies].sort((a,b)=>a.y-b.y||a.id-b.id);
    for(const e of sorted){
      present.add(e.id);
      let view=this.live.get(e.id);
      if(!view){view=this.pool.pop()??this.createEnemy();this.live.set(e.id,view);view.node.active=true;}
      this.drawGround(e,time,settings);
      for(const warning of enemyWarnings(e,time))this.drawOutline(warning);
      this.updateEnemy(view,e,state,settings.reduceMotion);
      if(isGuard(e.kind)&&time-e.spawnAt>=CONFIG.spawn.warning)this.updateAura(e,view,time,settings);
      view.node.setSiblingIndex(this.actors.children.length-1);
      const detail=enemyRangedDetail(e,time,state.enemyShots??[],enemyAttackPose(e,time,settings.reduceMotion),settings.reduceMotion);
      if(detail)drawEnemyRangedDetail(this.status,detail);
      this.drawStatus(e,time,settings.reduceMotion);
      const brittle=brittleIceVisual(e,time,state.market.upgrade,settings);
      if(brittle)drawBrittleIce(this.status,brittle,enemyAttackPose(e,time,settings.reduceMotion).lift);
      const drop=syrupDrop(e,time,enemyAttackPose(e,time,settings.reduceMotion),settings.reduceMotion);
      if(drop)this.drawSyrup(drop);
    }
    for(const [id,view] of this.live){
      if(present.has(id))continue;
      this.live.delete(id);view.node.active=false;this.pool.push(view);
    }
    for(const [id,aura] of this.liveAuras)if(!present.has(id)){
      this.liveAuras.delete(id);aura.node.active=false;this.auraPool.push(aura);
    }
    this.updateFalls(this.feedback.sync(state.enemies,time),time,settings);
  }

  reset():void {
    this.feedback.reset();
    for(const view of this.live.values()){view.node.active=false;this.pool.push(view);}this.live.clear();
    for(const aura of this.liveAuras.values()){aura.node.active=false;this.auraPool.push(aura);}this.liveAuras.clear();
    for(const pair of this.fallen.values()){pair.body.node.active=false;pair.ghost.node.active=false;this.fallenPool.push(pair);}this.fallen.clear();
    this.ground.clear();this.status.clear();this.syrup.clear();this.foreground.clear();
  }
  destroy():void {this.feedback.reset();this.live.clear();this.pool.length=0;this.liveAuras.clear();this.auraPool.length=0;this.fallen.clear();this.fallenPool.length=0;this.node.destroy();this.warningNode.destroy();}

  private makeNode(name:string,parent:Node):Node {
    const node=new Node(name);node.layer=parent.layer;node.addComponent(UITransform);parent.addChild(node);return node;
  }

  private drawSyrup(drop:SyrupDrop):void {
    const g=this.syrup,c=Math.cos(drop.angle),s=Math.sin(drop.angle),scale=drop.scale;
    const point=(x:number,y:number)=>({x:X(drop.x+(x*c-y*s)*scale),y:Y(drop.y+(x*s+y*c)*scale)});
    const move=(x:number,y:number)=>{const p=point(x,y);g.moveTo(p.x,p.y);};
    const cubic=(x1:number,y1:number,x2:number,y2:number,x3:number,y3:number)=>{
      const a=point(x1,y1),b=point(x2,y2),d=point(x3,y3);g.bezierCurveTo(a.x,a.y,b.x,b.y,d.x,d.y);
    };
    move(-16,0);cubic(-7,-1,-5,-9,2,-8);cubic(12,-7,13,7,2,8);cubic(-6,8,-8,1,-16,0);
    g.fillColor=rgba(178,105,62);g.strokeColor=rgba(255,207,133);g.lineWidth=2.2*scale;g.fill();g.stroke();
    const oval=(x:number,y:number,rx:number,ry:number,angle:number,fill:Color)=>{
      const cos=Math.cos(angle),sin=Math.sin(angle);
      for(let i=0;i<=20;i++){
        const a=i*fullTurn/20,px=x+Math.cos(a)*rx*cos-Math.sin(a)*ry*sin,py=y+Math.cos(a)*rx*sin+Math.sin(a)*ry*cos,p=point(px,py);
        if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);
      }
      g.close();g.fillColor=fill;g.fill();
    };
    oval(1,2,2.9,1.3,-.42,rgba(79,52,43));oval(4,-3,3,1.5,-.16,rgba(255,234,194));
  }

  private createEnemy(parent:Node=this.actors):EnemyNode {
    const node=this.makeNode('Enemy',parent);
    const transform=node.getComponent(UITransform)!;
    const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    const opacity=node.addComponent(UIOpacity);
    return {node,transform,sprite,opacity,image:''};
  }

  private updateEnemy(view:EnemyNode,e:Enemy,state:GameState,reduced:boolean):void {
    const {time}=state,age=time-e.spawnAt,sprite=enemyExpression(e,time);
    if(view.image!==sprite){view.sprite.spriteFrame=this.atlas.require(sprite);view.image=sprite;}
    const bun=e.kind==='bun'||e.kind==='giantBun';
    const height=enemyHeight(e.kind)*(bun&&e.hp<=e.maxHp*.35&&!sprite.endsWith('Hurt')?.84:1);
    const size=this.atlas.size(sprite),pose=enemyAttackPose(e,time,reduced);
    const recoil=enemyRecoil(this.feedback.contact(e.id,time),time,reduced);
    const tossAge=time-(e.tossAt??-Infinity);
    const toss=tossAge>=0&&tossAge<TOSS_DURATION&&!reduced?Math.sin(Math.PI*tossAge/TOSS_DURATION)*(e.tossHeight??0):0;
    const vortex=state.elementalFields?.find(f=>f.kind==='vortex'&&time>=f.bornAt&&time<f.releaseAt);
    const pulled=vortex&&age>=CONFIG.spawn.warning&&e.jump?.phase!=='flight'&&e.stunUntil>time;
    const swallowed=pulled&&vortex&&!reduced?Math.max(0,1-Math.hypot(e.x-vortex.x,e.y-vortex.y)/90):0;
    const flip=(inverted.has(sprite)?-1:1)*(e.facing<0?-1:1);
    view.transform.setContentSize(height*size.width/size.height,height);
    view.transform.setAnchorPoint(.5,0);
    view.node.setPosition(X(e.x+recoil.x),Y(e.y+recoil.y)+pose.lift+toss,0);
    view.node.setScale(flip*pose.scaleX*(1+recoil.squash)*(1-.55*swallowed),pose.scaleY*(1-recoil.squash)*(1-.55*swallowed),1);
    view.node.setRotationFromEuler(0,0,-(pose.tilt+recoil.tilt+swallowed*(e.id%2===0?.37:-.37))*180/Math.PI);
    view.sprite.color=time-e.hurtAt>=0&&time-e.hurtAt<.13?hurtTint:white;
    view.opacity.opacity=age<CONFIG.spawn.warning?Math.round(255*(.2+.6*Math.max(0,age)/CONFIG.spawn.warning)):255;
  }

  private updateAura(e:Enemy,view:EnemyNode,time:number,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    let aura=this.liveAuras.get(e.id);
    if(!aura){aura=this.auraPool.pop()??this.createAura();this.liveAuras.set(e.id,aura);aura.node.active=true;}
    const palette=auraColors[e.kind],frozen=(e.chilledUntil??0)>time||(e.frostUntil??0)>time;
    const still=settings.reduceMotion||frozen||e.stunUntil>time;
    const active=!!e.guardCast||e.phase==='warn'||e.phase==='dash'||e.jump?.phase==='warn'||e.jump?.phase==='flight'||(e.shotWarnUntil??0)>time;
    const flicker=still?1:1+.12*Math.sin(time*(active?7:4.1)+e.id*1.8);
    const h=view.transform.contentSize.height,w=view.transform.contentSize.width;
    aura.node.setPosition(view.node.position);aura.node.setScale(view.node.scale);aura.node.setRotation(view.node.rotation);
    aura.opacity.opacity=Math.round(view.opacity.opacity*(frozen?.48:active?1:.88));
    aura.parts.forEach((part,i)=>{
      const ring=i<4?.024:.011,angle=(i%4)*Math.PI/2+(i<4?Math.PI/4:0);
      part.sprite.spriteFrame=view.sprite.spriteFrame;part.sprite.color=new Color().fromHEX(palette[i<4?0:1]);
      part.transform.setContentSize(w,h);part.transform.setAnchorPoint(.5,0);
      part.node.setPosition(Math.cos(angle)*h*ring*flicker,Math.sin(angle)*h*ring*flicker);
    });
  }

  private createAura():AuraNode {
    const node=this.makeNode('Guard silhouette rim',this.auras),opacity=node.addComponent(UIOpacity);
    const parts=Array.from({length:8},()=>{
      const child=this.makeNode('Rim',node),transform=child.getComponent(UITransform)!,sprite=child.addComponent(Sprite);
      sprite.sizeMode=Sprite.SizeMode.CUSTOM;return {node:child,sprite,transform};
    });
    return {node,opacity,parts};
  }

  private updateFalls(falls:readonly EnemyFall[],time:number,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    const present=new Set<number>();
    for(const fall of falls){
      present.add(fall.id);let pair=this.fallen.get(fall.id);
      if(!pair){
        pair=this.fallenPool.pop();
        if(!pair){const ghost=this.createEnemy(this.fallenActors),body=this.createEnemy(this.fallenActors);pair={body,ghost};}
        this.fallen.set(fall.id,pair);
      }
      const pose=enemyFallPose(fall,time,settings.reduceMotion),image=fallenSprite(fall.kind,fall.source),frame=this.atlas.require(image);
      const size=this.atlas.size(image),h=enemyHeight(fall.kind),flip=(inverted.has(fall.kind)?-1:1)*(fall.facing<0?-1:1);
      const draw=(v:EnemyNode,x:number,y:number,alpha:number,scale:number,angle=pose.angle)=>{
        v.node.active=true;v.sprite.spriteFrame=frame;v.sprite.color=white;v.transform.setContentSize(h*size.width/size.height,h);
        v.transform.setAnchorPoint(.5,0);v.node.setPosition(X(x),Y(y));v.node.setScale(flip*scale,scale,1);
        v.node.setRotationFromEuler(0,0,-angle*180/Math.PI);v.opacity.opacity=Math.round(255*Math.max(0,Math.min(1,alpha)));
      };
      if(pose.ghost&&settings.quality==='standard'){
        const alpha=Math.max(0,1-(time-fall.at)/fall.duration),radius=12*alpha;
        this.ground.fillColor=rgba(35,24,29,Math.round(255*.21));this.ground.ellipse(X(pose.x),Y(pose.groundY+2),radius,radius*.32);this.ground.fill();
        draw(pair.ghost,pose.x-(pose.x-fall.x)*.22,pose.ghostY,pose.ghostAlpha,pose.scale*.94,pose.angle*.8);
      }else pair.ghost.node.active=false;
      draw(pair.body,pose.x,pose.y,pose.alpha,pose.scale);
    }
    for(const [id,pair] of this.fallen)if(!present.has(id)){
      this.fallen.delete(id);pair.body.node.active=false;pair.ghost.node.active=false;this.fallenPool.push(pair);
    }
  }

  private drawGround(e:Enemy,time:number,settings:Pick<Settings,'reduceMotion'|'quality'>):void {
    const reduced=settings.reduceMotion;
    const g=this.ground,age=time-e.spawnAt,pose=enemyAttackPose(e,time,reduced);
    const launchAge=time-(e.tossAt??-Infinity);
    const toss=launchAge>=0&&launchAge<TOSS_DURATION&&!reduced?Math.sin(Math.PI*launchAge/TOSS_DURATION)*(e.tossHeight??0):0;
    const shade=isGuard(e.kind)?e.radius*1.12:e.kind==='bowl'?26:18;
    const shadowScale=Math.max(.1,1-.003*(pose.lift+toss));
    const spawnAlpha=age<CONFIG.spawn.warning?.2+.6*Math.max(0,age)/CONFIG.spawn.warning:1;
    g.fillColor=rgba(56,36,39,Math.round(255*spawnAlpha*clamp(.24-.0014*(pose.lift+toss),0,1)));
    g.ellipse(X(e.x),Y(e.y),shade*shadowScale,shade*.31*shadowScale);g.fill();
    if(age<CONFIG.spawn.warning){
      const radius=isGuard(e.kind)?e.radius*1.65:25;
      g.fillColor=rgba(56,36,45,85);g.strokeColor=rgba(255,189,121);g.lineWidth=3;
      g.ellipse(X(e.x),Y(e.y),radius,radius*.48);g.fill();g.stroke();
      if(isEpic(e.kind)){g.strokeColor=rgba(255,231,165);g.lineWidth=2;g.ellipse(X(e.x),Y(e.y),radius+7,radius*.48+5);g.stroke();}
      return;
    }
    for(const warning of enemyWarnings(e,time)){
      if(warning.giant&&e.jump){
        const j=e.jump,r=warning.shape.radius;
        drawGiantJumpGuide(g,e.x,e.y,j);
        const start=j.hop===3?j.gapAngle+CONFIG.giant.gapHalfAngle:0;
        const end=j.hop===3?j.gapAngle+fullTurn-CONFIG.giant.gapHalfAngle:fullTurn;
        const progress=clamp((time-j.startedAt)/(j.until-j.startedAt),0,1);
        g.fillColor=rgba(231,100,61,Math.round(255*(.15+.16*progress)));
        g.moveTo(X(j.target.x),Y(j.target.y));this.arc(g,j.target.x,j.target.y,r,start,end,true);g.close();g.fill();
        g.strokeColor=rgba(119,57,52,220);g.lineWidth=7;this.arc(g,j.target.x,j.target.y,r,start,end);g.stroke();
        g.strokeColor=rgba(255,183,128);g.lineWidth=3;this.arc(g,j.target.x,j.target.y,r,start,end);g.stroke();
      }else this.guardShape(warning.shape,warning.live,warning.summon);
    }
    drawGuardCues(g,guardCues(e,time,settings));
    const landing=syrupLanding(e,time,reduced);
    if(landing?.stage==='impact')this.drawSyrupImpact(landing,settings.quality==='simple');
  }

  private drawSyrupImpact(landing:Extract<SyrupLanding,{stage:'impact'}>,simple:boolean):void {
    const g=this.ground,{x,y,radius,alpha}=landing;
    g.strokeColor=rgba(255,199,131,Math.round(194*alpha));g.lineWidth=3;
    g.circle(X(x),Y(y),CONFIG.elites.sesame.radius);g.stroke();
    for(let i=0;i<=40;i++){
      const a=i*fullTurn/40,r=radius*(.80+.11*Math.cos(a*5+.6)+.07*Math.cos(a*3));
      if(i)g.lineTo(X(x+Math.cos(a)*r),Y(y+Math.sin(a)*r));else g.moveTo(X(x+Math.cos(a)*r),Y(y+Math.sin(a)*r));
    }
    g.close();g.fillColor=rgba(149,82,52,Math.round(188*alpha));g.strokeColor=rgba(238,181,116,Math.round(255*alpha));
    g.lineWidth=2.4;g.fill();g.stroke();
    const count=simple?5:9;
    for(let i=0;i<count;i++){
      const a=i*fullTurn/count+.29,c=Math.cos(a),s=Math.sin(a),cx=x+c*radius*.94,cy=y+s*radius*.94;
      for(let j=0;j<=12;j++){
        const t=j*fullTurn/12,u=5*Math.cos(t),v=2.3*Math.sin(t),px=cx+u*c-v*s,py=cy+u*s+v*c;
        if(j)g.lineTo(X(px),Y(py));else g.moveTo(X(px),Y(py));
      }
      g.close();g.fillColor=i%2?rgba(68,46,41,Math.round(255*alpha)):rgba(255,218,154,Math.round(255*alpha));g.fill();
    }
  }

  /** A thin contour remains visible over props without obscuring their contents. */
  private drawOutline(warning:EnemyWarning):void {
    const g=this.foreground,s=warning.shape;
    g.strokeColor=warning.summon?rgba(179,255,222,245):rgba(255,233,185,250);
    g.lineWidth=warning.live?3:2;
    if(s.kind==='lane'){
      const dx=s.to.x-s.from.x,dy=s.to.y-s.from.y,angle=Math.atan2(dy,dx),r=s.radius;
      if(Math.hypot(dx,dy)<.001){g.circle(X(s.from.x),Y(s.from.y),r);g.stroke();return;}
      this.arc(g,s.to.x,s.to.y,r,angle-Math.PI/2,angle+Math.PI/2);
      this.arc(g,s.from.x,s.from.y,r,angle+Math.PI/2,angle+3*Math.PI/2,true);
      g.close();g.stroke();return;
    }
    if(s.kind==='ring'){
      g.circle(X(s.center.x),Y(s.center.y),s.radius);g.stroke();
      if(s.inner>0){g.circle(X(s.center.x),Y(s.center.y),s.inner);g.stroke();}return;
    }
    if(s.kind==='disc'){g.circle(X(s.center.x),Y(s.center.y),s.radius);g.stroke();return;}
    if(s.kind==='fan'){
      g.moveTo(X(s.center.x),Y(s.center.y));
      this.arc(g,s.center.x,s.center.y,s.radius,s.angle-s.halfAngle,s.angle+s.halfAngle,true);g.close();g.stroke();
    }
  }

  private lane(x1:number,y1:number,x2:number,y2:number,radius:number,live:boolean):void {
    const g=this.ground,dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
    if(len<.001)return;
    const nx=-dy/len*radius,ny=dx/len*radius;
    g.fillColor=live?rgba(231,103,79,150):rgba(237,109,80,85);
    g.strokeColor=rgba(255,205,155,220);g.lineWidth=2;
    g.moveTo(X(x1+nx),Y(y1+ny));g.lineTo(X(x2+nx),Y(y2+ny));
    g.lineTo(X(x2-nx),Y(y2-ny));g.lineTo(X(x1-nx),Y(y1-ny));g.close();g.fill();g.stroke();
    // Guard hitboxes use rounded ends. Show the full footprint instead of hiding
    // the collision area just beyond either end of the rectangular corridor.
    g.circle(X(x1),Y(y1),radius);g.fill();g.stroke();
    g.circle(X(x2),Y(y2),radius);g.fill();g.stroke();
  }

  private guardShape(shape:GuardShape,live:boolean,summon:boolean):void {
    const g=this.ground;
    if(shape.kind==='lane'){this.lane(shape.from.x,shape.from.y,shape.to.x,shape.to.y,shape.radius,live);return;}
    if(shape.kind==='ring'){
      // Stroke the annulus only: the inner disc must remain a safe region.
      const width=Math.max(0,shape.radius-shape.inner),radius=shape.inner+width/2;
      if(width<=0)return;
      g.strokeColor=summon?rgba(79,167,139,live?156:54):rgba(231,103,79,live?156:54);g.lineWidth=width;
      g.circle(X(shape.center.x),Y(shape.center.y),radius);g.stroke();
      g.strokeColor=rgba(255,205,155,240);g.lineWidth=2;
      g.circle(X(shape.center.x),Y(shape.center.y),shape.radius);g.stroke();
      if(shape.inner>0){g.circle(X(shape.center.x),Y(shape.center.y),shape.inner);g.stroke();}
      return;
    }
    const start=shape.kind==='fan'?shape.angle-shape.halfAngle:0;
    const end=shape.kind==='fan'?shape.angle+shape.halfAngle:fullTurn;
    g.fillColor=summon?rgba(79,167,139,live?156:54):rgba(231,103,79,live?156:54);
    g.strokeColor=rgba(255,205,155,240);g.lineWidth=live?3:2;
    if(shape.kind==='fan')g.moveTo(X(shape.center.x),Y(shape.center.y));
    this.arc(g,shape.center.x,shape.center.y,shape.radius,start,end,shape.kind==='fan');
    g.close();g.fill();g.stroke();
  }

  private arc(g:Graphics,x:number,y:number,r:number,start:number,end:number,connected=false):void {
    const steps=Math.max(4,Math.ceil(Math.abs(end-start)*12));
    for(let i=0;i<=steps;i++){
      const a=start+(end-start)*i/steps,px=X(x+Math.cos(a)*r),py=Y(y+Math.sin(a)*r);
      if(i===0&&!connected)g.moveTo(px,py);else g.lineTo(px,py);
    }
  }

  private drawStatus(e:Enemy,time:number,reduced:boolean):void {
    if(time-e.spawnAt<CONFIG.spawn.warning)return;
    const g=this.status,pose=enemyAttackPose(e,time,reduced),height=enemyHeight(e.kind),x=X(e.x),feet=Y(e.y)+pose.lift;
    const frozen=(e.chilledUntil??0)>time||(e.frostUntil??0)>time;
    if(frozen){
      g.fillColor=rgba(125,229,255,64);g.strokeColor=rgba(200,249,255);g.lineWidth=2;
      g.moveTo(x-height*.37,feet+height*.02);g.lineTo(x-height*.51,feet+height*.36);
      g.lineTo(x-height*.34,feet+height*.84);g.lineTo(x+height*.04,feet+height*1.05);
      g.lineTo(x+height*.39,feet+height*.79);g.lineTo(x+height*.5,feet+height*.32);
      g.lineTo(x+height*.27,feet-height*.01);g.close();g.fill();g.stroke();
    }else if(e.slowUntil>time){
      g.fillColor=rgba(138,242,216,37);g.strokeColor=rgba(154,248,227);g.lineWidth=2;
      g.ellipse(x,feet+height*.45,height*.43,height*.54);g.fill();g.stroke();
    }
    if(e.stunUntil>time&&!frozen){
      g.fillColor=rgba(255,242,161);const phase=reduced?0:time*4;
      for(let i=0;i<3;i++){const a=phase+i*fullTurn/3;g.circle(x+Math.cos(a)*18,feet+height+12+Math.sin(a)*3,2.6);g.fill();}
    }
    if((e.poisonUntil??0)>time){
      g.strokeColor=rgba(137,200,105,210);g.lineWidth=3;g.ellipse(x,feet+height*.42,height*.43,height*.49);g.stroke();
    }
  }
}

// Still simplified: exact weapon-specific body deformation, gradient/glow aura,
// some attack props, pursuit trails, floor clipping, ordinary thaw cracks and stun bell.
// Validate Creator rendering and representative device performance before
// claiming full parity with the canvas renderer.
