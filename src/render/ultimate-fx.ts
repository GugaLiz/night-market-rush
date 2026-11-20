import {WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import {EXPRESS,expressSealRadius,WAVES,waveRadius} from '../core/ultimates';
import type {ExpressCast,GameState,Settings,Vec,WaveCast} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';

const tau=Math.PI*2;
const unit=(x:number)=>clamp(x,0,1);
const thin=(s:Settings)=>s.reduceMotion||s.quality==='simple';
const colors={
  icebox:['#71deff','#e6fdff','#347eae'],
  steamer:['#ffd197','#fff4d3','#ad734b'],
  berry:['#fa538e','#ffe6d9','#971858'],
} as const;

function imprint(c:CanvasRenderingContext2D,assets:Assets,index:number,x:number,y:number,width:number,height:number,angle=0):void {
  const atlas=assets.ultimateFx,cell=atlas.naturalWidth/2;
  c.save();c.translate(x,y);c.rotate(angle);
  c.drawImage(atlas,index%2*cell,Math.floor(index/2)*cell,cell,cell,-width/2,-height/2,width,height);
  c.restore();
}

function ripple(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,width:number,from=0,to=tau):void {
  c.lineWidth=width;c.strokeStyle=color;c.beginPath();c.arc(x,y,r,from,to);c.stroke();
}

function paperTrail(c:CanvasRenderingContext2D,cast:ExpressCast,s:GameState,assets:Assets,settings:Settings):void {
  const completed=cast.landings.length-1;
  if(completed<0)return;
  const release=cast.bornAt+EXPRESS.windup,latest=completed+(cast.onLeg?1:0);
  c.save();c.lineCap='round';
  for(let leg=Math.max(1,latest-1);leg<=latest;leg++){
    const from=cast.landings[leg-1],end=cast.landings[leg]??cast;
    const dx=end.x-from.x,dy=end.y-from.y,distance=Math.hypot(dx,dy);
    const fade=unit(1-Math.max(0,s.time-release-leg*EXPRESS.leg)/EXPRESS.fade);
    if(distance<2||fade===0)continue;
    // Only fresh tape follows the parcel. Earlier crossings clear before the next pass.
    const length=Math.min(distance,thin(settings)?210:315),ux=dx/distance,uy=dy/distance;
    const start={x:end.x-ux*length,y:end.y-uy*length};
    const grad=c.createLinearGradient(start.x,start.y,end.x,end.y);
    grad.addColorStop(0,'#21ab9800');grad.addColorStop(.58,'#54dcbb92');grad.addColorStop(1,'#c4ffdf');
    if(cast.onLeg&&leg===latest){
      // The parcel ploughs a capsule. Roll the air around its nose at the actual hit radius.
      const heading=Math.atan2(dy,dx),r=EXPRESS.radius;
      c.save();c.translate(end.x,end.y);c.rotate(heading);
      const pressure=c.createLinearGradient(-length,0,r,0);
      pressure.addColorStop(0,'#3aac9300');pressure.addColorStop(.64,'#5fe0be13');
      pressure.addColorStop(.93,'#9cf9d844');pressure.addColorStop(1,'#eaffd974');
      c.fillStyle=pressure;c.beginPath();c.moveTo(-length,0);
      c.quadraticCurveTo(-length*.36,-r*.8,0,-r);c.arc(0,0,r,-Math.PI/2,Math.PI/2);
      c.quadraticCurveTo(-length*.36,r*.8,-length,0);c.closePath();c.fill();
      ripple(c,0,0,r,'#246f72',6,-1.38,1.38);
      ripple(c,0,0,r,'#e0ffe4',2.6,-1.38,1.38);
      c.strokeStyle='#9eead4';c.lineWidth=2;c.beginPath();
      for(const side of [-1,1]){
        c.moveTo(-length*.47,side*r*.64);
        c.quadraticCurveTo(-length*.24,side*r*.91,-7,side*r*.95);
      }
      c.stroke();
      c.restore();
    }
    c.globalAlpha=fade*.78;c.strokeStyle=grad;c.lineWidth=26;
    c.beginPath();c.moveTo(start.x,start.y);c.lineTo(end.x,end.y);c.stroke();
    c.lineWidth=4;c.strokeStyle='#c9ffe4';c.beginPath();
    c.moveTo(end.x-ux*length*.27,end.y-uy*length*.27);c.lineTo(end.x,end.y);c.stroke();
    if(!thin(settings)&&length>90){
      c.globalAlpha=fade*.72;
      for(let d=75;d<length;d+=115)imprint(c,assets,2,end.x-ux*d,end.y-uy*d-8,24,22,ux*.22);
    }
  }
  // Travelling over the seal leaves its targets for the signed delivery.
  if(cast.onLeg&&latest%EXPRESS.legsPerOrder===0){
    const approach=unit(((s.time-cast.legStart)/EXPRESS.leg-.45)/.55);
    if(approach>0){
      const final=latest===EXPRESS.legs;
      c.globalAlpha=.5*approach;c.setLineDash([10,9]);
      ripple(c,cast.target.x,cast.target.y,expressSealRadius(latest),final?'#ffd48d':'#a6f3d0',3);
      c.setLineDash([]);
    }
  }
  for(let i=Math.max(0,completed-1);i<=completed;i++){
    const age=Math.max(0,s.time-release-i*EXPRESS.leg),final=i===EXPRESS.legs;
    const fade=unit(1-age/(final?EXPRESS.fade:.55));
    if(fade===0)continue;
    const mark=cast.landings[i],order=i>0&&i%EXPRESS.legsPerOrder===0;
    const r=order?expressSealRadius(i):33,size=final?132:order?100:54;
    c.globalAlpha=fade*.87;
    ripple(c,mark.x,mark.y,r,final?'#ffd48d':order?'#d7ffbf':'#8af4ca',final?5:3);
    if(order){
      const ink=unit(age/.16);
      c.globalAlpha=fade*(.74-.34*ink);
      ripple(c,mark.x,mark.y,r-6,final?'#ba6140':'#329c87',10);
      c.setLineDash([5,9]);
      ripple(c,mark.x,mark.y,r-15,'#fff5c2',3);
      c.setLineDash([]);
    }
    imprint(c,assets,2,mark.x,mark.y,size,size*.76,i%2?.24:-.18);
  }
  c.restore();
}

function waveFront(c:CanvasRenderingContext2D,cast:WaveCast,s:GameState,assets:Assets,settings:Settings):void {
  const tune=WAVES[cast.kind],age=s.time-cast.bornAt-tune.windup;
  if(age<0){
    const grip=unit(1+age/tune.windup);
    c.save();c.globalAlpha=.38+.35*grip;
    if(cast.kind==='icebox'){
      const t=cast.angle,r=40+grip*40;
      ripple(c,cast.x,cast.y,r,'#a6f2ff',2,t-Math.PI*.45,t+Math.PI*.45);
      for(const offset of [-.87,0,.87]){
        const dx=Math.cos(t+offset),dy=Math.sin(t+offset);
        c.strokeStyle='#d5faff';c.lineWidth=3;c.beginPath();c.moveTo(cast.x+dx*(r-9),cast.y+dy*(r-9));c.lineTo(cast.x+dx*r,cast.y+dy*r);c.stroke();
      }
    }else if(cast.kind==='berry'){
      const r=16+(1-grip)*53;
      for(let i=0;i<8;i++){
        const a=i*tau/8,x=cast.x+Math.cos(a)*r,y=cast.y+Math.sin(a)*r*.6-15;
        c.fillStyle='#ec7191';c.beginPath();c.arc(x,y,2+i%3,0,tau);c.fill();
        c.fillStyle='#fff0d4';c.fillRect(x-1,y-1,1.4,1.4);
      }
    }else ripple(c,cast.x,cast.y,28+12*grip,'#ffc987',2);
    c.restore();
    return;
  }
  const r=waveRadius(cast,s.time),fade=unit((tune.travel+tune.fade-age)/tune.fade);
  if(r<1||fade<=0)return;
  const [edge,light,shadow]=colors[cast.kind],ice=cast.kind==='icebox',berry=cast.kind==='berry';
  const start=ice?cast.angle-Math.PI/2:0,span=ice?Math.PI:tau;
  const width=Math.min(r,berry?135:ice?110:85),inner=Math.max(0,r-width);
  c.save();c.globalAlpha=fade;
  const band=c.createRadialGradient(cast.x,cast.y,inner,cast.x,cast.y,r);
  band.addColorStop(0,edge+'00');band.addColorStop(.6,edge+'16');
  band.addColorStop(.86,edge+(berry?'82':'55'));band.addColorStop(.98,light+'a0');band.addColorStop(1,edge+'18');
  c.fillStyle=band;c.beginPath();c.arc(cast.x,cast.y,r,start,start+span);
  c.arc(cast.x,cast.y,inner,start+span,start,true);c.closePath();c.fill();
  // The continuous leading lip reaches a victim on the same simulation step as its hit.
  ripple(c,cast.x,cast.y,r,shadow+'a0',ice?5:berry?9:7,start,start+span);
  ripple(c,cast.x,cast.y,r,light,ice?2.2:3,start,start+span);
  if(ice){
    // The interlocked shards erupt from the case and follow the locked firing angle.
    c.save();c.translate(cast.x,cast.y);c.rotate(cast.angle);
    c.beginPath();c.moveTo(0,0);c.arc(0,0,r,-Math.PI/2,Math.PI/2);c.closePath();c.clip();
    if(!thin(settings))for(const side of [-1,1]){
      c.save();c.rotate(side*.77);c.globalAlpha=fade*.68;
      imprint(c,assets,4,r*.40,0,r*.80,r*.83);c.restore();
    }
    c.globalAlpha=fade*.90;
    imprint(c,assets,4,r*.48,0,r*.94,r*.91);c.restore();
  }else if(!berry){
    // The hollow center grows together with the moving front and reveals the cleared floor.
    if(!thin(settings)){
      c.globalAlpha=fade*.30;
      imprint(c,assets,5,cast.x,cast.y,r*2.14,r*2.13,.06);
    }
    c.globalAlpha=fade*.84;
    imprint(c,assets,5,cast.x,cast.y-7,r*2.03,r*2.00,-.03);
  }
  // Fixed bearings let the same shard, steam curl or bubble travel visibly across the street.
  const spacing=(ice?110:berry?130:146)*(thin(settings)?1.75:1);
  const count=Math.max(5,Math.min(36,Math.ceil(span*cast.reach/spacing)));
  const gap=span*r/count;
  for(let i=0;i<count;i++){
    if((gap<30&&i%4!==0)||(gap<55&&i%2!==0))continue;
    const angle=start+span*(i+.5)/count,dx=Math.cos(angle),dy=Math.sin(angle);
    const bend=(1+Math.sin(angle*7+cast.bornAt))*(berry?8:ice?5:4);
    const at=r-bend,x=cast.x+at*dx,y=cast.y+at*dy;
    if(x<-96||y<-96||x>WORLD.width+96||y>WORLD.height+96)continue;
    const pulse=(1+Math.sin(angle*9+cast.bornAt))*.5,size=(ice?36:berry?46:42)+pulse*(ice?42:22);
    c.globalAlpha=fade*(.68+pulse*.26);
    const stamp=ice?0:berry?3:1;
    const tilt=ice?angle+.32:berry?angle+.58:dy*.36+Math.sin(i*3)*.14;
    if(!berry){
      c.globalAlpha=fade*(ice?.73:.40);
      if(!ice&&dx<0){
        c.save();c.translate(x,y-size*.18);c.scale(-1,1);
        imprint(c,assets,stamp,0,0,size*1.21,size*(.85+pulse*.21),-tilt);c.restore();
      }else imprint(c,assets,stamp,x,y-size*.18,size*(ice?1:1.21),size*(.85+pulse*.21),tilt);
    }
    if(ice&&r>65&&!thin(settings)){
      c.strokeStyle=light+'a8';c.lineWidth=2.1;c.beginPath();c.moveTo(x-13*dx,y-13*dy);c.lineTo(x-64*dx,y-64*dy);c.stroke();
    }
    if(berry){
      const size=4+pulse*3;
      c.fillStyle=edge;c.beginPath();c.arc(x,y,size,0,tau);c.fill();
      c.strokeStyle=shadow;c.lineWidth=1.7;c.stroke();
      c.fillStyle=light;c.beginPath();c.arc(x-size*.3,y-size*.4,1.8,0,tau);c.fill();
      if(!thin(settings))imprint(c,assets,7,x-dx*16,y-dy*16,17+pulse*14,16+pulse*10,angle);
    }
  }
  c.restore();
}

export function drawUltimateGround(c:CanvasRenderingContext2D,s:GameState,settings:Settings,assets:Assets):void {
  if(!s.ultimates?.length)return;
  for(const cast of s.ultimates){
    if(cast.kind==='express')paperTrail(c,cast,s,assets,settings);
    else{
      waveFront(c,cast,s,assets,settings);
      if(cast.kind==='berry')berryJets(c,cast,s.time,assets,settings);
    }
  }
}

function berryJets(c:CanvasRenderingContext2D,cast:WaveCast,time:number,assets:Assets,settings:Settings):void {
  const age=time-cast.bornAt-WAVES.berry.windup;
  if(age<0)return;
  const t=unit(age/.32),alpha=unit((.53-age)/.25);
  if(!alpha)return;
  c.save();c.translate(cast.x,cast.y-12);c.lineCap='round';c.globalAlpha=alpha;
  const count=thin(settings)?5:9;
  for(let i=0;i<count;i++){
    const a=(i+.31*Math.sin(i*6.1+.9))*tau/count+cast.angle*.12;
    const weight=(1+Math.sin(i*8.2+.4))*.5,length=(190+240*weight)*(1-(1-t)**1.6);
    const x=Math.cos(a)*length,y=Math.sin(a)*length*.88;
    const cream=i%4===2;
    imprint(c,assets,3,x*.72,y*.72,length*.70,length*(.24+.12*weight),a+.30);
    if(i%3===1)imprint(c,assets,7,x,y-14,35+weight*24,32+weight*21,a*.44);
    if(!thin(settings))for(let bead=1;bead<=2;bead++){
      const d=bead*(19+12*weight)*t,bx=x+Math.cos(a+.12)*d,by=y+Math.sin(a+.12)*d;
      const br=(3+weight*4)*(bead===1?1:.65);
      c.fillStyle=cream?'#ffdac3':'#bf2961';c.beginPath();c.arc(bx,by,br,0,tau);c.fill();
      c.fillStyle='#ffe8d8';c.beginPath();c.arc(bx-br*.28,by-br*.40,br*.28,0,tau);c.fill();
    }
  }
  const width=(470-50*t)*(1-(1-t)**1.85),height=width*.73;
  imprint(c,assets,6,0,-height*.30,width,height);
  c.restore();
}

export function drawBerryScreenEdges(
  c: CanvasRenderingContext2D, state: GameState, left: number, top: number, width: number, height: number,
): void {
  const cast = state.ultimates?.find(cast => cast.kind === 'berry');
  if (!cast) return;
  const age=state.time-cast.bornAt-WAVES.berry.windup;
  if(age<.04||age>.43)return;
  const t=unit((age-.04)/.19),alpha=unit((.43-age)/.18)*t;
  c.save();c.globalAlpha=alpha;
  for(let i=0;i<4;i++){
    const x=left+(i%2===0?-6:width+6),y=top+(i<2?16:height-8);
    const r=(31+i*4)*(1+t);
    const grad=c.createRadialGradient(x-r*.22,y-r*.27,r*.1,x,y,r);
    grad.addColorStop(0,'#c5477a1c');grad.addColorStop(.72,'#b320637d');
    grad.addColorStop(.91,'#ffb7c5e6');grad.addColorStop(1,'#9e205ab0');
    c.fillStyle=grad;c.beginPath();c.arc(x,y,r,0,tau);c.fill();
    ripple(c,x,y,r*.89,'#ffdedb',2.8,Math.PI*1.12,Math.PI*1.68);
  }
  c.restore();
}

function castTool(c:CanvasRenderingContext2D,s:GameState,cast:WaveCast,assets:Assets,settings:Settings):void {
  const tune=WAVES[cast.kind],age=s.time-cast.bornAt,after=age-tune.windup;
  if(age<0 || after>.49)return;
  const quiet=settings.reduceMotion,load=unit(age/tune.windup),fade=unit((.49-after)/.19)*unit((age-.09)/.06);
  const heading=cast.kind==='icebox'?cast.angle:Math.atan2(s.player.moveDirection.y,s.player.moveDirection.x);
  const ground:Vec=cast.kind==='icebox'?{x:cast.x+Math.cos(heading)*26,y:cast.y+Math.sin(heading)*16}:cast;
  c.save();
  const baseY=ground.y-17;
  c.globalAlpha=fade;
  const anticipation=quiet?0:Math.sin(load*Math.PI)*.14;
  const release=unit(after/.40),jump=quiet?0:Math.sin(release*Math.PI);
  const size=cast.kind==='steamer'?73:57;
  drawSprite(c,assets,cast.kind,ground.x,baseY,size*(1+anticipation),anticipation,1,.58);
  if(after>0&&cast.kind!=='icebox'){
    const lidX=ground.x+22+release*28,lidY=baseY-28-jump*65;
    c.translate(lidX,lidY);c.rotate(release*(quiet?.2:3.8));
    const bamboo=cast.kind==='steamer',r=bamboo?22:11;
    c.fillStyle=bamboo?'#ad793e':'#b67b32';c.strokeStyle='#563b2d';c.lineWidth=2;
    c.beginPath();c.ellipse(0,0,r,r*.58,0,0,tau);c.fill();c.stroke();
    c.strokeStyle=bamboo?'#efd09a':'#ffdd8e';c.lineWidth=bamboo?2.7:1.7;
    for(let i=-2;i<=2;i++){
      const x=i*r/3.4,h=Math.sqrt(r*r-x*x)*.43;
      c.beginPath();c.moveTo(x,-h);c.lineTo(x+2,h);c.stroke();
    }
  }
  c.restore();
}

export function drawUltimateAir(c:CanvasRenderingContext2D,s:GameState,settings:Settings,assets:Assets):void {
  for(const cast of s.ultimates??[]){
    if(cast.kind!=='express'){castTool(c,s,cast,assets,settings);continue;}
    if(!cast.landings.length||cast.landings.length>EXPRESS.legs)continue;
    const progress=unit((s.time-cast.legStart)/EXPRESS.leg);
    const arc=Math.sin(progress*Math.PI);
    const start=cast.landings[cast.landings.length-(cast.onLeg?1:2)];
    const side=cast.target.x>=start.x?1:-1;
    const lift=arc*(settings.reduceMotion?11:45);
    c.save();
    c.fillStyle='#4f42385c';c.beginPath();c.ellipse(cast.x,cast.y,22-5*arc,6-arc,0,0,tau);c.fill();
    const top=cast.y-lift-4;
    drawSprite(c,assets,'rigBagSide',cast.x,top,48,side*.14*arc,side);
    drawSprite(c,assets,'express',cast.x-side*19,top-24,26,-side*(.2+arc*.16),side,.60);
    c.restore();
  }
}
