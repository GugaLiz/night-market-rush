import type {SkillKind, WeaponKind} from '../shared/types';
import {CONFIG} from '../core/config';
import {MELEE_WEAPONS} from '../core/melee';
import {RANGED_HITS, WEAPONS} from '../core/weapons';

export interface CatalogEntry {short:string;role:string;description:string;detail:string}
const weaponDetail=(kind:WeaponKind,extra='')=>{const w=WEAPONS[kind];return `${w.damage} 首次命中伤害 · 冷却 ${w.cooldown.toFixed(2)} 秒 · 前摇 ${w.windup.toFixed(2)} 秒${extra?` · ${extra}`:''}`;};
export const WEAPON_GUIDE:Record<WeaponKind,CatalogEntry>={
  tongs:{short:'取餐夹',role:'双弧夹风',description:'取餐夹交替正反手挥动，夹口扫出两道金色气浪。贴身和远处的怪都能打到，一挥最多打七只。',detail:weaponDetail('tongs',`挥角 ${MELEE_WEAPONS.tongs.sweep}° · 气浪最远 ${WEAPONS.tongs.range}`)},
  bag:{short:'纸袋气炮',role:'九路散射',description:'一压纸袋，九股纸风扇形铺开。每股打中一只便散去，同一只怪每轮受击一次。',detail:weaponDetail('bag',`射程 ${WEAPONS.bag.range} · 张角 144°`)},
  chopsticks:{short:'飞筷匣',role:'五路贯穿',description:'五支飞筷排成扇面，每支最多穿过七只，逐只衰减。同轮共可击中十四只。',detail:weaponDetail('chopsticks',`射程 ${WEAPONS.chopsticks.range} · 张角 84° · 后续 ${RANGED_HITS.chopsticks.slice(1).join(" / ")}`)},
  spirit:{short:'汤灵壶',role:'三路寻客',description:'三股汤灵分头飞向前方和两侧，各自寻找目标。击中后能再跳向一只附近的敌人。',detail:weaponDetail('spirit',`首段索敌距离 ${WEAPONS.spirit.range} · 跳转距离 ${RANGED_HITS.spiritBounce} · 第二目标 ${RANGED_HITS.spirit[1]}`)},
  knife:{short:'拆箱快刀',role:'封签快斩',description:'短刀从肩后快速划过，带出一道薄而锋利的封签切风，一挥最多削中十只。',detail:weaponDetail('knife',`挥角 ${MELEE_WEAPONS.knife.sweep}° · 气浪最远 ${WEAPONS.knife.range}`)},
  tray:{short:'回旋餐盘',role:'分盘回收',description:'三只餐盘铺向左、中、右，飞至尽头或场边后回到外卖员手中。移动可以改变回程路线。每程最多打九只。',detail:weaponDetail('tray',`去程 ${WEAPONS.tray.range} · 张角 88° · 回程伤害 ${RANGED_HITS.trayReturn}`)},
  umbrella:{short:'配送伞',role:'折伞扇风',description:'撑伞扫过身侧，沿伞骨展开的风瓣最多打中九只。伞沿还可挡住一次正面袭击。',detail:weaponDetail('umbrella',`挥角 ${MELEE_WEAPONS.umbrella.sweep}° · 气浪最远 ${WEAPONS.umbrella.range}`)},
  sword:{short:'签收尺剑',role:'尺纹重扫',description:'肩后蓄力，再挥尺拍出带刻度的厚重气浪。一挥最多劈中十只。',detail:weaponDetail('sword',`挥角 ${MELEE_WEAPONS.sword.sweep}° · 气浪最远 ${WEAPONS.sword.range}`)},
  lunchbox:{short:'弹射餐盒',role:'三点抛投',description:'一盒抛远，另两盒向左右稍近处抛出，各自在圈内爆开。重叠的落点只结算一次伤害，整轮最多打十四只。',detail:weaponDetail('lunchbox',`中路投距 ${WEAPONS.lunchbox.range} · 张角 80° · 落地半径 ${WEAPONS.lunchbox.width}`)},
  talisman:{short:'派单符册',role:'分单接力',description:'三张派单纸向不同方向飞出，碰到怪物才开始逐跳传递。各路共享已派名单，单轮最多打十只。',detail:weaponDetail('talisman',`首段射程 ${WEAPONS.talisman.range} · 张角 108° · 跳转距离 ${WEAPONS.talisman.width} · 后续 ${RANGED_HITS.talisman.slice(1).join(" / ")}`)},
};
export const SKILL_GUIDE:Record<SkillKind,CatalogEntry>={
  icebox:{short:'保冷箱',role:'定向冰浪',description:'开箱前转身对准怪群，碎冰分三层向前涌出。浪头触到的敌人受伤并短暂冻结。',detail:'前方 180° · 蓄力 0.20 秒 · 命中 85 · 冻结 0.75 秒'},
  steamer:{short:'蒸笼开席',role:'全场扩散',description:'揭盖后热汽从脚边向场外推开。近处的怪先被掀起，可以跟着浪头往外跑。',detail:'波前用时 0.65 秒 · 每只最多 100 伤害'},
  express:{short:'加急三连送',role:'跨场折返',description:'投出快递包，让它跨街折返三次。你可以自由跑动或冲刺，折返时的移动方向会引导下一站。',detail:'每跳 0.24 秒 · 沿途 58 · 末次盖章半径 110、伤害 92'},
  berry:{short:'杨梅汽水',role:'开瓶炸屏',description:'气泡收紧，瓶盖弹起。莓红汽水从瓶口向全场溅开，近处的敌人先受击。',detail:'开瓶 0.18 秒 · 扩散 0.33 秒 · 每只最多 144 伤害'},
  fan:{short:'旋风电扇',role:'热餐风卷',description:'电扇卷起餐盒的热气，小票随风飘向外围，带出五处风卷。可以继续跑，把追来的怪引进热风。',detail:`主圈半径 ${CONFIG.skills.fan.fullRadius} · 留地 2.8 秒 · 每只最多 ${CONFIG.skills.fan.damage} 伤害`},
  skate:{short:'滑板环绕',role:'持续环带',description:'滑板绕身攻击；内圈空隙没有伤害保护，仍需移动躲避。',detail:`环带 ${CONFIG.skills.skate.inner}–${CONFIG.skills.skate.outer} · 持续 4 秒 · 每只每 0.5 秒 ${CONFIG.skills.skate.damage} 伤害`},
  soda:{short:'汽水缓速',role:'地面减速',description:'汽水溅湿附近敌人，并在地上留下三片蓝色水洼。后来走进水洼的怪也会减速。',detail:`溅射半径 ${CONFIG.skills.soda.radius} · 水洼持续 3 秒 · 速度降至 35%`},
  lure:{short:'试吃保温盒',role:'诱导追踪',description:'在地面留下试吃盒，吸引附近追踪者；不能解除已锁定冲刺。',detail:`半径 ${CONFIG.skills.lure.radius} · 最多吸引 ${CONFIG.skills.lure.targets} 只 · 持续 4 秒`},
  bubble:{short:'气泡缓冲卷',role:'一次防撞',description:'抵消一次有效接触伤害，消耗后给予短暂全局保护。',detail:'保留 7 秒 · 防撞 ×1 · 成功后保护 0.75 秒'},
  cones:{short:'三联反光路锥',role:'阻挡路径',description:'前方放下最多三个路锥，怪物绕行；冲刺撞锥会打破单锥。',detail:`锥间距 ${CONFIG.skills.cones.spacing} · 存在 4.5 秒 · 再取替换旧锥`},
  bell:{short:'到站手铃',role:'打断眩晕',description:'铃声打断附近预警与冲刺，使一片敌人短暂眩晕。',detail:`半径 ${CONFIG.skills.bell.radius} · 最多 ${CONFIG.skills.bell.targets} 只 · 眩晕 0.65 秒`},
  route:{short:'导航纸地图',role:'路线提速',description:'沿最近移动方向铺出路线，站在路线内才提升移动速度。',detail:`长 ${CONFIG.skills.route.length} · 宽 ${CONFIG.skills.route.width} · 持续 5 秒 · 路线内速度 ×1.2`},
  hook:{short:'伸缩取餐钩',role:'吸取道具',description:'把附近最多三件技能道具往你身边拉，进入拾取范围就会生效。',detail:`半径 ${CONFIG.skills.hook.radius} · 最多追踪 ${CONFIG.skills.hook.duration} 秒 · 不吸武器或取餐钩`},
  heat:{short:'加热餐包',role:'武器急速',description:'缩短之后新建立的攻击冷却；不重置当前冷却，不加伤害。',detail:'持续 5 秒 · 后续冷却 ×0.8 · 换武器继承剩余时间'},
  dispatch:{short:'派单终端',role:'暂缓增援',description:'暂缓新的敌人入场；场内敌人、时间和攻击继续推进。',detail:'4 秒 · 连续最长 6 秒 · 之后调度冷却 2 秒'},
  stamp:{short:'加急印章',role:'额外金币',description:'生效期间击败的每只怪会多掉一枚金币。走过掉落处即可收取。',detail:'持续 6 秒 · 每次击败额外掉落 1 金币'},
  supply:{short:'补给扫码券',role:'三选一补给',description:'投出电扇、滑板、汽水供选择，取一件后同组其他物件收回。',detail:'最多 3 件 · 箱组存在 6 秒 · 满场最多等待 4 秒'},
};
