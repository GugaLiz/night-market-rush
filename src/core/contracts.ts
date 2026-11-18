import type {DamageSource,Enemy,GameEvent,GameState,Pickup,SkillKind,Vec} from '../shared/types';
/** All mutation helpers operate on the same simulation and emit actual, deduplicated results. */
export interface CombatContext {
  damage(enemy:Enemy,amount:number,source:DamageSource):number;
  emit(event:GameEvent):void;
  id():number;
  random():number;
  push(enemy:Enemy,origin:Vec,distance:number):void;
  active(enemy:Enemy):boolean;
  spawnPickup(kind:SkillKind,position:Vec,extra?:Partial<Pickup>):Pickup|null;
}
/** Skill module exports activateSkill(state,kind,origin,ctx), updateSkills(state,dt,ctx).
 * updateSkills runs after enemy motion, before pickups and player contact.
 * It may assign enemy.lureX/lureY for the next movement step. Route speed is computed
 * by Game from live route zones (angle/length/width). Pickup gating reads readyAt,
 * expiresAt, disabledUntil and retiringUntil. Supply groups atomically retire siblings.
 */
export type SkillActivator=(state:GameState,kind:SkillKind,origin:Vec,ctx:CombatContext)=>void;
