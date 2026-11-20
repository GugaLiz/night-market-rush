import {ENEMY_NAMES, SKILL_KINDS, SKILL_NAMES, WEAPON_KINDS, WEAPON_NAMES, type EnemyKind, type SkillKind, type WeaponKind} from '../shared/types';
import {CONFIG} from '../core/config';
import {EXPRESS} from '../core/ultimates';
import {ELEMENTAL} from '../core/elemental-skills';
import {MELEE_WEAPONS} from '../core/melee';
import {RANGED_HITS, WEAPONS} from '../core/weapons';

export interface CatalogEntry {short:string;role:string;description:string;detail:string}
const weaponDetail=(kind:WeaponKind,extra='')=>{const w=WEAPONS[kind];return `${w.damage} 首次命中伤害 · 冷却 ${w.cooldown.toFixed(2)} 秒 · 前摇 ${w.windup.toFixed(2)} 秒${extra?` · ${extra}`:''}`;};
export const WEAPON_GUIDE:Record<WeaponKind,CatalogEntry>={
  tongs:{short:'取餐夹',role:'双弧夹风',description:'取餐夹交替正反手挥动，夹口扫出两道金色气浪。贴身和远处的怪都能打到，一挥最多打七只。',detail:weaponDetail('tongs',`挥角 ${MELEE_WEAPONS.tongs.sweep}° · 气浪最远 ${WEAPONS.tongs.range}`)},
  bag:{short:'纸袋气炮',role:'九路散射',description:'一压纸袋，九股纸风扇形铺开。每股打中一只便散去，同一只怪每轮受击一次。',detail:weaponDetail('bag',`射程 ${WEAPONS.bag.range} · 张角 144°`)},
  chopsticks:{short:'飞筷匣',role:'五路贯穿',description:'筷匣一开，系着青绸的竹筷成对扇射。每路最多贯穿七只，伤害逐只衰减。同轮最多命中十四只。',detail:weaponDetail('chopsticks',`射程 ${WEAPONS.chopsticks.range} · 张角 84° · 后续 ${RANGED_HITS.chopsticks.slice(1).join(" / ")}`)},
  spirit:{short:'汤灵壶',role:'三路寻客',description:'三股汤灵分头飞向前方和两侧，各自寻找目标。击中后能再跳向一只附近的敌人。',detail:weaponDetail('spirit',`首段索敌距离 ${WEAPONS.spirit.range} · 跳转距离 ${RANGED_HITS.spiritBounce} · 第二目标 ${RANGED_HITS.spirit[1]}`)},
  knife:{short:'拆箱快刀',role:'封签快斩',description:'短刀从肩后快速划过，带出一道薄而锋利的封签切风，一挥最多削中十只。',detail:weaponDetail('knife',`挥角 ${MELEE_WEAPONS.knife.sweep}° · 气浪最远 ${WEAPONS.knife.range}`)},
  tray:{short:'回旋餐盘',role:'分盘回收',description:'三只餐盘铺向左、中、右，飞至尽头或场边后回到外卖员手中。移动可以改变回程路线。每程最多打九只。',detail:weaponDetail('tray',`去程 ${WEAPONS.tray.range} · 张角 88° · 回程伤害 ${RANGED_HITS.trayReturn}`)},
  umbrella:{short:'配送伞',role:'折伞扇风',description:'撑伞扫过身侧，沿伞骨展开的风瓣最多打中九只。伞沿还可挡住一次正面袭击。',detail:weaponDetail('umbrella',`挥角 ${MELEE_WEAPONS.umbrella.sweep}° · 气浪最远 ${WEAPONS.umbrella.range}`)},
  sword:{short:'签收尺剑',role:'尺纹重扫',description:'肩后蓄力，再挥尺拍出带刻度的厚重气浪。一挥最多劈中十只。',detail:weaponDetail('sword',`挥角 ${MELEE_WEAPONS.sword.sweep}° · 气浪最远 ${WEAPONS.sword.range}`)},
  lunchbox:{short:'弹射餐盒',role:'三点抛投',description:'一盒抛远，另两盒向左右稍近处抛出，各自在圈内爆开。重叠的落点只结算一次伤害，整轮最多打十四只。',detail:weaponDetail('lunchbox',`中路投距 ${WEAPONS.lunchbox.range} · 张角 80° · 落地半径 ${WEAPONS.lunchbox.width}`)},
  talisman:{short:'派单符册',role:'分单接力',description:'三张派单纸向不同方向飞出，碰到怪物才开始逐跳传递。各路共享已派名单，单轮最多打十只。',detail:weaponDetail('talisman',`首段射程 ${WEAPONS.talisman.range} · 张角 108° · 跳转距离 ${WEAPONS.talisman.width} · 后续 ${RANGED_HITS.talisman.slice(1).join(" / ")}`)},
};
export const SKILL_GUIDE:Record<SkillKind,CatalogEntry>={
  vortex:{short:'乌金涡锅',role:'黑洞聚怪',description:'把涡锅甩到前方，整条街上的地面怪都会被卷向锅心。沿锅沿绕到侧面，可以边聚怪边打。',detail:`牵引 ${ELEMENTAL.vortex.duration} 秒 · 收锅半径 ${ELEMENTAL.vortex.blastRadius} · 爆发伤害 ${ELEMENTAL.vortex.damage}`},
  poison:{short:'毒雾泡菜坛',role:'毒雾蚀血',description:'开坛后，青绿色酸雾在脚下铺开。把追兵引进雾里，再绕到另一边，沾上的毒汁会继续扣血。',detail:`雾区半径 ${ELEMENTAL.poison.radius} · 留场 ${ELEMENTAL.poison.duration} 秒 · 每 ${ELEMENTAL.poison.interval} 秒扣 ${ELEMENTAL.poison.damage} 血 · 离开后持续 ${ELEMENTAL.poison.linger} 秒`},
  frost:{short:'冰封刨冰机',role:'冰封碎裂',description:'碎冰沿地面向四周扩散，冻住它扫过的怪。趁怪群停住穿过包围，冰壳碎裂时再补一击。',detail:`扩散半径 ${ELEMENTAL.frost.radius} · ${ELEMENTAL.frost.growth} 秒铺开 · 第 ${ELEMENTAL.frost.duration} 秒碎冰，造成 ${ELEMENTAL.frost.damage} 伤害`},
  health:{short:'暖心汤包',role:'恢复生命',description:'受伤后，附近的空地会飘来带红心的汤包。迎上它就能回血，满血经过会留在街上。',detail:`每个最多恢复 ${CONFIG.skills.health.amount} 点生命 · 拾取 ${CONFIG.skills.health.cooldown} 秒后可再次投递`},
  icebox:{short:'保冷箱',role:'定向冰浪',description:'开箱前转身对准怪群，碎冰分三层向前涌出。浪头触到的敌人受伤并短暂冻结。',detail:'前方 180° · 蓄力 0.20 秒 · 命中 85 · 冻结 0.75 秒'},
  steamer:{short:'蒸笼开席',role:'全场扩散',description:'揭盖后热汽从脚边向场外推开。近处的怪先被掀起，可以跟着浪头往外跑。',detail:'波前用时 0.65 秒 · 每只最多 100 伤害'},
  express:{short:'加急三连送',role:'跨场折返',description:'快递包连续送三单，每单横穿四程。折返时移动可引导下一程，最后一单落地时盖下重章。',detail:`持续约 ${Math.round(EXPRESS.windup+EXPRESS.legs*EXPRESS.leg)} 秒 · 每程对同一怪最多造成 ${EXPRESS.damage} 伤害 · 末次盖章半径 ${EXPRESS.landingRadius}、伤害 ${EXPRESS.landingDamage}`},
  berry:{short:'杨梅汽水',role:'开瓶炸屏',description:'气泡收紧，瓶盖弹起。莓红汽水从瓶口向全场溅开，近处的敌人先受击。',detail:'开瓶 0.18 秒 · 扩散 0.33 秒 · 每只最多 144 伤害'},
  fan:{short:'旋风电扇',role:'热风伤敌',description:'电扇卷起餐盒的热气，小票随风飘向外围，带出五处风卷。可以继续跑，把追来的怪引进热风。',detail:`主圈半径 ${CONFIG.skills.fan.fullRadius} · 留地 2.8 秒 · 每只最多 ${CONFIG.skills.fan.damage} 伤害`},
  skate:{short:'滑板环绕',role:'绕身打怪',description:'三块滑板绕着骑手行进，持续击打环带内的怪物。钻进内圈的怪需要走位躲开。',detail:`环带 ${CONFIG.skills.skate.inner}–${CONFIG.skills.skate.outer} · 持续 4 秒 · 每只每 0.5 秒 ${CONFIG.skills.skate.damage} 伤害`},
  soda:{short:'汽水缓速',role:'地面减速',description:'汽水溅湿附近敌人，并在地上留下三片蓝色水洼。后来走进水洼的怪也会减速。',detail:`溅射半径 ${CONFIG.skills.soda.radius} · 水洼持续 3 秒 · 速度降至 35%`},
  lure:{short:'试吃保温盒',role:'诱导追踪',description:'在地面留下试吃盒，吸引附近追踪者；不能解除已锁定冲刺。',detail:`半径 ${CONFIG.skills.lure.radius} · 最多吸引 ${CONFIG.skills.lure.targets} 只 · 持续 4 秒`},
  bubble:{short:'气泡缓冲卷',role:'一次防撞',description:'抵消一次有效接触伤害，消耗后给予短暂全局保护。',detail:'保留 7 秒 · 防撞 ×1 · 成功后保护 0.75 秒'},
  cones:{short:'三联反光路锥',role:'阻挡路径',description:'前方放下最多三个路锥，怪物绕行；冲刺撞锥会打破单锥。',detail:`锥间距 ${CONFIG.skills.cones.spacing} · 存在 4.5 秒 · 再取替换旧锥`},
  bell:{short:'到站手铃',role:'打断眩晕',description:'铃声打断附近预警与冲刺，使一片敌人短暂眩晕。',detail:`半径 ${CONFIG.skills.bell.radius} · 最多 ${CONFIG.skills.bell.targets} 只 · 眩晕 0.65 秒`},
  route:{short:'导航纸地图',role:'上路加速',description:'沿刚才移动的方向铺开纸地图。踏上纸面，路边亮起绿线，骑手加速。离开后还能在地图收起前跑回来。',detail:`长 ${CONFIG.skills.route.length} · 宽 ${CONFIG.skills.route.width} · 持续 ${CONFIG.skills.route.duration} 秒 · 路线内速度 ×${CONFIG.skills.route.speedMultiplier}`},
  hook:{short:'伸缩取餐钩',role:'吸取道具',description:'把附近最多三件技能道具往你身边拉，进入拾取范围就会生效。',detail:`半径 ${CONFIG.skills.hook.radius} · 最多追踪 ${CONFIG.skills.hook.duration} 秒 · 不吸武器或取餐钩`},
  heat:{short:'加热餐包',role:'武器急速',description:'缩短之后新建立的攻击冷却；不重置当前冷却，不加伤害。',detail:'持续 5 秒 · 后续冷却 ×0.8 · 换武器继承剩余时间'},
  dispatch:{short:'派单终端',role:'暂缓增援',description:'暂缓新的敌人入场；场内敌人、时间和攻击继续推进。',detail:'4 秒 · 连续最长 6 秒 · 之后调度冷却 2 秒'},
  stamp:{short:'加急印章',role:'额外金币',description:'生效期间击败的每只怪会多掉一枚金币。走过掉落处即可收取。',detail:'持续 6 秒 · 每次击败额外掉落 1 金币'},
  supply:{short:'补给扫码券',role:'三选一补给',description:'投出电扇、滑板、汽水供选择，取一件后同组其他物件收回。',detail:'最多 3 件 · 箱组存在 6 秒 · 满场最多等待 4 秒'},
};

