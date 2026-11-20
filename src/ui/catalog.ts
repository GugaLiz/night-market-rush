import {ELITE_KINDS, ENEMY_NAMES, EPIC_KINDS, ORDINARY_KINDS, SKILL_KINDS, SKILL_NAMES, WEAPON_KINDS, WEAPON_NAMES, type EnemyKind, type EpicKind, type SkillKind, type WeaponKind} from '../shared/types';
import {CONFIG} from '../core/config';
import {GUARD_HELPERS} from '../core/guard-attacks';
import {EXPRESS,WAVES} from '../core/ultimates';
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
  vortex:{short:'乌金涡锅',role:'黑洞聚怪',description:'把炒锅甩到身前，锅里的汤越转越急，把整条街上的地面怪卷向锅心。趁它们聚拢出手，收锅时再烫一圈。',detail:`牵引 ${ELEMENTAL.vortex.duration} 秒 · 收锅半径 ${ELEMENTAL.vortex.blastRadius} · 爆发伤害 ${ELEMENTAL.vortex.damage}`},
  poison:{short:'毒雾泡菜坛',role:'毒雾蚀血',description:'开坛后，青绿色酸雾在脚下铺开。把追兵引进雾里，再绕到另一边，沾上的毒汁会继续扣血。',detail:`雾区半径 ${ELEMENTAL.poison.radius} · 留场 ${ELEMENTAL.poison.duration} 秒 · 每 ${ELEMENTAL.poison.interval} 秒扣 ${ELEMENTAL.poison.damage} 血 · 离开后持续 ${ELEMENTAL.poison.linger} 秒`},
  frost:{short:'冰封刨冰机',role:'冰封碎裂',description:'附近的怪从近到远依次裹上一层冰壳，冻在原地。趁这时穿过包围，冰壳碎开时还会对怪物造成伤害。',detail:`冻结半径 ${ELEMENTAL.frost.radius} · ${ELEMENTAL.frost.growth} 秒扩散 · 第 ${ELEMENTAL.frost.duration} 秒碎冰，造成 ${ELEMENTAL.frost.damage} 伤害`},
  health:{short:'暖心汤包',role:'恢复生命',description:'受伤后，附近的空地会飘来带红心的汤包。迎上它就能回血，满血经过会留在街上。',detail:`每个最多恢复 ${CONFIG.skills.health.amount} 点生命 · 拾取 ${CONFIG.skills.health.cooldown} 秒后可再次投递`},
  icebox:{short:'保冷箱',role:'定向冰浪',description:'开箱前转身对准怪群，冰浪能把前方半场的普通怪一举清掉。扛住浪头的精英会短暂冻结。',detail:`前方 180° · 蓄力 ${WAVES.icebox.windup.toFixed(2)} 秒 · 命中 ${WAVES.icebox.damage} · 冻结 0.75 秒`},
  steamer:{short:'蒸笼开席',role:'全场扩散',description:'揭盖后，滚热的蒸汽从脚边一直掀到街角。近处先腾出空地，跟着浪头往外跑。',detail:`波前用时 ${WAVES.steamer.travel} 秒 · 命中 ${WAVES.steamer.damage}`},
  express:{short:'加急三连送',role:'跨场折返',description:'快递包每趟横穿都扫开一条路。折返时移动可引导下一程，每送完四程落地盖章，第三单的章最大。',detail:`持续约 ${Math.round(EXPRESS.windup+EXPRESS.legs*EXPRESS.leg)} 秒 · 沿途 ${EXPRESS.damage} 伤害 · 前两单盖章半径 ${EXPRESS.orderRadius}、伤害 ${EXPRESS.orderDamage} · 尾单半径 ${EXPRESS.landingRadius}、伤害 ${EXPRESS.landingDamage}`},
  berry:{short:'杨梅汽水',role:'开瓶炸屏',description:'瓶盖一弹，杨梅汽水从瓶口泼向全场。莓红浪头一到，整排普通怪就会被掀飞。',detail:`开瓶 ${WAVES.berry.windup} 秒 · 扩散 ${WAVES.berry.travel} 秒 · 命中 ${WAVES.berry.damage}`},
  fan:{short:'旋风电扇',role:'热风清场',description:'迎着怪群接住电扇。脚边先腾起一圈热浪，五股热风再沿你面向的一侧扫开；还在追你的怪也会被卷进去。',detail:`主圈半径 ${CONFIG.skills.fan.fullRadius} · 留地 2.8 秒 · 每只最多 ${CONFIG.skills.fan.damage} 伤害`},
  skate:{short:'滑板环绕',role:'绕身打怪',description:'三块滑板绕着骑手行进，持续击打环带内的怪物。钻进内圈的怪需要走位躲开。',detail:`环带 ${CONFIG.skills.skate.inner}–${CONFIG.skills.skate.outer} · 持续 4 秒 · 每只每 0.5 秒 ${CONFIG.skills.skate.damage} 伤害`},
  soda:{short:'汽水缓速',role:'地面减速',description:'汽水溅湿附近敌人，并在地上留下三片蓝色水洼。后来走进水洼的怪也会减速。',detail:`溅射半径 ${CONFIG.skills.soda.radius} · 水洼持续 3 秒 · 速度降至 35%`},
  lure:{short:'试吃保温盒',role:'诱导追踪',description:'在地面留下试吃盒，吸引附近追踪者；不能解除已锁定冲刺。',detail:`半径 ${CONFIG.skills.lure.radius} · 最多吸引 ${CONFIG.skills.lure.targets} 只 · 持续 4 秒`},
  bubble:{short:'气泡缓冲卷',role:'一次防撞',description:'抵消一次有效接触伤害，消耗后给予短暂全局保护。',detail:'保留 7 秒 · 防撞 ×1 · 成功后保护 0.75 秒'},
  cones:{short:'反光路锥阵',role:'阻挡路径',description:'一把路锥散落在身边，迫使地面怪绕行。你可以从锥阵中直接穿过，冲锋的餐盒怪撞上路锥时会停下来并撞碎一个。',detail:`每次 ${CONFIG.skills.cones.minCount}～${CONFIG.skills.cones.maxCount} 个 · 存在 ${CONFIG.skills.cones.duration} 秒 · 再取替换旧锥`},
  bell:{short:'到站手铃',role:'打断眩晕',description:'摇铃打断附近怪物的攻击。头顶冒出转圈铃星的怪会停在原地，趁这时贴身穿过也安全。',detail:`半径 ${CONFIG.skills.bell.radius} · 最多 ${CONFIG.skills.bell.targets} 只 · 眩晕 ${CONFIG.skills.bell.duration} 秒`},
  route:{short:'导航纸地图',role:'上路加速',description:'沿刚才移动的方向铺开纸地图。踏上纸面，路边亮起绿线，骑手加速。离开后还能在地图收起前跑回来。',detail:`长 ${CONFIG.skills.route.length} · 宽 ${CONFIG.skills.route.width} · 持续 ${CONFIG.skills.route.duration} 秒 · 路线内速度 ×${CONFIG.skills.route.speedMultiplier}`},
  hook:{short:'伸缩取餐钩',role:'连续回收',description:'跑动时，钩爪会接连抓取附近飘过的技能泡，把它们和散落的金币拉回身边。补给箱的三件奖品留给你亲自选。',detail:`搜寻 ${CONFIG.skills.hook.duration} 秒 · 半径 ${CONFIG.skills.hook.radius} · 同时伸出 ${CONFIG.skills.hook.targets} 条钩索`},
  heat:{short:'加热餐包',role:'武器急速',description:'缩短之后新建立的攻击冷却；不重置当前冷却，不加伤害。',detail:'持续 5 秒 · 后续冷却 ×0.8 · 换武器继承剩余时间'},
  dispatch:{short:'派单终端',role:'广播清场',description:'终端发出一次改派广播，冲散附近的敌弹，把普通追兵推开并减速。趁增援暂停，从腾出的空当突围。',detail:`广播半径 ${CONFIG.skills.dispatch.radius} · 减速 ${CONFIG.skills.dispatch.slowTime} 秒 · 增援暂停 4 秒`},
  stamp:{short:'加急印章',role:'无敌护送',description:'盖章后进入无敌状态，迎着前方的冲刺波穿过怪群。期间每击败一只怪，都会多掉一枚金币。',detail:`无敌 ${CONFIG.skills.stamp.duration} 秒 · 再次拾取刷新时长 · 每次击败额外掉落 1 金币`},
  supply:{short:'补给扫码券',role:'任选补给',description:'扫码就地摆出三个取餐位。走近电扇清怪、气泡护身或刨冰机冻场，选中一件立即发动。',detail:`三选一 · 保留 ${CONFIG.skills.supply.duration} 秒 · 满场也能配送`},
};

