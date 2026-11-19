import type {Enemy,GameState} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD} from './config';
import {clamp} from './geometry';
import {updateGiant} from './giant-bun';

/** Discard a locked attack when its owner is interrupted, before the next frame can draw or resume it. */
export function stunEnemy(e:Enemy,until:number):void {
  e.stunUntil=Math.max(e.stunUntil,until);
  if(e.kind==='box'){
    e.phaseUntil=Math.max(e.phase==='recover'?e.phaseUntil:0,e.stunUntil+.4);
    e.phase='recover';
  }else if(e.kind==='bowl'){
    e.shotWarnUntil=0;e.volleyRemaining=0;
    e.shotReadyAt=Math.max(e.shotReadyAt??0,e.stunUntil+1);
  }else if(e.jump?.phase==='warn'){
    delete e.jump;
  }
}

function turnTowards(heading:number, target:number, maxTurn:number):number {
  const delta=target-heading;
  return heading+clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-maxTurn,maxTurn);
}

/** The walking and drawing clocks share the crest of each dumpling's hop. */
export function siumaiHop(e:Pick<Enemy,'id'|'spawnAt'>,time:number):number {
  return .5-.5*Math.cos((time-e.spawnAt)*9+e.id*2.4);
}

function wander(e:Enemy,time:number,dt:number,ctx:CombatContext):{x:number;y:number} {
  if(e.wanderAngle===undefined || time>=(e.wanderUntil??0)){
    e.wanderAngle=e.wanderAngle===undefined?ctx.random()*Math.PI*2:e.wanderAngle+(ctx.random()-.5)*Math.PI*1.25;
    e.wanderUntil=time+1.3+ctx.random()*1.8;
  }
  const b=WORLD.bounds,margin=e.radius+12;
  let x=Math.cos(e.wanderAngle),y=Math.sin(e.wanderAngle);
  if((x<0&&e.x<b.left+margin)||(x>0&&e.x>b.right-margin))x=-x;
  if((y<0&&e.y<b.top+margin)||(y>0&&e.y>b.bottom-margin))y=-y;
  e.wanderAngle=Math.atan2(y,x);
  const heading=e.wanderHeading??e.wanderAngle;
  e.wanderHeading=turnTowards(heading,e.wanderAngle,2.8*dt);
  return {x:Math.cos(e.wanderHeading),y:Math.sin(e.wanderHeading)};
}

