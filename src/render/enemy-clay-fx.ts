import {CONFIG,WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import {giantJumpHeight,giantPulseLifetime,giantPulseRadius} from '../core/giant-bun';
import {crabChargeReach,siumaiHop} from '../core/enemies';
import {enemyHeight} from './enemy-vitals';
import {isElite} from '../shared/types';
import type {Enemy,EnemyShot,GameState,Player,Settings} from '../shared/types';
import type {Assets} from './assets';

const turn=Math.PI*2;
const floor=WORLD.bounds;
type Canvas=CanvasRenderingContext2D;

function clipFloor(c:Canvas){
  c.beginPath();c.rect(floor.left,floor.top,floor.right-floor.left,floor.bottom-floor.top);c.clip();
}
function arc(c:Canvas,x:number,y:number,r:number,start:number,end:number,color:string,width:number){
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,r,start,end);c.stroke();
}
function pathline(c:Canvas,sx:number,sy:number,tx:number,ty:number){
  c.beginPath();c.moveTo(sx,sy);c.lineTo(tx,ty);c.stroke();
}
function chevron(c:Canvas,x:number,extent:number){
  c.beginPath();c.moveTo(x-extent,-extent);c.lineTo(x,0);c.lineTo(x-extent,extent);c.stroke();
}

/** A prop painted into the sprite follows the same foot pivot, tilt and squash as its owner. */
function toolPosition(e:Enemy,time:number,settings:Settings,side:number,up:number){
  const height=enemyHeight(e.kind),pose=getEnemyAttackPose(e,time,settings);
  const dx=e.facing*side*height,dy=-up*height,cos=Math.cos(pose.tilt),sin=Math.sin(pose.tilt);
  return {x:e.x+(dx*cos-dy*sin)*pose.scaleX,y:e.y-pose.lift+(dx*sin+dy*cos)*pose.scaleY};
}

function syrupLanding(c:Canvas,e:Enemy,time:number,settings:Settings):void {
  if(!e.syrupTarget)return;
  const {warning,radius,fade}=CONFIG.elites.sesame;
  const remaining=(e.shotWarnUntil??0)-time, age=time-(e.syrupImpactAt??-Infinity);
  if(remaining<=0&&(age<0||age>=fade))return;
  c.save();clipFloor(c);c.translate(e.syrupTarget.x,e.syrupTarget.y);c.lineCap='round';
  const progress=clamp(1-remaining/warning,0,1);
  if(remaining>0){
    c.fillStyle='rgba(189,99,54,'+(.13+progress*.14)+')';
    c.beginPath();c.arc(0,0,radius,0,turn);c.fill();
    arc(c,0,0,radius,0,turn,'#733e35',5);arc(c,0,0,radius,0,turn,'#ffd295',2.5);
    const ring=radius*(settings.reduceMotion?.52:.33+.60*(1-progress));
    c.setLineDash([5,7]);arc(c,0,0,ring,0,turn,'#ffe8adbb',2);c.setLineDash([]);
  }else{
    const t=clamp(age/fade,0,1),r=radius*(settings.reduceMotion?.94:.28+.72*(1-(1-t)**3));
    c.globalAlpha=(1-t)**.75;
    arc(c,0,0,radius,0,turn,'#ffc783c2',3);
    c.beginPath();
    for(let i=0;i<=40;i++){
      const a=i*turn/40,edge=r*(.80+.11*Math.cos(a*5+.6)+.07*Math.cos(a*3));
      const x=Math.cos(a)*edge,y=Math.sin(a)*edge;
      if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
    }
    c.closePath();c.fillStyle='#955234bc';c.strokeStyle='#eeb574';c.lineWidth=2.4;c.fill();c.stroke();
    const count=settings.quality==='simple'?5:9;
    for(let i=0;i<count;i++){
      const a=i*turn/count+.29;
      c.fillStyle=i%2?'#442e29':'#ffda9a';c.beginPath();c.ellipse(Math.cos(a)*r*.94,Math.sin(a)*r*.94,5,2.3,a,0,turn);c.fill();
    }
  }
  c.restore();
}

export function drawSyrupDrop(c:Canvas,e:Enemy,time:number,settings:Settings):void {
  if(!e.syrupTarget||(e.shotWarnUntil??0)<=time)return;
  const u=clamp(1-((e.shotWarnUntil??time)-time)/CONFIG.elites.sesame.warning,0,1);
  const {x:startX,y:startY}=toolPosition(e,time,settings,.416,.575),end=e.syrupTarget;
  const x=settings.reduceMotion?end.x:startX+(end.x-startX)*u;
  const y=settings.reduceMotion?end.y-19:startY+(end.y-startY)*u-420*u*(1-u);
  c.save();c.translate(x,y);
  if(!settings.reduceMotion)c.rotate(Math.atan2(end.y-startY-420*(1-2*u),end.x-startX));
  const scale=.84+.53*u;
  c.scale(scale,scale);
  c.fillStyle='#b2693e';c.strokeStyle='#ffcf85';c.lineWidth=2.2;c.beginPath();
  c.moveTo(-16,0);c.bezierCurveTo(-7,-1,-5,-9,2,-8);c.bezierCurveTo(12,-7,13,7,2,8);
  c.bezierCurveTo(-6,8,-8,1,-16,0);c.fill();c.stroke();
  c.fillStyle='#4f342b';c.beginPath();c.ellipse(1,2,2.9,1.3,-.42,0,turn);c.fill();
  c.fillStyle='#ffeac2';c.beginPath();c.ellipse(4,-3,3,1.5,-.16,0,turn);c.fill();c.restore();
}

