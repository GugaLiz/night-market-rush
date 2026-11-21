import {EPIC_KINDS,isGuard,type EliteKind,type EpicKind,type GuardKind,type Enemy,type EnemyKind,type GameState,type Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, type Difficulty} from './config';
import {distanceSquared} from './geometry';

type Spawn = (kind:EnemyKind, position:Vec) => Enemy;

// One market tray gives ordinary packs varied silhouettes while keeping their shared wave budget.
const snackTray=['bun','onigiri','siumai','bun','zongzi','onigiri','bun','siumai'] as const;

const headliners:readonly EliteKind[]=[
  'eliteCrab','giantBun','eliteKettle','eliteSesame','eliteSkewer',
  'eliteLotus','eliteChili','eliteTofu','eliteTanghulu','eliteRoll',
];

export function epicForWave(wave:number):EpicKind|undefined {
  const interval=CONFIG.waves.epicEvery;
  if(wave<=0||wave%interval!==0)return;
  return EPIC_KINDS[(wave/interval-1)%EPIC_KINDS.length];
}

function waveElites(wave:number):readonly EliteKind[] {
  if(wave<=3)return [headliners[wave-1]];
  const ordinaryWave=wave-Math.floor(wave/CONFIG.waves.epicEvery);
  // Each round fields every elite once. Rotate the other half of the roster between rounds.
  const pair=ordinaryWave-4,first=3+pair*2;
  const partnerOffset=1+2*Math.floor(pair/(headliners.length/2));
  return [headliners[first%headliners.length],headliners[(first+partnerOffset)%headliners.length]];
}

export function eliteArrival(s:GameState,kind:GuardKind,ctx:Pick<CombatContext,'random'>):Vec {
  const r=CONFIG.enemies[kind].radius,b=WORLD.bounds;
  const points:Vec[]=[];
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const x=b.left+r+(col+.15+.7*ctx.random())*(b.right-b.left-2*r)/5;
    const y=CONFIG.player.minY+(row+.15+.7*ctx.random())*(b.bottom-r-CONFIG.player.minY)/3;
    points.push({x,y});
  }
  const clearance=(p:Vec)=>Math.min(
    Math.hypot(p.x-s.player.x,p.y-s.player.y)-CONFIG.spawn.safeDistance-s.player.radius-r,
    ...s.enemies.filter(e=>e.hp>0).map(e=>Math.hypot(p.x-e.x,p.y-e.y)-r-e.radius-(isGuard(e.kind)?135:10))
  );
  return points.filter(p=>distanceSquared(p,s.player)>(CONFIG.spawn.safeDistance+r+s.player.radius)**2)
    .map(p=>({p,space:clearance(p)})).sort((a,b)=>b.space-a.space)[0].p;
}

export function advanceWave(s: GameState, ctx: CombatContext,spawn:Spawn): void {
  const duration = s.wave === 1 ? CONFIG.waves.firstDuration : CONFIG.waves.duration;
  const remaining=s.waveStartedAt+duration-s.time;
  const epic=epicForWave(s.wave);
  if(!epic&&remaining>CONFIG.waves.eliteLead+1e-9)return;
  if(s.eliteWave!==s.wave){
    const present=new Set(s.enemies.filter(e=>e.hp>0&&isGuard(e.kind)).map(e=>e.kind));
    const guards=epic?[epic]:waveElites(s.wave);
    for(const kind of guards){
      if(present.size>=guards.length)break;
      if(present.has(kind))continue;
      const at=eliteArrival(s,kind,ctx);
      spawn(kind,at);
      ctx.emit({type:'spawn',...at});
      present.add(kind);
    }
    s.eliteWave=s.wave;
  }
  if((!epic&&remaining>1e-9) || s.enemies.some(e=>e.hp>0&&isGuard(e.kind)))return;
  s.waveStartedAt=epic?s.time:Math.max(s.time,s.waveStartedAt+duration);
  s.wave++;
  ctx.emit({type:'wave', wave:s.wave});
}

/** Draw independent world positions, including the interior and the near and far edges.
 * Spawn warnings reserve space just like active enemies. A saturated floor skips this arrival. */
export function spawnMarketEnemies(s:GameState,difficulty:Difficulty,count:number,spawn:Spawn,ctx:Pick<CombatContext,'random'|'emit'>):void {
  const {bounds}=WORLD,settings=CONFIG.spawn;
  const available=Math.min(count,difficulty.cap-s.enemies.length);
  let snackIndex:number|undefined;
  for(let i=0;i<available;i++){
    const roll=ctx.random(),[snacks,box]=difficulty.weights;
    let kind:EnemyKind;
    if(roll<snacks){
      snackIndex??=Math.floor(roll/snacks*snackTray.length);
      kind=snackTray[snackIndex%snackTray.length];
      snackIndex++;
    }else kind=roll<snacks+box?'box':'bowl';
    const radius=CONFIG.enemies[kind].radius;
    const minY=Math.max(CONFIG.player.minY,bounds.top+radius);
    for(let attempt=0;attempt<settings.attempts;attempt++){
      const x=bounds.left+radius+ctx.random()*(bounds.right-bounds.left-2*radius);
      const y=minY+ctx.random()*(bounds.bottom-radius-minY);
      const point={x,y};
      if(distanceSquared(point,s.player)<(settings.safeDistance+s.player.radius+radius)**2)continue;
      if(s.enemies.some(other=>distanceSquared(point,other)<(other.radius+radius+settings.gap)**2))continue;
      spawn(kind,point);
      ctx.emit({type:'spawn',x,y});
      break;
    }
  }
}
