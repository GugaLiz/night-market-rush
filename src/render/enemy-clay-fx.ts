import {CONFIG,WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import {giantJumpHeight,giantPulseLifetime,giantPulseRadius} from '../core/giant-bun';
import {siumaiHop} from '../core/enemies';
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

export function drawEnemyAttackGround(c:Canvas,e:Enemy,time:number,settings:Settings):void{
  if(e.kind==='giantBun' && e.jump && e.jump.phase!=='rest'){
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
      for(const a of [start,end])pathline(c,Math.cos(a)*radius,Math.sin(a)*radius,Math.cos(a)*380,Math.sin(a)*380);
      c.setLineDash([]);c.rotate(j.gapAngle);
      for(const offset of [78,100]){c.strokeStyle='#fff0cc';c.lineWidth=3;chevron(c,offset,7);}
      c.rotate(-j.gapAngle);
    }
    if(j.phase==='flight'){
      c.setLineDash([]);c.fillStyle='rgba(60,31,23,'+(.08+.28*progress)+')';
      c.beginPath();c.ellipse(0,0,15+18*progress,6+5*progress,0,0,turn);c.fill();
    }
    c.restore();
  }else if(e.kind==='box' && (e.phase==='warn'||e.phase==='dash')){
    const seconds=e.phase==='dash'?clamp(e.phaseUntil-time,0,CONFIG.dash.duration):CONFIG.dash.duration;
    const length=CONFIG.dash.speed*seconds*(e.slowUntil>time?CONFIG.skills.soda.factor:1);
    if(length<2)return;
    c.save();clipFloor(c);c.translate(e.x,e.y);c.rotate(Math.atan2(e.dashY,e.dashX));
    c.fillStyle=e.phase==='dash'?'#ff925662':'#ed6d5055';c.fillRect(0,-e.radius,length,e.radius*2);
    c.strokeStyle='#ffa476';c.lineWidth=1.6;
    pathline(c,0,-e.radius,length,-e.radius);pathline(c,0,e.radius,length,e.radius);
    c.strokeStyle='#ffdb92';c.lineWidth=3;c.lineJoin='round';
    for(const offset of [0,12])if(length>offset+10)chevron(c,length-offset,6);
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
  }else if(e.kind==='box' && (e.phase==='warn'||e.phase==='dash')){
    const u=e.phase==='warn'?1-clamp((e.phaseUntil-time)/CONFIG.dash.warning,0,1):1;
    pose.tilt=e.facing*.14*u*amount;pose.scaleY-=.1*u*amount;pose.scaleX+=.08*u*amount;
  }else if(e.kind==='bowl' && (e.shotWarnUntil??0)>time){
    const u=clamp(1-((e.shotWarnUntil??time)-time)/CONFIG.ranged.warning,0,1);
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
      pose.lift=hop*6.5;
      pose.scaleX+=.08-hop*.11;pose.scaleY+=hop*.13-.085;
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

export function drawEnemyAttackDetail(c:Canvas,e:Enemy,time:number,settings:Settings,p:Player){
  if(e.stunUntil>time||(e.frostUntil??0)>time||e.hp<=0)return;
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
    const step=settings.reduceMotion?0:(time*3+e.id*.43)%1;
    c.fillStyle='#edcfa5';c.globalAlpha=opacity*.72;
    for(let i=0;i<3;i++){
      const u=(step+i/3)%1;
      c.beginPath();c.ellipse(-11-17*u,12-5*u,4-2*u,2.6-u,0,0,turn);c.fill();
    }
    c.restore();
  }else if(e.kind==='box' && e.phase==='dash'){
    c.save();c.translate(e.x,e.y-19);c.rotate(Math.atan2(e.dashY,e.dashX));
    for(let i=0;i<2;i++){
      const u=settings.reduceMotion?.3+i*.4:(time*4+i*.5)%1;
      c.save();c.translate(-15-37*u,(i?1:-1)*(6+6*u));c.rotate((u-.5)*.9);
      c.globalAlpha=1-u*.7;c.fillStyle='#ffe7be';c.fillRect(-6,-3.6,12,7.2);
      c.fillStyle='#b87554';c.fillRect(-3,-.8,5,1);c.restore();
    }
    c.restore();
  }
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
  c.save();c.translate(q.x,q.y);
  c.fillStyle='#3726293e';c.beginPath();c.ellipse(0,3,8,3.6,0,0,turn);c.fill();
  c.rotate(Math.atan2(q.vy,q.vx));c.fillStyle='#f29e38';c.strokeStyle='#773e2d';c.lineWidth=2;
  c.beginPath();c.moveTo(-19,0);c.bezierCurveTo(-6,-3,-1,-10,6,-7);
  c.bezierCurveTo(16,-2,10,10,2,7);c.bezierCurveTo(-5,6,-8,2,-19,0);c.closePath();c.fill();c.stroke();
  c.fillStyle='#fff5bf';c.beginPath();c.ellipse(3,-3,4,1.9,-.24,0,turn);c.fill();c.restore();
}

export function drawIceShell(c:Canvas,x:number,feet:number,height:number,breakable=false){
  c.save();c.translate(x,feet);c.scale(height,height);
  c.fillStyle='#7de5ff40';c.strokeStyle='#c8f9ff';c.lineWidth=.026;
  c.beginPath();c.moveTo(-.37,-.02);c.lineTo(-.51,-.36);c.lineTo(-.34,-.84);
  c.lineTo(.04,-1.05);c.lineTo(.39,-.79);c.lineTo(.5,-.32);c.lineTo(.27,.01);c.closePath();c.fill();c.stroke();
  c.fillStyle='#d3faff77';c.beginPath();c.moveTo(-.51,-.36);c.lineTo(-.28,-.55);c.lineTo(-.34,-.84);c.closePath();c.fill();
  c.strokeStyle='#b0effb';c.lineWidth=.015;pathline(c,.39,-.79,.25,-.53);pathline(c,.25,-.53,.5,-.32);
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