function fireSoupShot(s:GameState, e:Enemy, ctx:CombatContext):boolean {
  const shots=s.enemyShots??(s.enemyShots=[]);
  if(shots.length>=CONFIG.ranged.cap)return false;
  const angle=e.shotAngle??0;
  shots.push({id:ctx.id(),ownerId:e.id,x:e.x,y:e.y,px:e.x,py:e.y,
    vx:Math.cos(angle)*CONFIG.ranged.speed,vy:Math.sin(angle)*CONFIG.ranged.speed,
    radius:CONFIG.ranged.radius,damage:CONFIG.ranged.damage,bornAt:s.time,expiresAt:s.time+CONFIG.ranged.lifetime});
  ctx.emit({type:'enemyShot',x:e.x,y:e.y,angle});
  return true;
}
/** Slow dispersing crowd with stable soft separation, limited charges and aimed soup shots. */
export function updateEnemies(s:GameState,dt:number,speedScale:number,ctx:CombatContext):Map<number,number>{
  const p=s.player,damage=new Map<number,number>(),positions=s.enemies.filter(ctx.active).map(e=>({id:e.id,x:e.x,y:e.y,radius:e.radius}));
  const grid=new Map<string,typeof positions>();
  for(const e of positions){const key=`${Math.floor(e.x/64)},${Math.floor(e.y/64)}`;const cell=grid.get(key)??[];cell.push(e);grid.set(key,cell);}
  let reservations=s.enemies.filter(e=>e.kind==='box'&&(e.phase==='warn'||e.phase==='dash')).length;
  let shotReservations=s.enemies.filter(e=>e.kind==='bowl'&&((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0)).length;
  for(const e of s.enemies){
    const lastDx=e.x-e.px,lastDy=e.y-e.py;
    e.px=e.x;e.py=e.y;damage.set(e.id,CONFIG.enemies[e.kind].damage);
    if(e.kind==='giantBun'){updateGiant(s,e,ctx);continue;}
    if(!ctx.active(e))continue;
    const playerDistance=Math.hypot(p.x-e.x,p.y-e.y),awareness=CONFIG.awareness[e.kind];
    const previousAlert=e.alerted;
    e.alerted=playerDistance<=(previousAlert?awareness.release:awareness.notice)+1e-9;
    if(previousAlert&&!e.alerted){
      delete e.wanderAngle;
      if(lastDx||lastDy)e.wanderHeading=Math.atan2(lastDy,lastDx);
    }
    const lured=e.lureX!==undefined&&e.lureY!==undefined;
    const pursuing=e.alerted&&!lured;
    if(e.kind==='bowl'&&(!pursuing||e.stunUntil>s.time)){
      if((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0){
        shotReservations--;e.shotWarnUntil=0;e.volleyRemaining=0;
        e.shotReadyAt=Math.max(e.shotReadyAt??0,s.time+.4);
      }
      if(e.stunUntil>s.time)e.shotReadyAt=Math.max(e.shotReadyAt??0,e.stunUntil+1);
    }
    if(e.stunUntil>s.time)continue;
    const march=e.march&&s.time<e.march.until?e.march:undefined;
    let dx=0,dy=0;
    const slow=e.slowUntil>s.time?CONFIG.skills.soda.factor:1;let speed=CONFIG.enemies[e.kind].speed*speedScale*slow;
    if(lured){
      const x=e.lureX!-e.x,y=e.lureY!-e.y,distance=Math.hypot(x,y);
      if(distance<24)speed=0;else{dx=x/distance;dy=y/distance;}
    }else if(march){
      dx=march.x;dy=march.y;
    }else if(pursuing){
      if(playerDistance>0){dx=(p.x-e.x)/playerDistance;dy=(p.y-e.y)/playerDistance;}
      if(e.kind==='onigiri' && playerDistance>0){
        // The rice ball keeps rolling through turns. A sharp dodge can send it wide.
        const target=Math.atan2(dy,dx);
        e.wanderHeading=turnTowards(e.wanderHeading??target,target,3.6*dt);
        dx=Math.cos(e.wanderHeading);dy=Math.sin(e.wanderHeading);
      }else if(e.kind==='zongzi' && playerDistance>0){
        // Approach from one flank; unfold the arc into a direct approach in the last few steps.
        const angle=Math.atan2(dy,dx)+(e.id%2?1:-1)*.69*clamp((playerDistance-28)/70,0,1);
        dx=Math.cos(angle);dy=Math.sin(angle);
      }else if(e.kind==='bun'&&e.id%3!==0){
        const beat=s.time*(2.8+e.id%4*.21)+e.id*2.4;
        const arc=clamp((playerDistance-30)/90,0,1)*Math.sin(beat)*.40;
        const cos=Math.cos(arc),sin=Math.sin(arc);
        [dx,dy]=[dx*cos-dy*sin,dx*sin+dy*cos];
        speed*=1.38*(1+.09*Math.cos(beat*2));
      }
    }else{
      const direction=wander(e,s.time,dt,ctx);dx=direction.x;dy=direction.y;speed*=.55;
    }
    if(e.kind==='siumai' && !march && !lured)speed*=.55+siumaiHop(e,s.time)*.90;
    if(e.kind==='box'){
      if(e.phase==='warn'&&!pursuing){e.phase='chase';e.phaseUntil=s.time+CONFIG.dash.approach;reservations--;}
      else if(e.phase==='chase'&&pursuing&&!march&&s.time>=e.phaseUntil&&playerDistance<310&&reservations<CONFIG.dash.concurrent){e.phase='warn';e.phaseUntil=s.time+CONFIG.dash.warning;e.dashX=dx||(dy===0?1:0);e.dashY=dy;reservations++;ctx.emit({type:'warn',x:e.x,y:e.y});}
      else if(e.phase==='warn'&&s.time>=e.phaseUntil){e.phase='dash';e.phaseUntil=s.time+CONFIG.dash.duration;}
      else if(e.phase==='dash'&&s.time>=e.phaseUntil){e.phase='recover';e.phaseUntil=s.time+CONFIG.dash.recovery;reservations--;}
      else if(e.phase==='recover'&&s.time>=e.phaseUntil){e.phase='chase';e.phaseUntil=s.time+CONFIG.dash.approach;}
      if(e.phase==='warn'||e.phase==='recover')speed=0;
      if(e.phase==='dash'){dx=e.dashX;dy=e.dashY;speed=CONFIG.dash.speed*slow;damage.set(e.id,CONFIG.dash.damage);}
    }
    if(e.kind==='bowl'){
      const shots=s.enemyShots??(s.enemyShots=[]);
      if((e.volleyRemaining??0)>0){
        speed=0;
        if(s.time+1e-9>=(e.nextVolleyAt??0)){
          e.volleyRemaining=fireSoupShot(s,e,ctx)?e.volleyRemaining!-1:0;
          e.nextVolleyAt=s.time+.32;
          if(!e.volleyRemaining)shotReservations--;
        }
      }else if((e.shotWarnUntil??0)>0){
        speed=0;
        if(s.time+1e-9>=e.shotWarnUntil!){
          const fired=fireSoupShot(s,e,ctx);
          e.shotWarnUntil=0;e.shotReadyAt=s.time+CONFIG.ranged.interval+e.id%3*.35;
          if(fired&&s.wave>=2){e.volleyRemaining=2;e.nextVolleyAt=s.time+.32;}
          else shotReservations--;
        }
      }else if(pursuing&&!march&&s.time>=(e.shotReadyAt??0)&&playerDistance<=CONFIG.ranged.range&&shots.length<CONFIG.ranged.cap&&shotReservations<CONFIG.ranged.concurrent){
        e.shotAngle=Math.atan2(p.y-e.y,p.x-e.x);e.shotWarnUntil=s.time+CONFIG.ranged.warning;shotReservations++;speed=0;ctx.emit({type:'warn',x:e.x,y:e.y});
      }
    }
    if(e.phase!=='dash'&&speed>0){
      let sx=0,sy=0;
      const gx=Math.floor(e.px/64),gy=Math.floor(e.py/64);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const other of grid.get(`${gx+ox},${gy+oy}`)??[]){if(other.id===e.id)continue;let x=e.px-other.x,y=e.py-other.y;const d=Math.hypot(x,y),desired=(e.radius+other.radius)*1.08;if(d>=desired)continue;if(d<.01){x=e.id<other.id?-1:1;y=(e.id%3-1)*.2;}const n=Math.hypot(x,y),strength=(desired-d)/desired;sx+=x/n*strength;sy+=y/n*strength;}
      dx+=sx*.7;dy+=sy*.7;const norm=Math.hypot(dx,dy);if(norm>1){dx/=norm;dy/=norm;}
    }
    let facingX=dx;
    if(e.phase==='warn')facingX=e.dashX;
    if(e.kind==='bowl'&&((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0))facingX=Math.cos(e.shotAngle??0);
    if(Math.abs(facingX)>.01)e.facing=facingX<0?-1:1;
    const x=e.x+dx*speed*dt,y=e.y+dy*speed*dt;e.x=clamp(x,WORLD.bounds.left+e.radius,WORLD.bounds.right-e.radius);e.y=clamp(y,WORLD.bounds.top+e.radius,WORLD.bounds.bottom-e.radius);
    if(e.phase==='dash'&&(e.x!==x||e.y!==y)){e.phase='recover';e.phaseUntil=s.time+CONFIG.dash.recovery;reservations--;}
  }
  return damage;
}
export function updateEnemyShots(s:GameState,dt:number):void{
  const b=WORLD.bounds;s.enemyShots=(s.enemyShots??[]).filter(q=>q.expiresAt>s.time&&q.x>b.left-q.radius&&q.x<b.right+q.radius&&q.y>b.top-q.radius&&q.y<b.bottom+q.radius);
  for(const shot of s.enemyShots){shot.px=shot.x;shot.py=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;}
}
