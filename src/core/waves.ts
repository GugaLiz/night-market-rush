import type {Enemy, EnemyKind, GameState, Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG, WORLD, type Difficulty} from './config';
import {distanceSquared} from './geometry';

type Spawn = (kind:EnemyKind, position:Vec) => Enemy;

// One market tray gives ordinary packs varied silhouettes while keeping their shared wave budget.
const snackTray=['bun','onigiri','siumai','bun','zongzi','onigiri','bun','siumai'] as const;

export function advanceWave(s: GameState, ctx: CombatContext): void {
  const duration = s.wave === 1 ? CONFIG.waves.firstDuration : CONFIG.waves.duration;
  if (s.time + 1e-9 < s.waveStartedAt + duration) return;
  s.waveStartedAt += duration;
  s.wave++;
  ctx.emit({type:'wave', wave:s.wave});
}

/** Draw independent world positions, including the interior and the near and far edges.
 * Spawn warnings reserve space just like active enemies. A saturated floor skips this arrival. */
export function spawnMarketEnemies(s:GameState,difficulty:Difficulty,count:number,spawn:Spawn,ctx:Pick<CombatContext,'random'|'emit'>):void {
  const {bounds}=WORLD,settings=CONFIG.spawn;
  const available=Math.min(count,difficulty.cap-s.enemies.length);
  const eliteDue=s.wave%2===0 && s.lastGiantWave!==s.wave && !s.enemies.some(e=>e.kind==='giantBun');
  let snackIndex:number|undefined;
  for(let i=0;i<available;i++){
    const roll=ctx.random(),[snacks,box]=difficulty.weights;
    let kind:EnemyKind;
    if(i===0&&eliteDue)kind='giantBun';
    else if(roll<snacks){
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
      if(kind==='giantBun')s.lastGiantWave=s.wave;
      ctx.emit({type:'spawn',x,y});
      break;
    }
  }
}