function contactStats(kind:Exclude<EnemyKind,'giantBun'>):string {
  const {hp,damage}=CONFIG.enemies[kind];
  return `生命 ${hp} · 碰撞伤害 ${damage}`;
}

function epicStats(kind:EpicKind):string {
  const firstWave=(EPIC_KINDS.indexOf(kind)+1)*CONFIG.waves.epicEvery;
  return `生命 ${CONFIG.enemies[kind].hp} · 第 ${firstWave} 波首次登场 · 召唤${ENEMY_NAMES[GUARD_HELPERS[kind]]}`;
}

export const ENEMY_GUIDE:Record<EnemyKind,Omit<CatalogEntry,'short'>>={
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
    role:'三连坐', description:'金色斗气随巨包起跳。前两跳移出整圈落点，第三跳对准面粉浪的缺口穿过去，趁它落地回身反击。',
    detail:`生命 ${CONFIG.enemies.giantBun.hp} · 前两跳各 ${CONFIG.enemies.giantBun.damage} · 末跳面粉浪 ${CONFIG.giant.finalDamage}`,
  },
  eliteCrab:{role:'锁线冲锋',description:'朱红斗气聚到蟹钳时，宽冲锋带锁定方向。横着跑出带边，趁蟹钳王刹车时追击。',detail:`生命 ${CONFIG.enemies.eliteCrab.hp} · 冲锋伤害 ${CONFIG.elites.crab.damage}`},
  eliteKettle:{role:'扇形茶弹',description:`翡翠青斗气围住壶身。壶嘴瞄准后，${CONFIG.elites.kettle.shots} 路茶弹沿地面标线扇形散开。拉开距离，从两道茶线之间穿过。`,detail:`生命 ${CONFIG.enemies.eliteKettle.hp} · 单发茶弹 ${CONFIG.elites.kettle.damage}`},
  eliteSesame:{role:'定点糖浆',description:'莓紫斗气跟着汤勺升起。脚下的大圈会锁定糖浆落点，持续朝最近的圈边走，落击后再折返。',detail:`生命 ${CONFIG.enemies.eliteSesame.hp} · 糖浆伤害 ${CONFIG.elites.sesame.damage}`},
  eliteSkewer:{role:'双签直刺',description:'两道细长的签痕指向前方。看准刺线后横移，等第二签收回再贴近。',detail:contactStats('eliteSkewer')},
  eliteLotus:{role:'藕鼓双环',description:'鼓点从莲藕身边一圈圈向外敲开。留意第二圈的位置，等环带暗下再靠近。',detail:contactStats('eliteLotus')},
  eliteChili:{role:'转身扇舞',description:'椒裙带出接连两片转向的扇面。第一片掠过时先看下一片朝哪边，再从空侧绕到身后。',detail:contactStats('eliteChili')},
  eliteTofu:{role:'铁板烙纹',description:'几条平行烙纹同时亮起，热铁板沿纹路压下。顺着两条烙纹之间的窄巷跑过去。',detail:contactStats('eliteTofu')},
  eliteTanghulu:{role:'连珠点名',description:'三枚糖果在同一直线上依次落下。离开整串糖圈的侧边，别顺着串签的方向逃。',detail:contactStats('eliteTanghulu')},
  eliteRoll:{role:'折线滚袭',description:'海苔卷沿着两段相连的滚道飞驰。让开第一段后，绕开拐角，等它滚完第二段再追。',detail:contactStats('eliteRoll')},
  epicHotpot:{role:'双汤泼洒 · 沸锅环',description:'鸳鸯锅轮流泼出两片滚汤，接着从锅边激起一圈沸浪。看准两片汤的落点换边，小心它叫来的烧卖堵路。',detail:epicStats('epicHotpot')},
  epicDragon:{role:'蛇行穿街 · 三路龙息',description:'糖龙先沿弯折的路线穿街，再朝前方吐出三道糖息。横穿空出的路段，绕过它唤来的青叶粽。',detail:epicStats('epicDragon')},
  epicOpera:{role:'十字刀路 · 错扇飞刀',description:'刀削师先亮出交叉刀路，再抖出接连转向的扇面。躲到十字线之间，下一刀出手前留好侧移空间。外卖盒会从旁助阵。',detail:epicStats('epicOpera')},
  epicPearl:{role:'珍珠雨 · 奶茶环',description:'珍珠在多处落下，接着奶茶环在你脚下锁定。先找落点间的空地，再看环带内外的位置，也要给饭团留出绕行空间。',detail:epicStats('epicPearl')},
  epicSteamer:{role:'分层汽环 · 蒸汽道',description:'蒸笼一层层揭开，不同距离的汽环接连喷起。穿过熄灭的环带，再沿平行蒸汽道的缝隙跑，避开来援的包子。',detail:epicStats('epicSteamer')},
};

const enemyKinds=[...ORDINARY_KINDS,...ELITE_KINDS,...EPIC_KINDS];
export const ENEMY_GROUPS={
  normal:{label:'普通怪',note:'街上成群出没。留意各自的追赶路线和起手动作。',kinds:ORDINARY_KINDS},
  elite:{label:'精英怪',note:'普通关由精英守关。从第 4 波起最多两种同场，击败全部守关精英即可解锁下一波。',kinds:ELITE_KINDS},
  epic:{label:'史诗 Boss',note:'每五波由一位史诗 Boss 守关。击败 Boss 即可进入下一波，五位 Boss 按登场顺序轮换。',kinds:EPIC_KINDS},
} as const;
export type EnemyGroup=keyof typeof ENEMY_GROUPS;
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
    note:'',
    cards:enemyKinds.map(kind=>({kind,title:ENEMY_NAMES[kind],...ENEMY_GUIDE[kind]})),
  },
};