export function drawEnemyAttackGround(c:Canvas,e:Enemy,time:number,settings:Settings):void{
  if(e.kind==='eliteSesame'){
    syrupLanding(c,e,time,settings);
  }else if(e.kind==='giantBun' && e.jump && e.jump.phase!=='rest'){
    const j=e.jump,heavy=j.hop===3;
    const progress=clamp((time-j.startedAt)/(j.until-j.startedAt),0,1);
    const radius=CONFIG.giant.stompRadius;
    c.save();clipFloor(c);c.lineCap='round';
    c.setLineDash([6,11]);c.strokeStyle='#fdba8a95';c.lineWidth=2.5;
    c.beginPath();c.moveTo(e.x,e.y);
    c.quadraticCurveTo((e.x+j.target.x)*.5,Math.min(e.y,j.target.y)-60,j.target.x,j.target.y);c.stroke();c.setLineDash([]);
    c.translate(j.target.x,j.target.y);
    const start=heavy?j.gapAngle+CONFIG.giant.gapHalfAngle:0;
    const end=heavy?j.gapAngle+turn-CONFIG.giant.gapHalfAngle:turn;
    c.beginPath();c.moveTo(0,0);c.arc(0,0,radius,start,end);c.closePath();
    c.fillStyle='rgba(231,100,61,'+(.15+.16*progress)+')';c.fill();
    arc(c,0,0,radius,start,end,'#773934',7);arc(c,0,0,radius,start,end,'#ffb780',3);
    for(let i=0;i<8;i++){
      const a=start+(end-start)*(i+.5)/8;
      const inner=radius*.43;
      c.strokeStyle='#ffd4a4';c.lineWidth=2.5;
      c.beginPath();c.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);
      c.quadraticCurveTo(Math.cos(a+.18)*(inner+12),Math.sin(a+.18)*(inner+12),Math.cos(a+.12)*(radius-9),Math.sin(a+.12)*(radius-9));c.stroke();
    }
    if(heavy){
      c.strokeStyle='#ffe3aece';c.lineWidth=2;c.setLineDash([8,12]);
      const street=Math.hypot(floor.right-floor.left,floor.bottom-floor.top);
      for(const a of [start,end])pathline(c,Math.cos(a)*radius,Math.sin(a)*radius,Math.cos(a)*street,Math.sin(a)*street);
      c.setLineDash([]);c.rotate(j.gapAngle);
      for(const offset of [radius+12,radius+34]){c.strokeStyle='#fff0cc';c.lineWidth=3;chevron(c,offset,7);}
      c.rotate(-j.gapAngle);
    }
    if(j.phase==='flight'){
      c.setLineDash([]);c.fillStyle='rgba(60,31,23,'+(.08+.28*progress)+')';
      c.beginPath();c.ellipse(0,0,15+18*progress,6+5*progress,0,0,turn);c.fill();
    }
    c.restore();
  }else if((e.kind==='box'||e.kind==='eliteCrab') && (e.phase==='warn'||e.phase==='dash')){
    const crab=e.kind==='eliteCrab',attack=crab?CONFIG.elites.crab:CONFIG.dash;
    const seconds=e.phase==='dash'?clamp(e.phaseUntil-time,0,attack.duration):attack.duration;
    const length=crab?crabChargeReach(e,time):attack.speed*seconds*(e.slowUntil>time?CONFIG.skills.soda.factor:1);
    if(!crab&&length<2)return;
    const half=crab?CONFIG.elites.crab.halfWidth:e.radius;
    c.save();clipFloor(c);c.translate(e.x,e.y);c.rotate(Math.atan2(e.dashY,e.dashX));
    c.fillStyle=e.phase==='dash'?'#ff925662':'#ed6d5055';
    c.strokeStyle=crab?'#ffd091':'#ffa476';c.lineWidth=crab?3:1.6;
    if(crab){
      c.beginPath();c.roundRect(-half,-half,length+2*half,2*half,half);c.fill();c.stroke();
    }else{
      c.fillRect(0,-half,length,2*half);
      pathline(c,0,-half,length,-half);pathline(c,0,half,length,half);
    }
    c.strokeStyle='#ffdb92';c.lineWidth=3;c.lineJoin='round';
    for(const offset of [0,12])if(length>offset+10)chevron(c,length-offset,6);
    if(!crab&&e.phase==='warn'){
      // The tear notches on the packing tape run towards the locked end of the delivery lane.
      const progress=clamp(1-(e.phaseUntil-time)/attack.warning,0,1);
      const spacing=settings.quality==='simple'?54:36;
      c.lineWidth=2.8;c.strokeStyle='#ffe1a9ba';
      for(let x=20+(settings.reduceMotion?0:progress*spacing);x<length-12;x+=spacing){
        pathline(c,x-4,-e.radius+1,x,-e.radius+6);
        pathline(c,x-4,e.radius-1,x,e.radius-6);
      }
    }
    if(crab){
      const ramp=e.phase==='warn'?clamp(1-(e.phaseUntil-time)/attack.warning,0,1):1;
      for(const side of [-1,1]){
        c.strokeStyle='#d96c45';c.lineWidth=4;c.beginPath();
        c.moveTo(length*.26,side*half);c.quadraticCurveTo(length*.42,side*half,length*.50,side*half*.47*(1-ramp*.55));c.stroke();
      }
    }
    c.restore();
  }else if(e.kind==='eliteKettle' && (e.shotWarnUntil??0)>time){
    const {spread,shots,speed,lifetime,warning,radius}=CONFIG.elites.kettle;
    const progress=clamp(1-((e.shotWarnUntil??time)-time)/warning,0,1);
    c.save();clipFloor(c);c.translate(e.x,e.y);c.rotate(e.shotAngle??0);
    c.lineCap='round';
    for(let i=0;i<shots;i++){
      const a=spread*(i/(shots-1)-.5);
      c.save();c.rotate(a);
      // Each tea drop sweeps a separate lane. Leave the gaps clear all the way to the kerb.
      c.lineWidth=radius*2;c.strokeStyle='rgba(233,167,69,'+(.12+progress*.17)+')';
      pathline(c,0,0,speed*lifetime,0);
      c.strokeStyle='#fbd399c2';c.lineWidth=2;
      c.setLineDash([4,16]);pathline(c,22,0,speed*lifetime,0);c.setLineDash([]);
      c.strokeStyle='#ffe5ab';chevron(c,104+progress*10,7);c.restore();
    }
    c.restore();
  }else if(e.kind==='bowl' && (e.shotWarnUntil??0)>time){
    const progress=clamp(1-((e.shotWarnUntil??time)-time)/CONFIG.ranged.warning,0,1);
    c.save();clipFloor(c);c.translate(e.x,e.y);c.rotate(e.shotAngle??0);
    c.strokeStyle='#ffd59a';c.lineWidth=2;c.setLineDash([3,10]);
    if(!settings.reduceMotion)c.lineDashOffset=-progress*14;
    pathline(c,0,0,CONFIG.ranged.speed*CONFIG.ranged.lifetime,0);c.setLineDash([]);
    c.strokeStyle='#ffa655';c.lineWidth=3;chevron(c,52,5);
    c.restore();
    c.save();arc(c,e.x,e.y-49,13,-Math.PI/2,-Math.PI/2+progress*turn,'#ffe8a7',3);c.restore();
  }
}