function contactStats(kind:Exclude<EnemyKind,'giantBun'>):string {
  const {hp,damage}=CONFIG.enemies[kind];
  return `生命 ${hp} · 碰撞伤害 ${damage}`;
}

const enemyGuide:Record<EnemyKind,Omit<CatalogEntry,'short'>>={
  bun:{
    role:'近战 · 追赶', description:'靠近时会成群追上来，有些会沿小弧线绕向你。贴着怪群外沿跑，把它们引到武器前方。',
    detail:contactStats('bun'),
  },
  onigiri:{
    role:'近战 · 滚动', description:'发现你后会加紧追赶，滚动中拐弯较慢。迎面时突然横切，让它沿原来的方向滚过。',
    detail:contactStats('onigiri'),
  },
  siumai:{
    role:'近战 · 跳步', description:'起跳时追得快，落地时脚步放慢。趁它落地，从两只烧卖之间穿过去。',
    detail:contactStats('siumai'),
  },
  zongzi:{
    role:'近战 · 侧绕', description:'从侧面弯着靠近，贴身前才转向你的脚边。看住两翼，向还没合拢的一侧突围。',
    detail:contactStats('zongzi'),
  },
  box:{
    role:'突袭 · 直线冲撞', description:`盒怪停住蓄力，${CONFIG.dash.warning} 秒后沿锁定方向冲出。横移让过它，趁它停下喘息时回身攻击。`,
    detail:`${contactStats('box')} · 冲撞伤害 ${CONFIG.dash.damage}`,
  },
  bowl:{
    role:'远程 · 汤弹', description:`碗口瞄准时地面会出现虚线，${CONFIG.ranged.warning} 秒后打出汤弹。向侧面走开，第二波起要留意同一路线的三连发。`,
    detail:`${contactStats('bowl')} · 每发汤弹 ${CONFIG.ranged.damage}`,
  },
  giantBun:{
    role:'精英 · 三连坐', description:'前两跳躲开地上的落点圈。第三跳会掀起面粉浪，提前对准圈上标出的缺口，穿过去后回身反击。',
    detail:`生命 ${CONFIG.enemies.giantBun.hp} · 前两跳各 ${CONFIG.enemies.giantBun.damage} · 末跳面粉浪 ${CONFIG.giant.finalDamage}`,
  },
};

const enemyKinds=Object.keys(ENEMY_NAMES) as EnemyKind[];
export const CATALOG={
  weapons:{
    label:`${WEAPON_KINDS.length} 款武器`,
    note:'武器持续朝行进方向攻击。转身改变下一次攻击方向，靠近武器箱可换装。',
    cards:WEAPON_KINDS.map(kind=>({kind,title:WEAPON_NAMES[kind],...WEAPON_GUIDE[kind]})),
  },
  skills:{
    label:`${SKILL_KINDS.length} 种技能`,
    note:'迎上青色技能泡即可发动。用涡锅聚怪，绕过毒雾诱敌，也可以趁冰封穿过包围。',
    cards:SKILL_KINDS.map(kind=>({kind,title:SKILL_NAMES[kind],...SKILL_GUIDE[kind]})),
  },
  enemies:{
    label:`${enemyKinds.length} 种怪物`,
    note:'留意追赶的方向、地面的瞄准线和落点圈。第二波起，偶数波次有机会遇到精英巨包。',
    cards:enemyKinds.map(kind=>({kind,title:ENEMY_NAMES[kind],...enemyGuide[kind]})),
  },
};
