import {meleeWaveBand} from '../core/melee';
import {UMBRELLA_GUARD} from '../core/weapons';
import type {GameState, MeleeWave, Settings} from '../shared/types';

const radians=Math.PI/180;
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

interface EdgePoint {
  x:number; y:number; dx:number; dy:number;
  inner:number; outer:number; arc:number; taper:number;
}

// Neighboring leaves meet at a shared edge. Sample each center exactly, then
// smooth across the joins. The origin of each leaf stays at its release position.
function waveEdges(wave:MeleeWave,time:number):EdgePoint[] {
  const slices=wave.slices;
  const bands=slices.map(slice=>meleeWaveBand(wave,slice,time));
  const points:EdgePoint[]=[];
  for(let i=0;i<slices.length;i++){
    const slice=slices[i],band=bands[i],width=2*slice.halfAngle;
    if(!band)continue;
    const steps=2*Math.max(1,Math.ceil(slice.halfAngle/(4*radians)));
    for(let j=points.length?1:0;j<=steps;j++){
      const t=j/steps,neighbor=i+(t<.5?-1:1);
      const other=bands[neighbor],origin=other?slices[neighbor]:slice;
      const weight=other?Math.abs(t-.5)*2*slice.halfAngle/(slice.halfAngle+origin.halfAngle):0;
      const angle=slice.angle+wave.swingSide*(t-.5)*width;
      // Use a world-angle phase so trimming expired leaves cannot move the
      // printed marks or umbrella pleats along the surviving part of the wave.
      const arc=Math.PI*2+wave.swingSide*angle;
      points.push({x:mix(slice.x,origin.x,weight),y:mix(slice.y,origin.y,weight)-28,
        dx:Math.cos(angle),dy:Math.sin(angle),inner:mix(band.inner,other?.inner??band.inner,weight),
        outer:mix(band.outer,other?.outer??band.outer,weight),arc,taper:1});
    }
  }
  if(points.length){
    const start=points[0].arc,end=points[points.length-1].arc;
    for(const p of points)p.taper=.18+.82*Math.min(1,(p.arc-start)/.19,(end-p.arc)/.16);
  }
  return points;
}

type Profile=number|((p:EdgePoint)=>number);
function ribbon(c:CanvasRenderingContext2D,points:EdgePoint[],front:Profile,back:Profile,fill:string):void {
  c.beginPath();
  for(let i=0;i<points.length;i++){
    const p=points[i],depth=typeof front==='number'?front:front(p),r=mix(p.inner,p.outer,depth);
    if(i===0)c.moveTo(p.x+p.dx*r,p.y+p.dy*r);else c.lineTo(p.x+p.dx*r,p.y+p.dy*r);
  }
  for(let i=points.length-1;i>=0;i--){
    const p=points[i],a=typeof front==='number'?front:front(p),b=typeof back==='number'?back:back(p);
    const r=mix(p.inner,p.outer,mix(a,b,p.taper));
    c.lineTo(p.x+p.dx*r,p.y+p.dy*r);
  }
  c.closePath();c.fillStyle=fill;c.fill();
}

function spacedMarks(points:EdgePoint[],spacing:number,draw:(p:EdgePoint,index:number)=>void):void {
  let previous=-1;
  for(const p of points){
    const index=Math.floor(p.arc/spacing);
    if(index===previous)continue;
    previous=index;
    if(p.taper>.64&&p.outer-p.inner>8)draw(p,index);
  }
}

function receipts(c:CanvasRenderingContext2D,points:EdgePoint[]):void {
  // Tiny curled chits, spaced on the trailing sheet of warm air.
  spacedMarks(points,.83,(p,index)=>{
    const r=mix(p.inner,p.outer,.31);
    c.save();c.translate(p.x+p.dx*r,p.y+p.dy*r);
    c.rotate(Math.atan2(p.dy,p.dx)+1.18+(index%2)*.49);
    c.fillStyle='#fff2d3';c.strokeStyle='#936751';c.lineWidth=.9;
    c.beginPath();c.moveTo(-7,-3);c.quadraticCurveTo(-2,-5,6,-2);
    c.lineTo(7,2);c.lineTo(4,1.5);c.lineTo(2,3);c.quadraticCurveTo(-3,.5,-6,2);c.closePath();c.fill();c.stroke();
    c.beginPath();c.moveTo(-4,-1.7);c.lineTo(1,-1.2);c.stroke();c.restore();
  });
}

function cutSeals(c:CanvasRenderingContext2D,points:EdgePoint[]):void {
  spacedMarks(points,.96,(p,index)=>{
    const r=mix(p.inner,p.outer,.19);
    c.save();c.translate(p.x+p.dx*r,p.y+p.dy*r);c.rotate(Math.atan2(p.dy,p.dx)+Math.PI/2);
    c.scale(index%2?1:-1,1);
    c.beginPath();c.moveTo(11,-3);c.quadraticCurveTo(0,4,-16,13);
    c.lineTo(-8,6);c.lineTo(-13,7);c.quadraticCurveTo(-5,-1,11,-3);
    c.fillStyle='#d1eef0';c.strokeStyle='#506780';c.lineWidth=1;c.fill();c.stroke();
    c.strokeStyle='#688dad';c.lineWidth=1.8;c.beginPath();c.moveTo(-6,3);c.lineTo(-1,1);c.stroke();c.restore();
  });
}