export function enemyExpression(e:Enemy,time:number):string {
  const hurt=time-e.hurtAt<.16,low=e.hp<=e.maxHp*.35;
  if(isElite(e.kind)&&e.kind!=='giantBun')return e.kind;
  if(e.kind==='onigiri'||e.kind==='siumai'||e.kind==='zongzi'){
    if(hurt)return e.kind+'Hurt';
    if(low)return e.kind+'Low';
    return e.alerted && e.stunUntil<=time ? e.kind+'Alert' : e.kind;
  }
  if(e.kind==='giantBun'||e.kind==='bun'){
    if(hurt)return e.kind+'Hurt';
    if(low)return e.kind+'Low';
    if(e.kind==='giantBun')return e.kind;
  }
  if(e.phase==='warn'||e.phase==='dash'||(e.shotWarnUntil??0)>time||(e.volleyRemaining??0)>0)return e.kind;
  if(e.stunUntil>time||hurt||e.phase==='recover')return e.kind+'Curious';
  if(low)return e.kind+'Low';
  if(e.lureX!==undefined)return e.kind+'Grin';
  const mood=e.id%3;
  return mood===0?e.kind:mood===1?e.kind+'Grin':e.kind+'Curious';
}

export function getEnemyAttackPose(e:Enemy,time:number,settings:Settings){
  const pose={lift:0,scaleX:1,scaleY:1,tilt:0};
  const j=e.jump,amount=settings.reduceMotion?.38:1;
  if(j){
    const u=clamp((time-j.startedAt)/(j.until-j.startedAt),0,1);
    if(j.phase==='flight'){
      const height=4*u*(1-u);
      pose.lift=giantJumpHeight(e,time)*amount;
      pose.scaleX-=.10*height*amount;pose.scaleY+=.14*height*amount;
      pose.tilt=e.facing*Math.sin(u*turn)*.095*amount;
    }else{
      const squat=j.phase==='warn'?u:Math.max(0,1-(time-j.startedAt)/(j.hop===3?.98:.28));
      pose.scaleX+=squat*.23*amount;pose.scaleY-=squat*.31*amount;
    }
  }else if((e.kind==='box'||e.kind==='eliteCrab') && (e.phase==='warn'||e.phase==='dash')){
    const warning=e.kind==='eliteCrab'?CONFIG.elites.crab.warning:CONFIG.dash.warning;
    const u=e.phase==='warn'?1-clamp((e.phaseUntil-time)/warning,0,1):1;
    pose.tilt=e.facing*.14*u*amount;pose.scaleY-=.1*u*amount;pose.scaleX+=.08*u*amount;
  }else if((e.kind==='bowl'||e.kind==='eliteKettle'||e.kind==='eliteSesame') && (e.shotWarnUntil??0)>time){
    const warning=e.kind==='bowl'?CONFIG.ranged.warning:e.kind==='eliteKettle'?CONFIG.elites.kettle.warning:CONFIG.elites.sesame.warning;
    const u=clamp(1-((e.shotWarnUntil??time)-time)/warning,0,1);
    pose.tilt=-e.facing*.13*u*amount;pose.scaleY+=.05*u*amount;
  }else if(!settings.reduceMotion && e.kind!=='giantBun' && e.stunUntil<=time && (e.chilledUntil??0)<=time && (e.frostUntil??0)<=time &&
    e.phase!=='recover' && (e.volleyRemaining??0)===0){
    const pace=e.alerted?1.42:1;
    const phase=(time-e.spawnAt)*(e.kind==='bun'?7.6:e.kind==='box'?8.9:5.6)*pace+e.id*2.4;
    const wave=Math.sin(phase);
    const resting=(e.march && !e.march.x && !e.march.y) ||
      (e.lureX!==undefined && Math.hypot(e.lureX-e.x,(e.lureY??e.y)-e.y)<24);
    if(resting){
      pose.scaleY+=.016*Math.sin(time*2.8+e.id);
    }else if(e.kind==='siumai'){
      const hop=siumaiHop(e,time);
      pose.lift=hop*(e.alerted?10:6.5);
      pose.scaleX+=.10-hop*.15;pose.scaleY+=hop*.16-.10;
    }else if(e.kind==='onigiri'){
      // Rock over the rounded bottom corners as the rice triangle banks through a turn.
      const roll=Math.sin((time-e.spawnAt)*7*pace+e.id);
      pose.tilt=e.facing*(roll*.18+.045);
      pose.lift=Math.abs(roll)*2;
    }else if(e.kind==='zongzi'){
      const sway=Math.sin((time-e.spawnAt)*4.9*pace+e.id);
      pose.tilt=e.facing*sway*.12;pose.lift=Math.abs(sway)*1.5;
    }else{
      const hop=Math.max(0,wave);
      pose.lift=hop*(e.kind==='bun'?5.4:e.kind==='box'?2.0:1.6)*pace;
      const squash=e.kind==='bun'?.055:.021;
      pose.scaleX-=wave*squash;pose.scaleY+=wave*squash;
      pose.tilt=e.facing*Math.cos(phase)*(e.kind==='box'?.077:e.kind==='bowl'?.048:.038);
    }
  }
  return pose;
}

