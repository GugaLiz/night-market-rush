import type {Enemy,EnemyKind,GameState,Vec} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD,enemyMinY,type Difficulty} from './config';
import {clamp} from './geometry';
import {updateGiant} from './giant-bun';
import {hasGuardAttacks,updateGuard} from './guard-attacks';

/** Discard a locked attack when its owner is interrupted, before the next frame can draw or resume it. */
export function stunEnemy(e:Enemy,until:number):void {
  e.stunUntil=Math.max(e.stunUntil,until);
  interruptAttack(e,e.stunUntil);
}

export function interruptAttack(e:Enemy,until:number):void {
  if(hasGuardAttacks(e.kind)){
    delete e.guardCast;
    e.shotReadyAt=Math.max(e.shotReadyAt??0,until+.75);
  }else if(e.kind==='box'||e.kind==='eliteCrab'){
    e.phaseUntil=Math.max(e.phase==='recover'?e.phaseUntil:0,until+.4);
    e.phase='recover';
  }else if(e.kind==='bowl'||e.kind==='eliteKettle'||e.kind==='eliteSesame'){
    e.shotWarnUntil=0;e.volleyRemaining=0;
    e.shotReadyAt=Math.max(e.shotReadyAt??0,until+1);
    delete e.syrupTarget;delete e.syrupImpactAt;
  }else if(e.jump?.phase==='warn'){
    delete e.jump;
  }
}

function turnTowards(heading:number, target:number, maxTurn:number):number {
  const delta=target-heading;
  return heading+clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-maxTurn,maxTurn);
}

function crabTravel(e:Enemy,from:number,to:number):number {
  const duration=Math.max(0,to-from);
  const slowed=clamp(e.slowUntil-from,0,duration);
  return CONFIG.elites.crab.speed*(duration-slowed*(1-CONFIG.skills.soda.factor));
}

function crabWallDistance(e:Enemy):number {
  const b=WORLD.bounds;
  const roomX=e.dashX<0?b.left+e.radius-e.x:b.right-e.radius-e.x;
  const roomY=e.dashY<0?enemyMinY(e.kind,e.radius)-e.y:b.bottom-e.radius-e.y;
  return Math.max(0,Math.min(e.dashX?roomX/e.dashX:Infinity,e.dashY?roomY/e.dashY:Infinity));
}