function canopyFolds(c:CanvasRenderingContext2D,points:EdgePoint[]):void {
  spacedMarks(points,43*radians,p=>{
    const r=mix(p.inner,p.outer,.55),w=p.outer-p.inner;
    c.save();c.translate(p.x+p.dx*r,p.y+p.dy*r);c.rotate(Math.atan2(p.dy,p.dx)+Math.PI/2);
    c.beginPath();c.moveTo(-11,0);c.quadraticCurveTo(-3,w*.24,3,w*.95);
    c.quadraticCurveTo(4,w*.42,11,0);c.closePath();
    c.fillStyle='#a5dab390';c.fill();c.beginPath();c.moveTo(-2,0);c.quadraticCurveTo(0,w*.43,3,w*.91);
    c.strokeStyle='#f6eabb';c.lineWidth=1.8;c.stroke();c.restore();
  });
}

function drawWave(c:CanvasRenderingContext2D,wave:MeleeWave,time:number,detail:boolean):void {
  const points=waveEdges(wave,time);
  if(points.length<2)return;
  switch(wave.kind){
    case 'tongs':
      ribbon(c,points,.99,.07,'#e7a75832');
      ribbon(c,points,.99,.69,'#aa5736d9');
      ribbon(c,points,.985,.79,'#ffbd70');
      ribbon(c,points,.98,.91,'#ffefbc');
      ribbon(c,points,.50,.34,'#b26940c7');
      ribbon(c,points,.51,.41,'#ffda91');
      if(detail)receipts(c,points);
      break;
    case 'knife':{
      // The blue adhesive backing tears into tapered strips under the silver lip.
      const backing=(p:EdgePoint)=>.14+.48*((p.arc/.46)%1)**2;
      ribbon(c,points,1,.04,'#779ab475');
      ribbon(c,points,1,backing,'#444e76ed');
      ribbon(c,points,.96,p=>backing(p)+.12,'#73cee8');
      ribbon(c,points,.99,.74,'#f1ffff');
      ribbon(c,points,.31,p=>.31-.21*Math.max(0,Math.sin(p.arc*8-.5)),'#b2eaf7');
      if(detail){
        ribbon(c,points,.72,p=>.72-.26*Math.max(0,Math.sin(p.arc*24)),'#ddfaff');
        cutSeals(c,points);
      }
      break;
    }
    case 'sword':{
      // Thick, offset pressure plates inherit the squared-off ruler edge.
      const tooth=(p:EdgePoint)=>(p.arc/(30*radians))%1;
      const back=(p:EdgePoint)=>.13+.48*tooth(p)**1.8;
      ribbon(c,points,1,.02,'#bb71402b');
      ribbon(c,points,.99,back,'#a1483fc9');
      ribbon(c,points,.97,p=>back(p)+.2,'#ed9165de');
      ribbon(c,points,.99,.88,'#ffe5a8');
      if(detail){
        ribbon(c,points,.78,p=>.78-(tooth(p)<.1?.26:0),'#fff0be');
        ribbon(c,points,.52,p=>.52-.095*Math.max(0,Math.sin(p.arc*13)),'#faac75bd');
      }
      break;
    }
    case 'umbrella':{
      // Each soft lobe balloons between the positions of two canopy ribs.
      const panel=(p:EdgePoint)=>Math.abs(Math.sin(p.arc*Math.PI/(43*radians)));
      const bow=(p:EdgePoint)=>.44+.55*panel(p);
      if(detail)canopyFolds(c,points);
      ribbon(c,points,1,.08,'#8ad5ae3d');
      ribbon(c,points,bow,p=>.03+.17*panel(p),'#397867d6');
      ribbon(c,points,p=>bow(p)-.06,p=>.10+.26*panel(p),'#94d6aee0');
      ribbon(c,points,bow,p=>bow(p)-.14,'#fff3c6');
      ribbon(c,points,p=>.24+.16*panel(p),p=>.14+.16*panel(p),'#c4ebbd');
      if(detail)ribbon(c,points,bow,p=>bow(p)-.48*Math.max(0,1-panel(p)*3),'#f7e9b5dc');
      break;
    }
  }
}

export function drawMeleeWaves(c:CanvasRenderingContext2D,state:GameState,settings:Settings):void {
  c.save();
  for(const wave of state.meleeWaves)drawWave(c,wave,state.time,settings.quality!=='simple'&&!settings.reduceMotion);
  const attack=state.weapon.attack;
  if(attack?.kind==='umbrella'&&attack.phase==='active'&&!attack.blocked){
    const {outer,halfAngle}=UMBRELLA_GUARD;
    c.beginPath();c.arc(state.player.x,state.player.y-28,outer,attack.angle-halfAngle,attack.angle+halfAngle);
    c.strokeStyle='#f6cb8b';c.lineWidth=2.5;c.stroke();
  }
  c.restore();
}