/** Close-range movement marks yield to the locked attack warnings when a crowd packs together. */
export function drawSnackPursuitTrails(c:Canvas,s:GameState,settings:Settings):void {
  const {time,player}=s, simple=settings.quality==='simple';
  const distance=(e:Enemy)=>(e.x-player.x)**2+(e.y-player.y)**2;
  const nearby=s.enemies.filter(e=>
    (e.kind==='bun'||e.kind==='onigiri'||e.kind==='siumai'||e.kind==='zongzi')&&
    e.hp>0&&e.alerted&&e.lureX===undefined&&!e.march&&e.stunUntil<=time&&(e.frostUntil??0)<=time&&
    time-e.spawnAt>=CONFIG.spawn.warning&&distance(e)<(simple?125:180)**2
  ).sort((a,b)=>distance(a)-distance(b)).slice(0,simple?4:8);
  for(const e of nearby){
    const dx=e.x-e.px,dy=e.y-e.py;
    if(dx===0&&dy===0)continue;
    const heading=Math.atan2(dy,dx), foot=settings.reduceMotion?.46:((time-e.spawnAt)*2.5+e.id*.39)%1;
    c.save();c.translate(e.x,e.y);c.rotate(heading);c.lineCap='round';
    c.globalAlpha=.82;
    if(e.kind==='siumai'){
      const hop=siumaiHop(e,time);
      if(hop<.34){
        const spread=1-hop/.34;
        c.strokeStyle='#f7d79c';c.lineWidth=2;
        for(const side of [-1,1]){
          c.beginPath();c.moveTo(-6,side*(8+spread*2));
          c.quadraticCurveTo(-11,side*(11+spread*4),-16,side*(9+spread*6));c.stroke();
          if(!simple){
            c.fillStyle='#e2ab62';c.beginPath();c.ellipse(-19,side*(12+spread*5),2.8,1.7,side*.28,0,turn);c.fill();
          }
        }
      }
    }else if(e.kind==='bun'){
      for(let i=0;i<(simple?2:3);i++){
        const u=(foot+i/(simple?2:3))%1, side=i%2?1:-1;
        c.fillStyle='rgba(247,228,194,'+(.78-.58*u)+')';c.beginPath();
        c.ellipse(-10-u*24,side*(4+u*3),4.3-u*1.6,2.4-u,.28*side,0,turn);c.fill();
      }
    }else if(e.kind==='onigiri'){
      const target=Math.atan2(player.y-e.y,player.x-e.x);
      const bank=Math.sin(target-heading);
      c.strokeStyle='#f3d8a8ae';c.lineWidth=2.3;c.beginPath();c.moveTo(-8,4);
      c.quadraticCurveTo(-19,5,-31,4+bank*13);c.stroke();
      c.fillStyle='#56423b';c.beginPath();c.ellipse(-15-foot*13,7+bank*5,3,1.6,.4,0,turn);c.fill();
    }else{
      const side=e.id%2?1:-1;
      c.strokeStyle='#d2c987af';c.lineWidth=1.8;c.beginPath();c.moveTo(-7,side*4);
      c.quadraticCurveTo(-20,side*6,-29,side*14);c.stroke();
      c.translate(-13-foot*9,side*(5+foot*4));c.rotate(side*.35);
      c.fillStyle='#839252';c.beginPath();c.moveTo(-11,0);c.quadraticCurveTo(-5,-5,4,-1);
      c.quadraticCurveTo(-1,4,-11,0);c.fill();
      c.strokeStyle='#e2cc89';c.lineWidth=1.3;pathline(c,-10,.1,1,-.7);
    }
    c.restore();
  }
}

