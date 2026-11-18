export type EnemyKind='bun'|'box'|'bowl';
export type WeaponKind='tongs'|'bag'|'chopsticks'|'spirit'|'knife'|'tray'|'umbrella'|'sword'|'lunchbox'|'talisman';
export type SkillKind='fan'|'skate'|'soda'|'lure'|'bubble'|'cones'|'bell'|'route'|'hook'|'heat'|'dispatch'|'stamp'|'supply';
export type DamageSource=WeaponKind|SkillKind|EnemyKind|'dash';
export interface Vec {x:number;y:number}
export interface Player extends Vec {
  px:number;py:number;vx:number;vy:number;facing:number;radius:number;skateUntil:number;
  hp:number;maxHp:number;invulnerableUntil:number;hurtAt:number;bubbleUntil:number;heatUntil:number;stampUntil:number;moveDirection:Vec;sprintTime?:number;sprintMultiplier?:number;sprintDirection?:Vec;dashUntil?:number;dashReadyAt?:number;dashDirection?:Vec;
}
export interface Enemy extends Vec {
  id:number;kind:EnemyKind;px:number;py:number;radius:number;spawnAt:number;slowUntil:number;
  phase:'chase'|'warn'|'dash'|'recover';phaseUntil:number;dashX:number;dashY:number;facing:number;
  hp:number;maxHp:number;hurtAt:number;stunUntil:number;stunStartedAt:number;bellResistUntil:number;contactSuppressedUntil:number;skateHitAt:number;
  lureX?:number;lureY?:number;wanderAngle?:number;wanderUntil?:number;shotReadyAt?:number;shotWarnUntil?:number;shotAngle?:number;
}
export interface Pickup extends Vec {id:number;kind:SkillKind;radius:number;bornAt:number;readyAt?:number;expiresAt?:number;groupId?:number;pulledUntil?:number;disabledUntil?:number;retiringUntil?:number}
export interface WeaponDrop extends Vec {id:number;kind:WeaponKind;radius:number;bornAt:number;expiresAt:number;readyAt:number;returnDrop:boolean;leftPickupCircle:boolean}
export interface WeaponAttack {id:number;kind:WeaponKind;phase:'windup'|'active'|'recovery';startedAt:number;releaseAt:number;endsAt:number;angle:number;targetId:number;hitIds:number[];blocked:boolean}
export interface WeaponState {kind:WeaponKind;readyAt:number;equippedAt:number;targetId:number|null;attack:WeaponAttack|null}
export interface Projectile extends Vec {
  id:number;attackId:number;kind:WeaponKind;px:number;py:number;vx:number;vy:number;radius:number;
  originX:number;originY:number;targetX:number;targetY:number;bornAt:number;expiresAt:number;
  travelled:number;maxDistance:number;phase:'out'|'return'|'flight'|'chain';hitIds:number[];phaseHitIds:number[];targetId:number;retargets:number;nextHitAt:number;hits:number;
}
export interface EnemyShot extends Vec {id:number;ownerId:number;px:number;py:number;vx:number;vy:number;radius:number;damage:number;bornAt:number;expiresAt:number}
export interface Zone extends Vec {id:number;kind:'lure'|'cone'|'route'|'supply';radius:number;bornAt:number;expiresAt:number;angle:number;length:number;width:number;hp:number;groupId?:number}
export interface SkillEffects {dispatchUntil:number;dispatchStartedAt:number;dispatchCooldownUntil:number;pendingSupplyAt:number;pendingSupplyUntil:number;supplyGroupId:number;[key:string]:number}
export type GameEvent=
  {type:'pickup';kind:SkillKind;x:number;y:number}|{type:'kill';kind:EnemyKind;x:number;y:number;points:number;victimId?:number}|
  {type:'fail';kind:EnemyKind;x:number;y:number;source?:DamageSource;amount?:number}|{type:'warn';x:number;y:number}|
  {type:'spawn';x:number;y:number}|{type:'stage';stage:number}|{type:'skillEnd';kind:SkillKind}|
  {type:'damage';id:number;victimId:number;source:DamageSource;amount:number;nominal:number;x:number;y:number;time:number;burstIndex?:number;burstCount?:number}|
  {type:'heal';id:number;amount:number;x:number;y:number}|{type:'defend';kind:'umbrella'|'bubble';x:number;y:number;victimId:number}|
  {type:'weapon';kind:WeaponKind;previous:WeaponKind;x:number;y:number}|{type:'attack';id:number;kind:WeaponKind;x:number;y:number;angle:number}|
  {type:'skill';kind:SkillKind;x:number;y:number}|{type:'notice';message:string}|{type:'dash';x:number;y:number;angle:number}|{type:'enemyShot';x:number;y:number;angle:number};
export interface GameState {time:number;score:number;kills:number;stage:number;ended:boolean;cause:EnemyKind|null;player:Player;enemies:Enemy[];pickups:Pickup[];seed:number;practice:boolean;weapon:WeaponState;projectiles:Projectile[];enemyShots?:EnemyShot[];weaponDrops:WeaponDrop[];zones:Zone[];effects:SkillEffects;lastDamage:DamageSource|null;lastDamageAmount:number}
export interface Settings {mode:'joystick'|'tilt';joystickSize:'small'|'medium'|'large';hand:'left'|'right';sensitivity:'low'|'medium'|'high';music:number;sfx:number;muted:boolean;reduceMotion:boolean;shake:boolean;quality:'standard'|'simple'}
export const DEFAULT_SETTINGS:Settings={mode:'joystick',joystickSize:'medium',hand:'left',sensitivity:'medium',music:0.35,sfx:0.7,muted:false,reduceMotion:false,shake:true,quality:'standard'};
export interface BestRecord {score:number;time:number;rulesVersion:string;date:string}
export interface SaveData {version:1;settings:Settings;best:BestRecord|null;tutorialSeen:boolean}
export const RULES_VERSION='night-market-3.0';
export const ENEMY_NAMES:Record<EnemyKind,string>={bun:'包子怪',box:'外卖盒怪',bowl:'大碗面怪'};
export const WEAPON_NAMES:Record<WeaponKind,string>={tongs:'伸缩取餐夹',bag:'纸袋气炮',chopsticks:'飞筷匣',spirit:'汤灵保温壶',knife:'拆箱快刀',tray:'回旋餐盘',umbrella:'折叠配送伞',sword:'签收尺剑',lunchbox:'弹射餐盒',talisman:'派单符册'};
export const SKILL_NAMES:Record<SkillKind,string>={fan:'旋风电扇',skate:'滑板环绕',soda:'汽水缓速',lure:'试吃保温盒',bubble:'气泡缓冲卷',cones:'三联反光路锥',bell:'到站手铃',route:'导航纸地图',hook:'伸缩取餐钩',heat:'加热餐包',dispatch:'派单终端',stamp:'加急印章',supply:'补给扫码券'};
export const WEAPON_KINDS=Object.keys(WEAPON_NAMES) as WeaponKind[];
export const SKILL_KINDS=Object.keys(SKILL_NAMES) as SkillKind[];

