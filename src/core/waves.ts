import {isElite, type EliteKind, type Enemy, type EnemyKind, type GameState, type Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, type Difficulty} from './config';
import {distanceSquared} from './geometry';

type Spawn = (kind:EnemyKind, position:Vec) => Enemy;

// One market tray gives ordinary packs varied silhouettes while keeping their shared wave budget.
const snackTray=['bun','onigiri','siumai','bun','zongzi','onigiri','bun','siumai'] as const;

const headliners:readonly EliteKind[]=['eliteCrab','giantBun','eliteKettle','eliteSesame'];

export function eliteArrival(s:GameState,kind:EliteKind,ctx:Pick<CombatContext,'random'>):Vec {
  const r=CONFIG.enemies[kind].radius,b=WORLD.bounds;
  const points:Vec[]=[];
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const x=b.left+r+(col+.15+.7*ctx.random())*(b.right-b.left-2*r)/5;
    const y=CONFIG.player.minY+(row+.15+.7*ctx.random())*(b.bottom-r-CONFIG.player.minY)/3;
    points.push({x,y});
  }
  const clearance=(p:Vec)=>Math.min(
    Math.hypot(p.x-s.player.x,p.y-s.player.y)-CONFIG.spawn.safeDistance-s.player.radius-r,
    ...s.enemies.filter(e=>e.hp>0).map(e=>Math.hypot(p.x-e.x,p.y-e.y)-r-e.radius-(isElite(e.kind)?135:10))
  );
  return points.filter(p=>distanceSquared(p,s.player)>(CONFIG.spawn.safeDistance+r+s.player.radius)**2)
    .map(p=>({p,space:clearance(p)})).sort((a,b)=>b.space-a.space)[0].p;
}

export function advanceWave(s: GameState, ctx: CombatContext,spawn:Spawn): void {
  const duration = s.wave === 1 ? CONFIG.waves.firstDuration : CONFIG.waves.duration;
  const remaining=s.waveStartedAt+duration-s.time;
  if(remaining>CONFIG.waves.eliteLead+1e-9)return;
  if(s.eliteWave!==s.wave){
    const present=new Set(s.enemies.filter(e=>e.hp>0&&isElite(e.kind)).map(e=>e.kind));
    const count=s.wave>=4?CONFIG.waves.maxElites:1;
    for(let i=0;present.size<count;i++){
      const kind=headliners[(s.wave-1+i)%headliners.length];
      if(present.has(kind))continue;
      const at=eliteArrival(s,kind,ctx);
      spawn(kind,at);
      ctx.emit({type:'spawn',...at});
      present.add(kind);
    }
    s.eliteWave=s.wave;
  }
  if(remaining>1e-9 || s.enemies.some(e=>e.hp>0&&isElite(e.kind)))return;
  s.waveStartedAt=Math.max(s.time,s.waveStartedAt+duration);
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