export function drawEnemyAttackDetail(c:Canvas,e:Enemy,time:number,settings:Settings,p:Player,shots:readonly EnemyShot[]=[]){
  if(e.stunUntil>time||(e.frostUntil??0)>time||e.hp<=0)return;
  if(e.kind==='bowl'&&((e.shotWarnUntil??0)>time||(e.volleyRemaining??0)>0)){
    const u=(e.shotWarnUntil??0)>time?clamp(1-((e.shotWarnUntil??time)-time)/CONFIG.ranged.warning,0,1):1;
    c.save();c.translate(e.x+e.facing*11,e.y-41);c.scale(e.facing,1);
    const rise=3+u*10;
    c.lineCap='round';c.strokeStyle='#aa5c33';c.lineWidth=5.2;c.beginPath();
    c.moveTo(-10,3);c.bezierCurveTo(-4,3,1,-rise,9,-rise+2);c.quadraticCurveTo(16,-rise+4,18,-rise+1);
    c.stroke();c.strokeStyle='#ffd387';c.lineWidth=2.2;c.stroke();
    c.fillStyle='#ed9a3c';c.beginPath();c.ellipse(21,-rise-3,3.5,2.1,-.47,0,turn);c.fill();c.restore();
  }
  if(e.kind==='eliteKettle'&&(e.shotWarnUntil??0)>time){
    const u=clamp(1-((e.shotWarnUntil??time)-time)/CONFIG.elites.kettle.warning,0,1);
    const spout=toolPosition(e,time,settings,.51,.64);
    c.save();c.translate(spout.x,spout.y);c.scale(e.facing,1);
    c.lineCap='round';c.strokeStyle='#ffdfacca';c.lineWidth=2.4;
    const rise=settings.reduceMotion?6:5+u*9;
    c.beginPath();c.moveTo(0,-3);c.bezierCurveTo(7,-8,-3,-9,5,-8-rise);c.stroke();
    c.fillStyle='#f1b45e';c.beginPath();c.ellipse(2,1,3+u*4,2+u*2,-.3,0,turn);c.fill();c.restore();
  }else if(e.kind==='eliteKettle'){
    // Follow only this pot's freshly released fan. The tea balls themselves stay at their hitboxes.
    const jet=shots.find(q=>q.ownerId===e.id&&q.kind==='tea'&&time-q.bornAt<.26&&
      Math.cos(Math.atan2(q.vy,q.vx)-(e.shotAngle??0))>.99);
    if(jet){
      const spout=toolPosition(e,time,settings,.51,.64);
      c.save();c.globalAlpha*=1-clamp((time-jet.bornAt)/.26,0,1);
      c.lineCap='round';c.strokeStyle='#a76c34';c.lineWidth=7;
      c.beginPath();c.moveTo(spout.x,spout.y);
      c.quadraticCurveTo(spout.x+e.facing*25,spout.y-9,jet.x,jet.y);c.stroke();
      c.lineWidth=2.4;c.strokeStyle='#ffe0a0';c.stroke();c.restore();
    }
  }
  if(e.kind==='eliteCrab'&&e.phase==='warn'){
    const u=clamp(1-(e.phaseUntil-time)/CONFIG.elites.crab.warning,0,1);
    c.save();c.lineCap='round';c.lineWidth=3;
    for(const side of [-1,1]){
      const tip=toolPosition(e,time,settings,side*.42,.86);
      const out=side*e.facing;
      c.strokeStyle='#ffde95';c.beginPath();c.moveTo(tip.x,tip.y);
      c.quadraticCurveTo(tip.x+out*6,tip.y-2-u*3,tip.x+out*10,tip.y-11-u*5);c.stroke();
    }
    c.restore();
  }
  if((e.kind==='bun'||e.kind==='giantBun')&&e.hp<=e.maxHp*.35&&time-e.hurtAt>=.16&&e.jump?.phase!=='flight'){
    const giant=e.kind==='giantBun',offset=giant?122:43;
    const u=settings.reduceMotion?.4:(time*.9+e.id*.13)%1;
    c.save();c.translate(e.x+e.facing*4,e.y-offset-u*9);c.globalAlpha=.54*(1-u);
    c.strokeStyle='#fff3d5';c.lineWidth=2.5;c.lineCap='round';c.beginPath();
    c.moveTo(0,0);c.bezierCurveTo(-5,-4,6,-7,2,-12);c.stroke();c.restore();
  }
  if(e.kind==='bun' && e.alerted && e.lureX===undefined && !e.march){
    const dx=p.x-e.x,dy=p.y-e.y,distance=Math.hypot(dx,dy);
    const opacity=clamp(1-(distance-18)/43,0,1);
    if(!opacity)return;
    const angle=Math.atan2(dy,dx);
    c.save();c.globalAlpha=opacity;c.translate(e.x,e.y-14);c.rotate(angle);
    c.strokeStyle='#fff0cf';c.lineWidth=3.1;c.lineCap='round';
    c.beginPath();c.moveTo(14,-12);c.quadraticCurveTo(31,0,15,12);c.stroke();
    c.restore();
  }else if((e.kind==='box'||e.kind==='eliteCrab') && e.phase==='dash'){
    c.save();c.translate(e.x,e.y-(e.kind==='eliteCrab'?32:19));c.rotate(Math.atan2(e.dashY,e.dashX));
    if(e.kind==='eliteCrab')c.scale(1.65,1.65);
    if(e.kind==='box'){
      const curl=settings.reduceMotion?2:2+3*Math.sin(time*16);
      c.lineCap='round';c.strokeStyle='#895d43';c.lineWidth=5.6;
      c.beginPath();c.moveTo(-10,8);c.bezierCurveTo(-21,8+curl,-28,2-curl,-42,9);c.stroke();
      c.strokeStyle='#f1cd8d';c.lineWidth=3.3;c.stroke();
    }
    for(let i=0;i<2;i++){
      const u=settings.reduceMotion?.3+i*.4:(time*4+i*.5)%1;
      c.save();c.translate(-15-37*u,(i?1:-1)*(6+6*u));c.rotate((u-.5)*.9);
      c.globalAlpha=1-u*.7;
      if(e.kind==='eliteCrab'){
        c.strokeStyle='#ffce80';c.lineWidth=2.8;c.beginPath();c.moveTo(1,0);c.lineTo(-9-i*4,(i?1:-1)*4);c.stroke();
      }else{
        c.fillStyle='#ffe7be';c.fillRect(-6,-3.6,12,7.2);c.fillStyle='#b87554';c.fillRect(-3,-.8,5,1);
      }
      c.restore();
    }
    c.restore();
  }
}