/** The centerline ends at the first wall, even when the charge is diagonal or its slow expires in flight. */
export function crabChargeReach(e:Enemy,time:number):number {
  const start=e.phase==='warn'?e.phaseUntil:time;
  const end=e.phase==='warn'?start+CONFIG.elites.crab.duration:e.phaseUntil;
  return Math.min(crabTravel(e,start,end),crabWallDistance(e));
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

function freeShotSlots(s:GameState):number {
  const kettles=s.enemies.filter(e=>e.kind==='eliteKettle'&&(e.shotWarnUntil??0)>0).length;
  return CONFIG.ranged.cap-(s.enemyShots?.length??0)-kettles*CONFIG.elites.kettle.shots;
}

function fireShot(s:GameState,e:Enemy,ctx:CombatContext,angle=e.shotAngle??0):boolean {
  const shots=s.enemyShots??(s.enemyShots=[]);
  const tea=e.kind==='eliteKettle',tuning=tea?CONFIG.elites.kettle:CONFIG.ranged;
  if(!tea&&freeShotSlots(s)<=0)return false;
  shots.push({id:ctx.id(),ownerId:e.id,...(tea&&{kind:'tea' as const}),x:e.x,y:e.y,px:e.x,py:e.y,
    vx:Math.cos(angle)*tuning.speed,vy:Math.sin(angle)*tuning.speed,
    radius:tuning.radius,damage:tuning.damage,bornAt:s.time,expiresAt:s.time+tuning.lifetime});
  ctx.emit({type:'enemyShot',x:e.x,y:e.y,angle});
  return true;
}

/** Both cooks lock aim at the start of the warning. Side-stepping after that is always possible. */
function updateCook(s:GameState,e:Enemy,pursuing:boolean,distance:number,ctx:CombatContext):boolean {
  const tea=e.kind==='eliteKettle',tuning=tea?CONFIG.elites.kettle:CONFIG.elites.sesame;
  if(e.syrupImpactAt!==undefined && s.time>=e.syrupImpactAt+CONFIG.elites.sesame.fade){
    delete e.syrupImpactAt;delete e.syrupTarget;
  }
  if((e.shotWarnUntil??0)>0){
    if(s.time+1e-9>=e.shotWarnUntil!){
      if(tea){
        const {shots,spread}=CONFIG.elites.kettle;
        for(let i=0;i<shots;i++)fireShot(s,e,ctx,(e.shotAngle??0)+spread*(i/(shots-1)-.5));
      }else{
        e.syrupImpactAt=s.time;
      }
      e.shotWarnUntil=0;e.shotReadyAt=s.time+tuning.interval;
    }
    return true;
  }
  if(!pursuing || distance>tuning.range)return false;
  if(s.time>=(e.shotReadyAt??0)){
    // Reserve the five tea lanes together, so a telegraphed fan always fires in full.
    if(!tea||freeShotSlots(s)>=CONFIG.elites.kettle.shots){
      e.shotAngle=Math.atan2(s.player.y-e.y,s.player.x-e.x);e.shotWarnUntil=s.time+tuning.warning;
      if(!tea)e.syrupTarget={x:s.player.x,y:s.player.y};
      ctx.emit({type:'warn',x:e.syrupTarget?.x??e.x,y:e.syrupTarget?.y??e.y});
      return true;
    }
  }
  return distance<tuning.range*.68;
}
export interface ChargeContact {damage:number;radius:number}

/** Return the active charge sweeps, including a final segment which reached a wall this step. */
export function updateEnemies(s:GameState,dt:number,difficulty:Difficulty,ctx:CombatContext,spawn:(kind:EnemyKind,at:Vec)=>Enemy):Map<number,ChargeContact>{
  const p=s.player,charges=new Map<number,ChargeContact>(),positions=s.enemies.filter(ctx.active).map(e=>({id:e.id,x:e.x,y:e.y,radius:e.radius}));
  const grid=new Map<string,typeof positions>();
  for(const e of positions){const key=`${Math.floor(e.x/64)},${Math.floor(e.y/64)}`;const cell=grid.get(key)??[];cell.push(e);grid.set(key,cell);}
  let reservations=s.enemies.filter(e=>(e.kind==='box'||e.kind==='eliteCrab')&&(e.phase==='warn'||e.phase==='dash')).length;
  let shotReservations=s.enemies.filter(e=>e.kind==='bowl'&&((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0)).length;
  for(const e of s.enemies){
    const lastDx=e.x-e.px,lastDy=e.y-e.py;
    e.px=e.x;e.py=e.y;
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
    if((e.frostUntil??0)>s.time){
      // The shell can break early. Keep attack recovery relative to the last frozen step.
      interruptAttack(e,s.time);
      continue;
    }
    if(e.kind==='bowl'&&(!pursuing||e.stunUntil>s.time)){
      if((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0){
        shotReservations--;e.shotWarnUntil=0;e.volleyRemaining=0;
        e.shotReadyAt=Math.max(e.shotReadyAt??0,s.time+.4);
      }
      if(e.stunUntil>s.time)e.shotReadyAt=Math.max(e.shotReadyAt??0,e.stunUntil+1);
    }
    if(e.stunUntil>s.time)continue;
    const march=e.march&&s.time<e.march.until?e.march:undefined;
    if(hasGuardAttacks(e.kind)&&updateGuard(s,e,e.kind,pursuing&&!march,playerDistance,dt,difficulty.cap,spawn,ctx.emit))continue;
    let dx=0,dy=0;
    const slow=e.slowUntil>s.time?CONFIG.skills.soda.factor:1;let speed=CONFIG.enemies[e.kind].speed*difficulty.speedScale*slow;
    if(lured){
      const x=e.lureX!-e.x,y=e.lureY!-e.y,distance=Math.hypot(x,y);
      if(distance<24)speed=0;else{dx=x/distance;dy=y/distance;}
    }else if(march){
      dx=march.x;dy=march.y;
    }else if(pursuing){
      if(playerDistance>0){dx=(p.x-e.x)/playerDistance;dy=(p.y-e.y)/playerDistance;}
      if((e.kind==='eliteChili'||e.kind==='epicOpera'||e.kind==='epicPearl')&&playerDistance<390){
        // The dancer circles between sweeps, the masked cook changes flank after a cut,
        // and the cup keeps enough distance to drop another volley.
        const orbit=((e.guardTurn??0)+e.id)%2?1:-1;
        const away=e.kind==='epicPearl'&&playerDistance<230?-1:.26;
        [dx,dy]=[away*dx-orbit*.87*dy,away*dy+orbit*.87*dx];
      }else if(e.kind==='eliteSkewer'&&playerDistance<190){
        dx=-dx;dy=-dy;
      }else if(e.kind==='onigiri' && playerDistance>0){
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
    if(e.kind==='box'||e.kind==='eliteCrab'){
      const crab=e.kind==='eliteCrab',charge=crab?CONFIG.elites.crab:CONFIG.dash;
      if(e.phase==='warn'&&!pursuing){e.phase='chase';e.phaseUntil=s.time+charge.approach;reservations--;}
      else if(e.phase==='chase'&&pursuing&&!march&&s.time>=e.phaseUntil&&playerDistance<(crab?CONFIG.elites.crab.range:310)&&reservations<CONFIG.dash.concurrent){e.phase='warn';e.phaseUntil=s.time+charge.warning;e.dashX=dx||(dy===0?1:0);e.dashY=dy;reservations++;ctx.emit({type:'warn',x:e.x,y:e.y});}
      else if(e.phase==='warn'&&s.time>=e.phaseUntil){e.phase='dash';e.phaseUntil=(crab?e.phaseUntil:s.time)+charge.duration;}
      else if(!crab&&e.phase==='dash'&&s.time>=e.phaseUntil){e.phase='recover';e.phaseUntil=s.time+charge.recovery;reservations--;}
      else if(e.phase==='recover'&&s.time>=e.phaseUntil){e.phase='chase';e.phaseUntil=s.time+charge.approach;}
      if(e.phase==='warn'||e.phase==='recover')speed=0;
      if(e.phase==='dash'&&crab){
        const from=Math.max(s.time-dt,e.phaseUntil-charge.duration),to=Math.min(s.time,e.phaseUntil);
        const travel=crabTravel(e,from,to),wall=crabWallDistance(e),step=Math.min(travel,wall);
        e.x+=step*e.dashX;e.y+=step*e.dashY;
        if(step>0)charges.set(e.id,{damage:charge.damage,radius:CONFIG.elites.crab.halfWidth});
        if(s.time>=e.phaseUntil-1e-9||travel>=wall){
          e.phase='recover';e.phaseUntil=s.time+charge.recovery;reservations--;
        }
        continue;
      }
      if(e.phase==='dash'){dx=e.dashX;dy=e.dashY;speed=charge.speed*slow;charges.set(e.id,{damage:charge.damage,radius:e.radius});}
    }
    if((e.kind==='eliteKettle'||e.kind==='eliteSesame')&&updateCook(s,e,pursuing&&!march,playerDistance,ctx))speed=0;
    if(e.kind==='bowl'){
      const shots=s.enemyShots??(s.enemyShots=[]);
      if((e.volleyRemaining??0)>0){
        speed=0;
        if(s.time+1e-9>=(e.nextVolleyAt??0)){
          e.volleyRemaining=fireShot(s,e,ctx)?e.volleyRemaining!-1:0;
          e.nextVolleyAt=s.time+.32;
          if(!e.volleyRemaining)shotReservations--;
        }
      }else if((e.shotWarnUntil??0)>0){
        speed=0;
        if(s.time+1e-9>=e.shotWarnUntil!){
          const fired=fireShot(s,e,ctx);
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
    if((e.shotWarnUntil??0)>0||(e.volleyRemaining??0)>0)facingX=Math.cos(e.shotAngle??0);
    if(Math.abs(facingX)>.01)e.facing=facingX<0?-1:1;
    const x=e.x+dx*speed*dt,y=e.y+dy*speed*dt;e.x=clamp(x,WORLD.bounds.left+e.radius,WORLD.bounds.right-e.radius);e.y=clamp(y,enemyMinY(e.kind,e.radius),WORLD.bounds.bottom-e.radius);
    if(e.phase==='dash'&&(e.x!==x||e.y!==y)){e.phase='recover';e.phaseUntil=s.time+CONFIG.dash.recovery;reservations--;}
  }
  return charges;
}
export function updateEnemyShots(s:GameState,dt:number):void{
  const b=WORLD.bounds;s.enemyShots=(s.enemyShots??[]).filter(q=>q.expiresAt>s.time&&q.x>b.left-q.radius&&q.x<b.right+q.radius&&q.y>b.top-q.radius&&q.y<b.bottom+q.radius);
  for(const shot of s.enemyShots){shot.px=shot.x;shot.py=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;}
}
