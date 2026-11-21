import {CONFIG} from '../domain/core/config';
import {isOnPaperRoute} from '../domain/core/geometry';
import {EXPRESS, expressCast} from '../domain/core/ultimates';
import {WEAPONS} from '../domain/core/weapons';
import {ENEMY_NAMES, isElite, isEpic, type GameState} from '../domain/shared/types';
import {SKILL_GUIDE, WEAPON_GUIDE} from './catalog';
import type {HudState} from './game-ui';

/** A read-only adapter; the fixed-step simulation remains the only authority.
 * Mirrors the existing web HUD's visible labels, timers and wave priorities. */
export function hudFromState(state:GameState,practiceSpeed=1):HudState {
  const waveEnd=state.waveStartedAt+CONFIG.waves.transition;
  const showingWave=state.wave>=2&&state.time<waveEnd;
  const offer=state.market.offer;
  const boss=state.enemies.find(enemy=>enemy.hp>0&&isEpic(enemy.kind));
  let waveMessage='';
  if(showingWave)waveMessage=`WAVE ${state.wave}`;
  else if(state.eliteWave===state.wave&&state.enemies.some(enemy=>enemy.hp>0&&isElite(enemy.kind))){
    waveMessage='守关精英 · '+state.enemies.filter(enemy=>enemy.hp>0&&isElite(enemy.kind)).map(enemy=>ENEMY_NAMES[enemy.kind]).join('、');
  }else if(offer){
    const openedDuringIntro=state.wave>=2&&offer.openedAt>=state.waveStartedAt-1e-8&&offer.openedAt<=waveEnd;
    const introStart=openedDuringIntro?waveEnd:offer.openedAt;
    if(state.time<introStart+2.8)waveMessage=offer.group==='final'?'收摊铃响 · 最后一单':'两家摊位等你接单';
  }
  const zones=state.zones.filter(zone=>zone.expiresAt>state.time);
  const duration=(kind:'route'|'cone'|'lure')=>Math.max(0,...zones.filter(zone=>zone.kind===kind).map(zone=>zone.expiresAt-state.time));
  const statuses:Array<{kind:string;label:string;seconds:number;active:boolean}>=[];
  const add=(kind:string,label:string,seconds:number,active=true)=>{if(seconds>0)statuses.push({kind,label,seconds,active});};
  const parcel=expressCast(state);
  if(parcel){
    const order=Math.min(EXPRESS.legs/EXPRESS.legsPerOrder,1+Math.floor(Math.max(0,parcel.landings.length-1)/EXPRESS.legsPerOrder));
    add('express',`急送第 ${order} 单`,parcel.expiresAt-EXPRESS.fade-state.time);
  }
  add('bubble','防撞×1',state.player.bubbleUntil-state.time);add('skate','滑板环绕',state.player.skateUntil-state.time);
  add('stamp','印章无敌',state.player.stampUntil-state.time);add('hook','钩索回收',state.effects.hookUntil-state.time);
  for(const field of state.elementalFields??[])add(field.kind,SKILL_GUIDE[field.kind].role,field.releaseAt-state.time);
  const inRoute=zones.some(zone=>isOnPaperRoute(state.player,zone,state.time));
  add('route',inRoute?`移速 +${Math.round((CONFIG.skills.route.speedMultiplier-1)*100)}%`:'踏上路线加速',duration('route'),inRoute);
  add('dispatch','增援暂停',state.effects.dispatchUntil-state.time);add('cones',`路锥×${zones.filter(zone=>zone.kind==='cone').length}`,duration('cone'));
  add('lure','诱饵',duration('lure'));
  const supply=state.pickups.find(item=>item.groupId&&!item.retiringUntil);
  if(supply)add('supply','补给选一',(supply.expiresAt??0)-state.time);
  add('heat','武器急速',state.player.heatUntil-state.time);
  const remaining=Math.max(0,state.weapon.readyAt-state.time);
  const upgrade=state.market.upgrade;
  return {
    kills:state.kills,coins:state.collectedCoins,wave:state.wave,time:state.time,
    health:state.player.hp,maxHealth:state.player.maxHp,weaponName:WEAPON_GUIDE[state.weapon.kind].short,weaponKind:state.weapon.kind,
    dashReadyAt:state.player.dashReadyAt??0,dashUntil:state.player.dashUntil??0,
    orders:state.market.completed,closingSettled:state.market.closing==='settled',practice:state.practice,
    cause:state.cause?ENEMY_NAMES[state.cause]:undefined,lastDamageAmount:state.lastDamageAmount,
    upgradeName:upgrade==='frost'?'碎冰箱':upgrade==='brine'?'泡菜箱':undefined,
    upgradeDetail:upgrade==='frost'?'冲刺撞碎带裂纹的冻怪':upgrade==='brine'?'让回旋餐盘飞过毒雾':undefined,
    boss:boss?{name:ENEMY_NAMES[boss.kind],health:boss.hp,maxHealth:boss.maxHp,move:boss.guardCast?.name}:null,
    waveMessage,stageLabel:state.practice&&practiceSpeed===.5?'0.5× 慢放':'',
    combo:state.comboUntil>state.time?state.combo:0,comboRemaining:Math.max(0,state.comboUntil-state.time),statuses:statuses.slice(0,6),
    sprintMultiplier:state.player.sprintMultiplier??1,
    weaponReady:Math.max(0,Math.min(1,1-remaining/WEAPONS[state.weapon.kind].cooldown)),
  };
}