/** A successful enemy contact sheds material from that attack at the actual side of impact. */
export function drawSnackImpact(c:Canvas,kind:Enemy['kind'],x:number,y:number,angle:number,t:number,settings:Settings):void {
  const spread=settings.reduceMotion?.55:1-(1-t)**2;
  c.save();c.translate(x,y-22);c.rotate(angle+Math.PI);c.translate(21,0);c.globalAlpha=1-t*t;
  c.lineCap='round';c.lineJoin='round';
  const count=settings.quality==='simple'?3:5;
  for(let i=0;i<count;i++){
    const a=(i/(count-1)-.5)*2.6,r=8+(16+i%2*7)*spread;
    c.save();c.translate(Math.cos(a)*r,Math.sin(a)*r);c.rotate(a+.14);
    if(kind==='bun'){
      c.fillStyle='#f0d6a9';c.strokeStyle='#b18760';c.lineWidth=1.2;
      c.beginPath();c.ellipse(1,0,5.6,3.3,0,0,turn);c.fill();c.stroke();
      c.fillStyle='#fff0d5';c.beginPath();c.ellipse(2,-1.2,3.1,1.8,0,0,turn);c.fill();
    }else if(kind==='onigiri'){
      c.fillStyle=i===1?'#4b5145':'#fcf2da';c.strokeStyle='#a78d6e';c.lineWidth=1;
      c.beginPath();c.ellipse(1,0,4.7,2.3,-.23,0,turn);c.fill();c.stroke();
    }else if(kind==='siumai'){
      c.fillStyle='#e8a745';c.strokeStyle='#ffe1a0';c.lineWidth=1.2;c.beginPath();
      c.moveTo(-3,2);c.quadraticCurveTo(0,-5,6,-2);c.lineTo(2,3);c.closePath();c.fill();c.stroke();
    }else if(kind==='zongzi'){
      c.fillStyle='#799451';c.strokeStyle='#e7dca0';c.lineWidth=1.5;c.beginPath();
      c.moveTo(-4,1);c.quadraticCurveTo(0,-5,9,-1);c.quadraticCurveTo(3,4,-4,1);c.fill();pathline(c,-3,1,6,-1);
    }else if(kind==='box'){
      c.fillStyle='#ffe1a4';c.fillRect(-3,-3,10,5);
      c.strokeStyle='#ad5941';c.lineWidth=1.4;pathline(c,-1,-1,3,-1);
    }else{
      c.fillStyle='#e99a43';c.strokeStyle='#fff0b8';c.lineWidth=1.3;c.beginPath();
      c.ellipse(1,0,5.6,2.5,-.14,0,turn);c.fill();c.stroke();
    }
    c.restore();
  }
  c.restore();
}

