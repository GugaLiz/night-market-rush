import type {SkillKind, WeaponKind} from '../shared/types';
import {WEAPONS} from '../core/weapons';

export interface CatalogEntry {short:string;role:string;description:string;detail:string}
const weaponDetail=(kind:WeaponKind,extra='')=>{const w=WEAPONS[kind];return `${w.damage} 总伤害 · 冷却 ${w.cooldown.toFixed(2)} 秒 · 前摇 ${w.windup.toFixed(2)} 秒${extra?` · ${extra}`:''}`;};
export const WEAPON_GUIDE:Record<WeaponKind,CatalogEntry>={
  tongs:{short:'取餐夹',role:'宽线夹击',description:'沿行进方向伸夹，宽线内最多四个目标；造成连续多段伤害。',detail:weaponDetail('tongs',`射程 ${WEAPONS.tongs.range}`)},
  bag:{short:'纸袋气炮',role:'五路散射',description:'向前方散出五股纸风，各命中一只后消散。同敌本轮只受一路伤害。',detail:weaponDetail('bag',`射程 ${WEAPONS.bag.range}`)},
  chopsticks:{short:'飞筷匣',role:'直线贯穿',description:'朝前直飞，贯穿最多五个不同敌人；依命中次序递减伤害。',detail:weaponDetail('chopsticks','后续 36 / 32 / 28 / 24')},
  spirit:{short:'汤灵壶',role:'飞行制导',description:'汤灵先向前飞，有前方目标则制导；命中后寻找附近第二个目标。',detail:weaponDetail('spirit','第二目标 30')},
  knife:{short:'拆箱快刀',role:'宽弧快斩',description:'向前挥出 150° 快斩，最多伤害六个敌人；转向引导下一次斩击。',detail:weaponDetail('knife',`半径 ${WEAPONS.knife.range}`)},
  tray:{short:'回旋餐盘',role:'去回两段',description:'餐盘向前飞出再返回，每程最多四个目标；同敌去回可各受一次。',detail:weaponDetail('tray','回程 26')},
  umbrella:{short:'配送伞',role:'伞面横扫',description:'向前方扇面扫击最多五个敌人，并保留前方一次接触格挡；侧后仍危险。',detail:weaponDetail('umbrella',`有效窗 ${WEAPONS.umbrella.active.toFixed(2)} 秒`)},
  sword:{short:'签收尺剑',role:'长线重劈',description:'蓄力后沿行进方向劈出宽长攻击，最多命中六个目标。',detail:weaponDetail('sword',`射程 ${WEAPONS.sword.range}`)},
  lunchbox:{short:'弹射餐盒',role:'前方落点',description:'餐盒抛向前方固定落点，落地后范围攻击最多八个敌人。',detail:weaponDetail('lunchbox',`落地半径 ${WEAPONS.lunchbox.width}`)},
  talisman:{short:'派单符册',role:'飞符跳链',description:'符纸先向前飞，命中后再在附近敌人之间逐跳连接，最多四个不同目标。',detail:weaponDetail('talisman','后续 32 / 28 / 24')},
};
export const SKILL_GUIDE:Record<SkillKind,CatalogEntry>={
  fan:{short:'旋风电扇',role:'范围伤害',description:'触发点周围一次风压攻击，并轻推仍存活的敌人。',detail:'60 伤害 · 半径 86.4 · 不保证清除大碗面'},
  skate:{short:'滑板环绕',role:'持续环带',description:'滑板绕身攻击；内圈空隙没有伤害保护，仍需移动躲避。',detail:'持续 4 秒 · 每目标每 0.50 秒最多 12 伤害'},
  soda:{short:'汽水缓速',role:'减速',description:'附近敌人移动减慢；不会造成伤害，也不回复生命。',detail:'持续 3 秒 · 速度变为 35% · 半径 162'},
  lure:{short:'试吃保温盒',role:'诱导追踪',description:'在地面留下试吃盒，吸引附近追踪者；不能解除已锁定冲刺。',detail:'临时诱饵 · 接近诱饵的敌人仍有接触伤害'},
  bubble:{short:'气泡缓冲卷',role:'一次防撞',description:'抵消一次有效接触伤害，消耗后给予短暂全局保护。',detail:'保留 7 秒 · 防撞 ×1 · 成功后保护 0.75 秒'},
  cones:{short:'三联反光路锥',role:'阻挡路径',description:'前方放下最多三个路锥，怪物绕行；冲刺撞锥会打破单锥。',detail:'存在 4.5 秒 · 不阻挡玩家 · 再取替换旧锥'},
  bell:{short:'到站手铃',role:'打断眩晕',description:'铃声打断附近预警与冲刺，使最多十二个敌人短暂眩晕。',detail:'半径 150 · 眩晕 0.65 秒 · 贴身接触仍危险'},
  route:{short:'导航纸地图',role:'路线提速',description:'沿最近移动方向铺出路线，站在路线内才提升移动速度。',detail:'持续 5 秒 · 路线内速度 ×1.2 · 不防撞'},
  hook:{short:'伸缩取餐钩',role:'吸取道具',description:'牵引附近最多三件普通技能；必须实际碰到玩家才能生效。',detail:'半径 150 · 最多追踪 0.5 秒 · 不吸武器或取餐钩'},
  heat:{short:'加热餐包',role:'武器急速',description:'缩短之后新建立的攻击冷却；不重置当前冷却，不加伤害。',detail:'持续 5 秒 · 后续冷却 ×0.8 · 换武器继承剩余时间'},
  dispatch:{short:'派单终端',role:'暂缓增援',description:'暂缓新的敌人入场；场内敌人、时间和攻击继续推进。',detail:'4 秒 · 连续最长 6 秒 · 之后调度冷却 2 秒'},
  stamp:{short:'加急印章',role:'击败加分',description:'生效期间击败分增加；不增加伤害或每秒生存分。',detail:'持续 6 秒 · 击败分 ×1.5 · 试验场不计分'},
  supply:{short:'补给扫码券',role:'三选一补给',description:'投出电扇、滑板、汽水供选择，取一件后同组其他物件收回。',detail:'最多 3 件 · 箱组存在 6 秒 · 满场最多等待 4 秒'},
};
