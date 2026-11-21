import {WEAPON_KINDS, type GameEvent, type SkillKind, type WeaponKind} from '../domain/shared/types';
import {EXPRESS} from '../domain/core/ultimates';

export type AudioScene='home'|'play'|'paused'|'silent';
export type SoundEvent=GameEvent|'ui'|'start'|'record';
export interface AudioCue {name:string;group:'combat'|'skill';gain?:number;delay?:number;stopCombat?:boolean;stopAll?:boolean;duck?:boolean}
interface Contact {count:number;lastCueAt:number;firstHitAt:number}

/** Event routing and throttles adapted from the original Web Audio player.
 * now is a monotonic wall-clock value in seconds; damage clustering retains
 * simulation time to preserve ordering when multiple events arrive together. */
export class CuePolicy {
  scene:AudioScene='home';
  private last=new Map<string,number>();
  private casts=new Map<SkillKind,number>();
  private contacts=new Map<number,Contact>();
  private damageTime=0;private recentKills:number[]=[];private lastCrowd=-Infinity;
  private coinNote=0;private lastWeaponHit=-Infinity;
  setScene(scene:AudioScene):void {
    if(this.scene===scene)return;this.scene=scene;this.contacts.clear();this.casts.clear();this.recentKills=[];this.lastCrowd=-Infinity;this.coinNote=0;
    this.last.delete('frostShatter');this.last.delete('dispatchClear');this.last.delete('fan');this.lastWeaponHit=-Infinity;
  }
  private limited(key:string,now:number,interval:number):boolean {
    if(now-(this.last.get(key)??-Infinity)<interval)return true;this.last.set(key,now);return false;
  }
  select(event:SoundEvent,now:number):AudioCue|null {
    if(this.scene==='silent')return null;
    if(event==='ui')return this.limited('ui',now,.075)?null:{name:'ui',group:'combat'};
    if(event==='start'||event==='record')return {name:event,group:'combat'};
    switch(event.type){
      case 'market':return {name:event.action==='open'?(event.group==='final'?'market_final':'market_open'):`market_${event.action}`,group:'combat'};
      case 'frostShatter':return this.scene!=='play'||this.limited('frostShatter',now,.075)?null:{name:'frostShatter',group:'skill'};
      case 'iceShards':return this.scene==='play'?{name:'iceShards',group:'skill'}:null;
      case 'dispatchClear':return this.scene!=='play'||this.limited('dispatchClear',now,.12)?null:{name:'dispatchClear',group:'skill'};
      case 'dash':return this.scene!=='play'||this.limited('dash',now,.15)?null:{name:'dash',group:'combat'};
      case 'enemyShot':return this.limited('enemyShot',now,.08)?null:{name:'enemyShot',group:'combat'};
      case 'giantLand':return {name:event.hop===3?'giant_3':'giant_1',group:'combat'};
      case 'elementalBurst':return this.scene==='play'?{name:`elemental_${event.kind}`,group:'skill',duck:true}:null;
      case 'guardBeat':return this.scene==='play'?{name:event.beat==='summon'?'guard_summon':`guard_${event.kind}`,group:'skill'}:null;
      case 'ultimateBeat':{
        if(this.scene!=='play')return null;
        const delivered=event.kind==='express'&&event.beat%EXPRESS.legsPerOrder===0;
        const name=event.kind==='express'?`ultimate_express_${delivered?event.beat:1}`:`ultimate_${event.kind}`;
        return {name,group:'skill',duck:event.kind!=='express'||delivered};
      }
      case 'kill':{
        const weaponKill=WEAPON_KINDS.includes(event.source as WeaponKind)&&now-this.lastWeaponHit<.09;
        this.recentKills=this.recentKills.filter(time=>time>=this.damageTime-.15);this.recentKills.push(this.damageTime);
        if(this.recentKills.length>=3&&this.damageTime-this.lastCrowd>.28){this.lastCrowd=this.damageTime;this.last.set('kill',now);return {name:'kill_crowd',group:'combat',gain:weaponKill?.58:1};}
        if(this.damageTime-this.lastCrowd<.15||this.limited('kill',now,.055))return null;
        return {name:event.kind==='bowl'?'kill_bowl':'kill',group:'combat',gain:weaponKill?.58:1,
          delay:weaponKill&&(event.source==='tongs'||event.source==='chopsticks')?.035:0};
      }
      case 'warn':return this.limited('warn',now,.18)?null:{name:'warn',group:'combat'};
      case 'pickup':
        if(event.kind==='fan')return this.scene==='play'?{name:'pickup_fan',group:'skill'}:null;
        return this.limited('pickup',now,.06)?null:{name:'pickup',group:'combat'};
      case 'coin':{
        const previous=this.last.get('coin')??-Infinity,gap=now-previous;if(gap<.075)return null;
        this.coinNote=gap>.42?0:(this.coinNote+1)%5;this.last.set('coin',now);
        return {name:`coin_${event.amount>1?'large_':''}${this.coinNote}`,group:'combat'};
      }
      case 'weapon':return {name:'weapon',group:'combat',stopCombat:true};
      case 'attack':return this.scene!=='play'||this.limited('attack',now,.035)?null:{name:`attack_${event.kind}`,group:'combat'};
      case 'damage':{
        if(event.amount<=0||(this.scene!=='play'&&event.victimId!==0))return null;
        if(event.time<this.damageTime){this.recentKills=[];this.lastCrowd=-Infinity;this.contacts.clear();}this.damageTime=event.time;
        if(event.victimId===0)return {name:'damage_player',group:'combat',stopCombat:true};
        if(event.source==='fan'){
          const prev=this.last.get('fan')??-Infinity;if(now-prev<.14)return null;this.last.set('fan',now);
          const castAt=this.casts.get('fan')??-Infinity,first=prev<castAt;
          return {name:first?'damage_fan_first':'damage_fan',group:'combat',delay:first?Math.max(0,castAt+.058-now):0};
        }
        if(event.source==='poison')return this.limited('hit',now,.16)?null:{name:'damage_poison',group:'combat'};
        if(WEAPON_KINDS.includes(event.source as WeaponKind)){
          if((event.burstIndex??1)!==1)return null;
          if(event.attackId!==undefined&&(event.source==='tongs'||event.source==='chopsticks')){
            for(const [id,contact] of this.contacts)if(event.time-contact.firstHitAt>1)this.contacts.delete(id);
            const contact=this.contacts.get(event.attackId)??{count:0,lastCueAt:-Infinity,firstHitAt:event.time};
            if(contact.count>=3||(event.source==='chopsticks'&&contact.count===2&&event.time-contact.firstHitAt<.14))return null;
            contact.count++;contact.lastCueAt=Math.max(now,contact.lastCueAt+.038);this.contacts.set(event.attackId,contact);this.lastWeaponHit=now;
            return {name:`impact_${event.source}${contact.count===1?'':`_${contact.count}`}`,group:'combat',delay:contact.lastCueAt-now};
          }
          if(now-this.lastWeaponHit<.085)return null;this.lastWeaponHit=now;return {name:`impact_${event.source}`,group:'combat'};
        }
        return this.limited('hit',now,.065)?null:{name:event.source==='skate'?'damage_skate':'damage_generic',group:'combat'};
      }
      case 'defend':return {name:`defend_${event.kind}`,group:'combat',stopCombat:true};
      case 'heal':return event.amount>0?{name:'heal',group:'combat'}:null;
      case 'skill':{
        if(this.scene!=='play'||now-(this.casts.get(event.kind)??-Infinity)<.09)return null;
        this.casts.set(event.kind,now);if(event.kind==='fan')this.last.delete('fan');
        return {name:`skill_${event.kind}`,group:'skill',duck:true,delay:event.kind==='fan'&&event.pickupFrom?.026:0};
      }
      case 'fail':return {name:'fail',group:'combat',stopAll:true};
      case 'wave':return {name:'wave',group:'combat'};
      case 'stage':return {name:'stage',group:'combat'};
      case 'skillEnd':return this.scene==='play'&&['skate','bubble','heat','stamp','hook','dispatch'].includes(event.kind)?{name:`end_${event.kind}`,group:'skill'}:null;
      default:return null;
    }
  }
}