export function drawGiantPulses(c:Canvas,s:GameState,settings:Settings,assets:Assets,outlineOnly=false){
  for(const w of s.giantPulses??[]){
    const age=Math.max(0,s.time-w.bornAt);
    const u=clamp(age/giantPulseLifetime(w),0,1);
    const heavy=w.hop===3,r=heavy?giantPulseRadius(w,s.time):w.reach;
    if(u>=1||r<1)continue;
    if(outlineOnly){
      if(heavy||age<=CONFIG.giant.localDuration){
        c.save();
        const start=heavy?w.gapAngle+CONFIG.giant.gapHalfAngle:0;
        arc(c,w.x,w.y,r,start,heavy?w.gapAngle+turn-CONFIG.giant.gapHalfAngle:turn,'#a86a45',3.8);
        arc(c,w.x,w.y,r,start,heavy?w.gapAngle+turn-CONFIG.giant.gapHalfAngle:turn,'#ffe3b8',2.2);
        c.restore();
      }
      continue;
    }
    if(!heavy&&age>CONFIG.giant.localDuration){
      c.save();clipFloor(c);c.translate(w.x,w.y);c.globalAlpha=(1-u)*.45;
      c.strokeStyle='#eacda6';c.lineWidth=3;c.beginPath();c.ellipse(0,0,31,20,0,0,turn);c.stroke();
      for(let i=0;i<7;i++){
        const angle=i*turn/7;c.beginPath();c.moveTo(5*Math.cos(angle),3*Math.sin(angle));
        c.quadraticCurveTo(16*Math.cos(angle+.3),9*Math.sin(angle+.3),25*Math.cos(angle),14*Math.sin(angle));c.stroke();
      }
      c.restore();continue;
    }
    const a=heavy?w.gapAngle+CONFIG.giant.gapHalfAngle:0;
    const b=heavy?w.gapAngle+turn-CONFIG.giant.gapHalfAngle:turn;
    c.save();c.globalAlpha=heavy?.96:1-age/CONFIG.giant.localDuration;
    const trail=Math.min(r,heavy?47:29);
    const flour=c.createRadialGradient(w.x,w.y,r-trail,w.x,w.y,r+9);
    flour.addColorStop(0,'#dc996700');flour.addColorStop(.67,'#d59c6f51');
    flour.addColorStop(.84,'#ffe4aaae');flour.addColorStop(1,'#ffdb9800');
    c.fillStyle=flour;c.beginPath();c.moveTo(w.x,w.y);c.arc(w.x,w.y,r+9,a,b);c.closePath();c.fill();
    if(!heavy){c.fillStyle='#f7c78946';c.beginPath();c.arc(w.x,w.y,w.reach,a,b);c.fill();}
    arc(c,w.x,w.y,r,a,b,'#ffdeb6ad',3);
    const count=Math.min(settings.quality==='simple'?25:85,Math.max(8,Math.ceil(r*(b-a)/30)));
    const cell=assets.ultimateFx.naturalWidth/2;
    for(let i=0;i<count;i++){
      const angle=a+(b-a)*(i+.5)/count,noise=Math.sin(i*17.8+w.id)*.5+.5;
      const x=w.x+Math.cos(angle)*r,y=w.y+Math.sin(angle)*r;
      if(x<-50||x>WORLD.width+50||y<0||y>WORLD.height+40)continue;
      const size=(heavy?34:23)+noise*19;
      c.save();c.translate(x,y);c.rotate(angle+Math.PI/2);
      if(heavy&&settings.quality==='standard'){
        c.fillStyle='#f4c8937d';c.beginPath();c.moveTo(-6,-4);
        c.quadraticCurveTo(-4,9,4,12+noise*18);c.lineTo(5,2);c.fill();
      }
      c.translate(0,noise*6-1);
      if(i%2)c.scale(-1,1);
      c.drawImage(assets.ultimateFx,cell,0,cell,cell,-size/2,-size*.49,size,size*.89);
      if(settings.quality==='standard'){
        c.fillStyle='#ffe7be';c.beginPath();c.arc(size*.24,-8-noise*5,1.1+noise,0,turn);c.fill();
      }
      c.restore();
    }
    c.restore();
  }
}

