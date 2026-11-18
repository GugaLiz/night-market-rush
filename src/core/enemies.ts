import type {Enemy,GameState} from '../shared/types';
import type {CombatContext} from './contracts';
import {CONFIG,WORLD} from './config';
import {clamp} from './geometry';
/** Slow dispersing crowd with stable soft separation, limited charges and aimed soup shots. */
export function updateEnemies(s:GameState,dt:number,speedScale:number,ctx:CombatContext):Map<number,number>{
  const p=s.player,damage=new Map<number,number>(),positions=s.enemies.map(e=>({id:e.id,x:e.x,y:e.y,radius:e.radius}));
  const grid=new Map<string,typeof positions>();
  for(const e of positions){const key=`${Math.floor(e.x/64)},${Math.floor(e.y/64)}`;const cell=grid.get(key)??[];cell.push(e);grid.set(key,cell);}
  let reservations=s.enemies.filter(e=>e.kind==='box'&&(e.phase==='warn'||e.phase==='dash')).length;
  let shotReservations=s.enemies.filter(e=>e.kind==='bowl'&&(e.shotWarnUntil??0)>0).length;
  for(const e of s.enemies){
    e.px=e.x;e.py=e.y;damage.set(e.id,CONFIG.enemies[e.kind].damage);
    if(!ctx.active(e))continue;
    if(e.stunUntil>s.time){if(e.kind==='bowl'&&(e.shotWarnUntil??0)>0)shotReservations--;e.shotWarnUntil=0;e.shotReadyAt=Math.max(e.shotReadyAt??0,e.stunUntil+1);continue;}
    let dx=(e.lureX??p.x)-e.x,dy=(e.lureY??p.y)-e.y;const length=Math.hypot(dx,dy);if(length>1e-9){dx/=length;dy/=length;}else{dx=0;dy=0;}
    const slow=e.slowUntil>s.time?CONFIG.skills.soda.factor:1;let speed=CONFIG.enemies[e.kind].speed*speedScale*slow;
    if(e.lureX!==undefined&&length<24)speed=0;
    if(e.kind==='box'){
      if(e.phase==='chase'&&s.time>=e.phaseUntil&&length<310&&reservations<CONFIG.dash.concurrent){e.phase='warn';e.phaseUntil=s.time+CONFIG.dash.warning;e.dashX=dx||(dy===0?1:0);e.dashY=dy;reservations++;ctx.emit({type:'warn',x:e.x,y:e.y});}
      else if(e.phase==='warn'&&s.time>=e.phaseUntil){e.phase='dash';e.phaseUntil=s.time+CONFIG.dash.duration;}
      else if(e.phase==='dash'&&s.time>=e.phaseUntil){e.phase='recover';e.phaseUntil=s.time+CONFIG.dash.recovery;reservations--;}
      else if(e.phase==='recover'&&s.time>=e.phaseUntil){e.phase='chase';e.phaseUntil=s.time+CONFIG.dash.approach;}
      if(e.phase==='warn'||e.phase==='recover')speed=0;
      if(e.phase==='dash'){dx=e.dashX;dy=e.dashY;speed=CONFIG.dash.speed*slow;damage.set(e.id,20);}
    }
    if(e.kind==='bowl'){
      const shots=s.enemyShots??(s.enemyShots=[]);
      if((e.shotWarnUntil??0)>0){
        speed=0;
        if(s.time+1e-9>=e.shotWarnUntil!){
          if(shots.length<CONFIG.ranged.cap){const a=e.shotAngle??0;shots.push({id:ctx.id(),ownerId:e.id,x:e.x,y:e.y,px:e.x,py:e.y,vx:Math.cos(a)*CONFIG.ranged.speed,vy:Math.sin(a)*CONFIG.ranged.speed,radius:CONFIG.ranged.radius,damage:CONFIG.ranged.damage,bornAt:s.time,expiresAt:s.time+CONFIG.ranged.lifetime});ctx.emit({type:'enemyShot',x:e.x,y:e.y,angle:a});}
          e.shotWarnUntil=0;shotReservations--;e.shotReadyAt=s.time+CONFIG.ranged.interval+e.id%3*.35;
        }
      }else if((s.practice||s.time>=30)&&s.time>=(e.shotReadyAt??0)&&length<CONFIG.ranged.range&&shots.length<CONFIG.ranged.cap&&shotReservations<CONFIG.ranged.concurrent){
        e.shotAngle=Math.atan2(p.y-e.y,p.x-e.x);e.shotWarnUntil=s.time+CONFIG.ranged.warning;shotReservations++;speed=0;ctx.emit({type:'warn',x:e.x,y:e.y});
      }
    }
    if(e.phase==='chase'&&e.lureX===undefined&&length>150&&speed>0&&!(e.shotWarnUntil??0)){
      if(s.time>=(e.wanderUntil??0)){e.wanderUntil=s.time+1.4+(e.id%7)*.13;e.wanderAngle=(e.wanderAngle??Math.atan2(dy,dx))+(ctx.random()-.5)*1.5;}
      const chase=length<300?.72:.46;dx=dx*chase+Math.cos(e.wanderAngle??0)*(1-chase);dy=dy*chase+Math.sin(e.wanderAngle??0)*(1-chase);const norm=Math.hypot(dx,dy);if(norm){dx/=norm;dy/=norm;}
    }
    if(e.phase!=='dash'&&speed>0){
      let sx=0,sy=0;
      const gx=Math.floor(e.px/64),gy=Math.floor(e.py/64);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const other of grid.get(`${gx+ox},${gy+oy}`)??[]){if(other.id===e.id)continue;let x=e.px-other.x,y=e.py-other.y;const d=Math.hypot(x,y),desired=(e.radius+other.radius)*1.08;if(d>=desired)continue;if(d<.01){x=e.id<other.id?-1:1;y=(e.id%3-1)*.2;}const n=Math.hypot(x,y),strength=(desired-d)/desired;sx+=x/n*strength;sy+=y/n*strength;}
      dx+=sx*.7;dy+=sy*.7;const norm=Math.hypot(dx,dy);if(norm>1){dx/=norm;dy/=norm;}
    }
    if(Math.abs(dx)>.01)e.facing=dx<0?-1:1;
    const x=e.x+dx*speed*dt,y=e.y+dy*speed*dt;e.x=clamp(x,WORLD.bounds.left+e.radius,WORLD.bounds.right-e.radius);e.y=clamp(y,WORLD.bounds.top+e.radius,WORLD.bounds.bottom-e.radius);
    if(e.phase==='dash'&&(e.x!==x||e.y!==y)){e.phase='recover';e.phaseUntil=s.time+CONFIG.dash.recovery;reservations--;}
  }
  return damage;
}
export function updateEnemyShots(s:GameState,dt:number):void{
  const b=WORLD.bounds;s.enemyShots=(s.enemyShots??[]).filter(q=>q.expiresAt>s.time&&q.x>b.left-q.radius&&q.x<b.right+q.radius&&q.y>b.top-q.radius&&q.y<b.bottom+q.radius);
  for(const shot of s.enemyShots){shot.px=shot.x;shot.py=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;}
}