export function drawSoupShot(c:Canvas,q:EnemyShot){
  const tea=q.kind==='tea';
  c.save();c.translate(q.x,q.y);
  // The painted drop has a seven-unit belly; grow the visible threat with its collision radius.
  if(tea)c.scale(q.radius/7,q.radius/7);
  c.fillStyle='#3726293e';c.beginPath();c.ellipse(0,3,8,3.6,0,0,turn);c.fill();
  c.rotate(Math.atan2(q.vy,q.vx));c.fillStyle=tea?'#b77b3d':'#f29e38';c.strokeStyle=tea?'#78482f':'#773e2d';c.lineWidth=2;
  c.beginPath();c.moveTo(-19,0);c.bezierCurveTo(-6,-3,-1,-10,6,-7);
  c.bezierCurveTo(16,-2,10,10,2,7);c.bezierCurveTo(-5,6,-8,2,-19,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=tea?'#fff1ba':'#fff5bf';c.beginPath();c.ellipse(3,-3,4,1.9,-.24,0,turn);c.fill();
  if(tea){
    c.fillStyle='#718748';c.beginPath();c.moveTo(-5,-1);c.quadraticCurveTo(-1,-6,4,-2);c.quadraticCurveTo(2,2,-5,-1);c.fill();
  }else{
    c.lineCap='round';c.strokeStyle='#8d5339';c.lineWidth=3.8;c.beginPath();
    c.moveTo(-25,2);c.bezierCurveTo(-19,-5,-13,7,-8,2);c.quadraticCurveTo(-4,-2,0,1);c.stroke();
    c.strokeStyle='#ffd78a';c.lineWidth=2;c.stroke();
    c.fillStyle='#68904c';c.strokeStyle='#e3d28a';c.lineWidth=.8;c.beginPath();
    c.ellipse(2,3,3,1.5,-.42,0,turn);c.fill();c.stroke();
    c.fillStyle='#f4c381';c.beginPath();c.ellipse(-28,4,2.3,1.4,-.36,0,turn);c.fill();
  }
  c.restore();
}

export function drawBellStun(c:Canvas,x:number,headY:number,phase:number,settings:Settings):void {
  c.save();c.translate(x,headY-11);c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.ellipse(0,0,18,4.3,0,.16,Math.PI*1.85);
  c.strokeStyle='#715235c9';c.lineWidth=3.1;c.stroke();
  c.strokeStyle='#ffe3a2';c.lineWidth=1.25;c.stroke();
  const orbit=settings.reduceMotion?.38:phase;
  const count=settings.quality==='simple'?2:3;
  for(let i=0;i<count;i++){
    const angle=orbit+i*turn/count;
    c.save();c.translate(Math.cos(angle)*18,Math.sin(angle)*4.3);
    c.lineWidth=1.4;c.strokeStyle='#714027';c.fillStyle='#ffbd55';
    if(i===0){
      c.rotate(settings.reduceMotion?-.12:Math.cos(angle)*.24);
      c.beginPath();c.arc(0,3.5,1.8,0,turn);c.fill();c.stroke();
      c.beginPath();c.moveTo(-4.8,2.2);c.quadraticCurveTo(-3.2,.1,-3.3,-2);
      c.bezierCurveTo(-3.3,-6.4,3.3,-6.4,3.3,-2);c.quadraticCurveTo(3.3,.4,4.8,2.2);
      c.closePath();c.fill();c.stroke();
      c.strokeStyle='#fff1b6';pathline(c,-1.9,-2.2,-1.4,-3.3);
    }else{
      c.fillStyle='#fff0a8';c.beginPath();c.moveTo(0,-4.5);c.lineTo(1.4,-1.3);c.lineTo(4.7,0);
      c.lineTo(1.4,1.3);c.lineTo(0,4.5);c.lineTo(-1.4,1.3);c.lineTo(-4.7,0);c.lineTo(-1.4,-1.3);
      c.closePath();c.fill();c.stroke();
    }
    c.restore();
  }
  c.restore();
}

export function drawIceShell(c:Canvas,x:number,feet:number,height:number,frostRemaining:number,breakable:boolean){
  c.save();c.translate(x,feet);c.scale(height,height);
  c.fillStyle='#7de5ff40';c.strokeStyle='#c8f9ff';c.lineWidth=.026;
  c.beginPath();c.moveTo(-.37,-.02);c.lineTo(-.51,-.36);c.lineTo(-.34,-.84);
  c.lineTo(.04,-1.05);c.lineTo(.39,-.79);c.lineTo(.5,-.32);c.lineTo(.27,.01);c.closePath();c.fill();c.stroke();
  c.fillStyle='#d3faff77';c.beginPath();c.moveTo(-.51,-.36);c.lineTo(-.28,-.55);c.lineTo(-.34,-.84);c.closePath();c.fill();
  c.strokeStyle='#b0effb';c.lineWidth=.015;pathline(c,.39,-.79,.25,-.53);pathline(c,.25,-.53,.5,-.32);
  if(frostRemaining>0){
    // Frost collects on the rim, leaving the monster's face visible through the center.
    c.fillStyle='#bbf4ff99';c.beginPath();c.moveTo(-.34,-.84);c.lineTo(.04,-1.05);
    c.lineTo(.39,-.79);c.lineTo(.11,-.87);c.lineTo(-.13,-.85);c.closePath();c.fill();
    c.fillStyle='#409bbd85';c.beginPath();c.moveTo(.5,-.32);c.lineTo(.27,.01);
    c.lineTo(-.37,-.02);c.lineTo(-.22,-.09);c.lineTo(.21,-.09);c.closePath();c.fill();
    c.lineCap='round';c.strokeStyle='#f2feff';c.lineWidth=.031;
    pathline(c,-.35,-.72,-.41,-.55);
    if(frostRemaining<.68){
      c.save();c.globalAlpha*=1-frostRemaining/.68;
      c.lineJoin='round';c.beginPath();
      c.moveTo(.39,-.79);c.lineTo(.23,-.69);c.lineTo(.29,-.60);c.lineTo(.13,-.49);
      c.moveTo(.29,-.60);c.lineTo(.39,-.48);c.lineTo(.34,-.40);
      c.moveTo(-.37,-.02);c.lineTo(-.27,-.16);c.lineTo(-.30,-.22);c.lineTo(-.15,-.33);
      c.strokeStyle='#3b91b6';c.lineWidth=.055;c.stroke();
      c.strokeStyle='#f6ffff';c.lineWidth=.027;c.stroke();c.restore();
    }
  }
  if(breakable){
    c.lineJoin='round';c.lineCap='round';
    c.beginPath();c.moveTo(.12,-1.00);c.lineTo(-.09,-.72);c.lineTo(.035,-.65);
    c.lineTo(-.18,-.43);c.lineTo(-.05,-.38);c.lineTo(-.23,-.12);
    c.moveTo(.035,-.65);c.lineTo(.18,-.58);c.lineTo(.27,-.63);
    c.strokeStyle='#52869b';c.lineWidth=.073;c.stroke();
    c.strokeStyle='#fffef0';c.lineWidth=.044;c.stroke();
  }
  c.restore();
}
