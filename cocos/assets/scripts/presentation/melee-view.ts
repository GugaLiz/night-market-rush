import {Color, Graphics, Node, UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import {isMelee,meleeWaveBand} from '../domain/core/melee';
import {UMBRELLA_GUARD, WEAPONS} from '../domain/core/weapons';
import type {GameEvent, GameState, MeleeWave, Settings, Vec, WeaponKind} from '../domain/shared/types';
import {meleeReleasePose,rangedReleasePose,type RangedRelease,type ReleaseAnchor,type StrikeAnchor} from './weapon-release-model';

const radians=Math.PI/180,turn=Math.PI*2;
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));

export interface WaveEdge {x:number;y:number;dx:number;dy:number;inner:number;outer:number;arc:number;taper:number}

/** Samples the same swept slices and radial bands that the Web renderer paints. */
export function sampleMeleeWave(wave:MeleeWave,time:number):WaveEdge[] {
  const slices=wave.slices,bands=slices.map(slice=>meleeWaveBand(wave,slice,time));
  const points:WaveEdge[]=[];
  for(let i=0;i<slices.length;i++){
    const slice=slices[i],band=bands[i],width=2*slice.halfAngle;
    if(!band)continue;
    const steps=2*Math.max(1,Math.ceil(slice.halfAngle/(4*radians)));
    for(let j=points.length?1:0;j<=steps;j++){
      const t=j/steps,neighbor=i+(t<.5?-1:1),other=bands[neighbor],origin=other?slices[neighbor]:slice;
      const weight=other?Math.abs(t-.5)*2*slice.halfAngle/(slice.halfAngle+origin.halfAngle):0;
      const angle=slice.angle+wave.swingSide*(t-.5)*width;
      points.push({x:mix(slice.x,origin.x,weight),y:mix(slice.y,origin.y,weight)-28,
        dx:Math.cos(angle),dy:Math.sin(angle),inner:mix(band.inner,other?.inner??band.inner,weight),
        outer:mix(band.outer,other?.outer??band.outer,weight),arc:turn+wave.swingSide*angle,taper:1});
    }
  }
  if(points.length){
    const start=points[0].arc,end=points[points.length-1].arc;
    for(const p of points)p.taper=.18+.82*Math.min(1,(p.arc-start)/.19,(end-p.arc)/.16);
  }
  return points;
}

function hex(value:string):Color {
  const v=value.replace('#','');
  return new Color(parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16),v.length===8?parseInt(v.slice(6,8),16):255);
}
type Profile=number|((p:WaveEdge)=>number);
function ribbon(g:Graphics,points:WaveEdge[],front:Profile,back:Profile,fill:string):void {
  if(points.length<2)return;
  for(let i=0;i<points.length;i++){
    const p=points[i],depth=typeof front==='number'?front:front(p),r=mix(p.inner,p.outer,depth),x=X(p.x+p.dx*r),y=Y(p.y+p.dy*r);
    if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
  }
  for(let i=points.length-1;i>=0;i--){
    const p=points[i],a=typeof front==='number'?front:front(p),b=typeof back==='number'?back:back(p);
    const r=mix(p.inner,p.outer,mix(a,b,p.taper));g.lineTo(X(p.x+p.dx*r),Y(p.y+p.dy*r));
  }
  g.close();g.fillColor=hex(fill);g.fill();
}

function spacedMarks(points:WaveEdge[],spacing:number,draw:(p:WaveEdge,index:number)=>void):void {
  let previous=-1;
  for(const p of points){const index=Math.floor(p.arc/spacing);if(index===previous)continue;previous=index;if(p.taper>.64&&p.outer-p.inner>8)draw(p,index);}
}

/** Local coordinates follow the source canvas: +x forward, +y down. */
function point(x:number,y:number,angle:number,localX:number,localY:number,scaleX=1,scaleY=1):Vec {
  const a=localX*scaleX,b=localY*scaleY,c=Math.cos(angle),s=Math.sin(angle);
  return {x:X(x+a*c-b*s),y:Y(y+a*s+b*c)};
}
function line(g:Graphics,points:Vec[],stroke:string,width:number,close=false,fill?:string):void {
  if(!points.length)return;
  g.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);
  if(close)g.close();if(fill){g.fillColor=hex(fill);g.fill();}if(width>0){g.strokeColor=hex(stroke);g.lineWidth=width;g.stroke();}
}
function circleArc(g:Graphics,x:number,y:number,r:number,a:number,b:number,stroke:string,width:number):void {
  const n=Math.max(4,Math.ceil(Math.abs(b-a)*12)),points:Vec[]=[];
  for(let i=0;i<=n;i++){const t=mix(a,b,i/n);points.push({x:X(x+Math.cos(t)*r),y:Y(y+Math.sin(t)*r)});}
  line(g,points,stroke,width);
}

function waveMarks(g:Graphics,kind:MeleeWave['kind'],points:WaveEdge[]):void {
  if(kind==='tongs')spacedMarks(points,.83,(p,i)=>{
    const r=mix(p.inner,p.outer,.31),angle=Math.atan2(p.dy,p.dx)+1.18+(i%2)*.49,x=p.x+p.dx*r,y=p.y+p.dy*r;
    const path=[[-7,-3],[6,-2],[7,2],[4,1.5],[2,3],[-6,2]].map(([a,b])=>point(x,y,angle,a,b));
    line(g,path,'#936751',.9,true,'#fff2d3');line(g,[point(x,y,angle,-4,-1.7),point(x,y,angle,1,-1.2)],'#936751',.9);
  });
  else if(kind==='knife')spacedMarks(points,.96,(p,i)=>{
    const r=mix(p.inner,p.outer,.19),angle=Math.atan2(p.dy,p.dx)+Math.PI/2,x=p.x+p.dx*r,y=p.y+p.dy*r,flip=i%2?1:-1;
    const path=[[11,-3],[-16,13],[-8,6],[-13,7]].map(([a,b])=>point(x,y,angle,a*flip,b));
    line(g,path,'#506780',1,true,'#d1eef0');line(g,[point(x,y,angle,-6*flip,3),point(x,y,angle,-flip,1)],'#688dad',1.8);
  });
  else if(kind==='umbrella')spacedMarks(points,43*radians,p=>{
    const r=mix(p.inner,p.outer,.55),w=p.outer-p.inner,angle=Math.atan2(p.dy,p.dx)+Math.PI/2,x=p.x+p.dx*r,y=p.y+p.dy*r;
    line(g,[point(x,y,angle,-11,0),point(x,y,angle,3,w*.95),point(x,y,angle,11,0)],'#a5dab390',0,true,'#a5dab390');
    line(g,[point(x,y,angle,-2,0),point(x,y,angle,3,w*.91)],'#f6eabb',1.8);
  });
}

function drawWave(g:Graphics,wave:MeleeWave,time:number,detail:boolean):void {
  const points=sampleMeleeWave(wave,time);if(points.length<2)return;
  switch(wave.kind){
    case 'tongs':
      ribbon(g,points,.99,.07,'#e7a75825');ribbon(g,points,.99,.72,'#aa5736b8');
      ribbon(g,points,.985,.79,'#ffc17bc9');ribbon(g,points,.98,.92,'#ffedbad9');
      ribbon(g,points,.51,.37,'#b2694082');ribbon(g,points,.51,.44,'#ffd69ba8');if(detail)waveMarks(g,wave.kind,points);break;
    case 'knife':{
      const backing=(p:WaveEdge)=>.14+.48*((p.arc/.46)%1)**2;
      ribbon(g,points,1,.04,'#779ab475');ribbon(g,points,1,backing,'#444e76ed');
      ribbon(g,points,.96,p=>backing(p)+.12,'#73cee8');ribbon(g,points,.99,.74,'#f1ffff');
      ribbon(g,points,.31,p=>.31-.21*Math.max(0,Math.sin(p.arc*8-.5)),'#b2eaf7');
      if(detail){ribbon(g,points,.72,p=>.72-.26*Math.max(0,Math.sin(p.arc*24)),'#ddfaff');waveMarks(g,wave.kind,points);}break;
    }
    case 'sword':{
      const tooth=(p:WaveEdge)=>(p.arc/(30*radians))%1,back=(p:WaveEdge)=>.13+.48*tooth(p)**1.8;
      ribbon(g,points,1,.02,'#bb71402b');ribbon(g,points,.99,back,'#a1483fc9');
      ribbon(g,points,.97,p=>back(p)+.2,'#ed9165de');ribbon(g,points,.99,.88,'#ffe5a8');
      if(detail){ribbon(g,points,.78,p=>.78-(tooth(p)<.1?.26:0),'#fff0be');ribbon(g,points,.52,p=>.52-.095*Math.max(0,Math.sin(p.arc*13)),'#faac75bd');}break;
    }
    case 'umbrella':{
      const panel=(p:WaveEdge)=>Math.abs(Math.sin(p.arc*Math.PI/(43*radians))),bow=(p:WaveEdge)=>.44+.55*panel(p);
      if(detail)waveMarks(g,wave.kind,points);
      ribbon(g,points,1,.08,'#8ad5ae3d');ribbon(g,points,bow,p=>.03+.17*panel(p),'#397867d6');
      ribbon(g,points,p=>bow(p)-.06,p=>.10+.26*panel(p),'#94d6aee0');ribbon(g,points,bow,p=>bow(p)-.14,'#fff3c6');
      ribbon(g,points,p=>.24+.16*panel(p),p=>.14+.16*panel(p),'#c4ebbd');
      if(detail)ribbon(g,points,bow,p=>bow(p)-.48*Math.max(0,1-panel(p)*3),'#f7e9b5dc');break;
    }
  }
}

const materials:Record<WeaponKind,{dark:string;mid:string;light:string}>={
  tongs:{dark:'#a74138',mid:'#ff963e',light:'#fff2b7'},knife:{dark:'#455283',mid:'#8fe7f3',light:'#f3ffff'},
  sword:{dark:'#b34a39',mid:'#ffa048',light:'#fff4b7'},umbrella:{dark:'#367f79',mid:'#91dac0',light:'#fff3b6'},
  bag:{dark:'#a77849',mid:'#eccb8d',light:'#fff4c4'},chopsticks:{dark:'#b14c30',mid:'#ffb543',light:'#fff3af'},
  tray:{dark:'#47699e',mid:'#83ddf7',light:'#fff6ce'},spirit:{dark:'#117b76',mid:'#67e7b9',light:'#f2ffd5'},
  lunchbox:{dark:'#b54937',mid:'#ff9555',light:'#fff2a8'},talisman:{dark:'#9d3f67',mid:'#ffc767',light:'#fff5be'},
};
interface Contact {kind:WeaponKind;angle:number;seed:number;bornAt:number;duration:number;featured:boolean;x:number;y:number}
export interface WeaponAnchors {release?:ReleaseAnchor|null;strike?:StrikeAnchor|null}

/**
 * `waveParent` and `effectParent` are centred 1280x720 Y-up UI world nodes.
 * Place waves behind actors, contacts above actors, and release marks according
 * to the host's layering. Hand anchors are optional world-space coordinates.
 */
export class MeleeLayer {
  readonly waveNode:Node;
  readonly effectNode:Node;
  private readonly waves:Graphics;
  private readonly effects:Graphics;
  private readonly releases:RangedRelease[]=[];
  private readonly contacts:Contact[]=[];
  private lastTime=0;

  constructor(waveParent:Node,effectParent:Node=waveParent){
    this.waveNode=this.makeNode('MeleeWaves',waveParent);this.waves=this.waveNode.addComponent(Graphics);
    this.effectNode=this.makeNode('WeaponImpacts',effectParent);this.effects=this.effectNode.addComponent(Graphics);
  }

  /** Call once per simulation event batch before update; time is simulation time. */
  events(events:readonly GameEvent[],time:number):void {
    if(time<this.lastTime)this.reset();
    for(const e of events){
      if(e.type==='attack'&&!isMelee(e.kind)&&!this.releases.some(r=>r.id===e.id)){
        this.releases.push({id:e.id,kind:e.kind,angle:e.angle,bornAt:time});
      }else if(e.type==='damage'&&e.victimId!==0&&(e.burstIndex??1)===1&&Object.prototype.hasOwnProperty.call(WEAPONS,e.source)){
        const y=e.y-28,featured=!this.contacts.some(hit=>hit.featured&&time-hit.bornAt<.12&&Math.hypot(hit.x-e.x,hit.y-y)<120);
        this.contacts.push({kind:e.source as WeaponKind,x:e.x,y,angle:e.impactAngle??0,seed:e.victimId,bornAt:time,
          duration:e.source==='sword'||e.source==='lunchbox'?.34:.27,featured});
      }
    }
  }

  /** Call when starting a fresh run to clear event visuals even at the same time. */
  reset():void {this.releases.length=0;this.contacts.length=0;this.lastTime=0;this.waves.clear();this.effects.clear();}

  update(state:GameState,settings:Pick<Settings,'quality'|'reduceMotion'>,anchors:WeaponAnchors={}):void {
    const {time}=state;
    if(time<this.lastTime){this.releases.length=0;this.contacts.length=0;}
    this.lastTime=time;this.waves.clear();this.effects.clear();
    const detail=settings.quality!=='simple'&&!settings.reduceMotion;
    for(const wave of state.meleeWaves)drawWave(this.waves,wave,time,detail);
    const attack=state.weapon.attack;
    if(attack?.kind==='umbrella'&&attack.phase==='active'&&!attack.blocked){
      const {outer,halfAngle}=UMBRELLA_GUARD;
      circleArc(this.waves,state.player.x,state.player.y-28,outer,attack.angle-halfAngle,attack.angle+halfAngle,'#f6cb8b',2.5);
    }
    const strike=meleeReleasePose(attack,time,anchors.strike??null);
    if(strike)this.drawRelease(strike.kind,strike.point.x,strike.point.y,strike.angle,strike.progress,settings.reduceMotion);
    for(let i=this.releases.length-1;i>=0;i--){
      const release=this.releases[i],t=(time-release.bornAt)/.18;
      if(t>=1){this.releases.splice(i,1);continue;}
      const visible=rangedReleasePose(release,time,attack,anchors.release??null);
      if(visible)this.drawRelease(visible.kind,visible.point.x,visible.point.y,visible.angle,visible.progress,settings.reduceMotion);
    }
    for(let i=this.contacts.length-1;i>=0;i--){
      const contact=this.contacts[i],age=time-contact.bornAt;
      if(age>=contact.duration){this.contacts.splice(i,1);continue;}
      if(age<0)continue;
      this.drawContact(contact,age,settings);
    }
  }

  destroy():void {this.releases.length=0;this.contacts.length=0;this.waveNode.destroy();this.effectNode.destroy();}

  private makeNode(name:string,parent:Node):Node {const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;}

  private drawRelease(kind:WeaponKind,x:number,y:number,angle:number,t:number,reduced:boolean):void {
    const g=this.effects,m=materials[kind],fade=Math.min(1,(1-t)*3),stretch=reduced?1:.84+.38*Math.sin(t*Math.PI),sy=reduced?1:1.1-.27*t;
    const alpha=(hexColor:string)=>{const c=hex(hexColor);c.a=Math.round(c.a*fade*(kind==='tongs'?.62:1));return c;};
    const outline=kind==='tongs'?[[-2,-6],[14,-16],[27,-12],[10,-4],[18,-2],[0,0],[15,3],[24,11],[10,13],[-2,6]]:
      kind==='knife'?[[-2,4],[30,-13],[18,-3],[22,-4],[5,7],[9,3]]:
      kind==='sword'?[[-2,-11],[25,-11],[30,-5],[17,-3],[14,4],[6,5],[2,12],[-1,11],[4,1],[-2,0]]:
      kind==='umbrella'?[[0,1],[3,-10],[16,-17],[22,-11],[27,-2],[22,11],[13,16],[4,12]]:
      kind==='bag'?[[0,-3],[12,-13],[23,-16],[30,0],[22,15],[12,13],[0,3]]:
      kind==='chopsticks'?[[-2,-4],[27,-14],[17,-7],[-1,0],[33,-2],[24,1],[-1,4],[25,10],[18,11],[1,7]]:
      kind==='tray'?[[-3,-5],[9,-13],[24,-10],[30,3],[16,14],[25,-2],[8,-10],[-3,-2]]:
      kind==='spirit'?[[-3,3],[7,-7],[15,-16],[27,-11],[27,-4],[17,2],[13,-4],[10,6],[-3,8]]:
      kind==='lunchbox'?[[0,-4],[5,-9],[13,-17],[17,-13],[12,-8],[6,-3],[15,-6],[25,-12],[29,-8],[25,-2],[12,2],[18,5],[25,12],[16,10],[3,6]]:
      [[1,-11],[20,-9],[19,11],[-1,9]];
    const sx=stretch*(kind==='tongs'?.72:1),scaleY=sy*(kind==='tongs'?.76:1);
    const vertices=outline.map(([a,b])=>point(x,y,angle,a,b,sx,scaleY));
    if(vertices.length){g.moveTo(vertices[0].x,vertices[0].y);for(let i=1;i<vertices.length;i++)g.lineTo(vertices[i].x,vertices[i].y);g.close();
      g.fillColor=alpha(kind==='talisman'?'#da5958':m.mid);g.strokeColor=alpha(m.dark);g.lineWidth=1.6;g.fill();g.stroke();}
    const a=point(x,y,angle,3,-3,sx,scaleY),b=point(x,y,angle,19,-7,sx,scaleY);
    g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.strokeColor=alpha(m.light);g.lineWidth=1.8;g.stroke();
  }

  private drawContact(hit:Contact,age:number,settings:Pick<Settings,'quality'|'reduceMotion'>):void {
    const g=this.effects,m=materials[hit.kind],t=Math.min(1,age/hit.duration);
    const size=(hit.featured?1:.66)*(hit.kind==='sword'||hit.kind==='lunchbox'?1.13:1);
    const travel=settings.reduceMotion?.18:1-(1-t)**2,opacity=Math.min(1,(1-t)*1.65);
    const tint=(value:string,alpha=1)=>{const c=hex(value);c.a=Math.round(c.a*alpha*opacity);return '#'+[c.r,c.g,c.b,c.a].map(n=>n.toString(16).padStart(2,'0')).join('');};
    const at=(a:number,b:number)=>point(hit.x,hit.y,hit.angle,a,b,size,size);
    if(hit.kind==='tongs'){
      if(age>=.042+.103)return;
      const release=settings.reduceMotion?.24:Math.min(1,Math.max(0,(age-.042)/.125));
      const alpha=Math.max(0,1-Math.max(0,age-.042)/.103),radius=13+release*10,arc:Vec[]=[];
      for(let i=0;i<=14;i++){const a=Math.PI*(.71+.58*i/14);arc.push(at(-9+Math.cos(a)*radius,Math.sin(a)*radius));}
      line(g,arc,tint('#a95632',alpha),5.5*(1-.5*t));line(g,arc,tint('#fff0ad',alpha),2.5*(1-.5*t));
      for(const side of [-1,1])line(g,[at(-14-release*6,side*(9+release*8)),at(-20-release*11,side*(13+release*12)),at(-21-release*15,side*(5+release*15))],tint(side===1?'#ffcc80':'#ffefd4',alpha),3*(1-.6*t));
      return;
    }
    if(hit.kind==='chopsticks'){
      if(t<.44||settings.reduceMotion){const a=settings.reduceMotion?.74:1-t/.44;line(g,[at(-22,-8),at(-14,-2),at(-10,-6)],tint('#fff5bd',a),3);line(g,[at(-21,6),at(-14,2)],tint('#fff5bd',a),3);}
      if(t>.16||settings.reduceMotion){const emergence=settings.reduceMotion?.6:Math.min(1,(t-.16)/.33),start=13+Math.max(0,t-.46)*35,end=start+(10+28*emergence)*(1-.42*t);line(g,[at(start,3),at(start+6,-5),at(end,-1),at(start+6,3)],tint('#46896e'),1.7,true,tint('#dffac8'));}
      return;
    }
    const count=settings.quality==='simple'||!hit.featured?3:5;
    for(let i=0;i<count;i++){
      const jitter=Math.sin(hit.seed*.73+i*7.85),angle=(i-(count-1)/2)*(.33+(5-count)*.12)+jitter*.13;
      const distance=8+travel*(20+(i%2)*13+5*jitter),px=Math.cos(angle)*distance,py=Math.sin(angle)*distance;
      if(hit.kind==='spirit'||hit.kind==='bag'){
        const centre=at(px,py),rx=(9+i%3)*(1-t*.5)*size,ry=(3.5+i%3)*size;
        g.fillColor=hex(tint(hit.kind==='spirit'?m.mid:'#f4dfb7'));g.strokeColor=hex(tint(m.dark));g.lineWidth=1.4;g.ellipse(centre.x,centre.y,rx,ry);g.fill();g.stroke();
      }else if(hit.kind==='talisman'||hit.kind==='lunchbox'){
        const w=4+i%3,rot=angle+jitter*.75,c=Math.cos(rot),s=Math.sin(rot);
        const p=(x:number,y:number)=>at(px+x*c-y*s,py+x*s+y*c);
        line(g,[p(-w,-3),p(w,-3),p(w,3),p(-w,3)],tint(m.dark),1.6,true,tint(i%2?m.mid:m.light));
      }else{
        const length=(12+i%3*4)*(1-.55*t),w=2.7+i%2,c=Math.cos(angle),s=Math.sin(angle);
        const p=(x:number,y:number)=>at(px+x*c-y*s,py+x*s+y*c);
        line(g,[p(-length*.30,0),p(0,-w),p(length,0),p(length*.16,w*.72)],tint(m.dark),1.25,true,tint(m.mid));
        if(i%2===0)line(g,[p(-length*.19,0),p(0,-w*.85),p(length*.85,0)],tint(m.light),0,true,tint(m.light));
      }
    }
    if(hit.featured){
      const tip=at(-7,0),world={x:tip.x+WORLD.width/2,y:WORLD.height/2-tip.y};
      this.drawRelease(hit.kind,world.x,world.y,hit.angle,t,settings.reduceMotion);
    }
  }
}

// Remaining parity work: exact curved receipt/canopy details, release artwork
// Path2D silhouettes and strike-image atlas, exact impact curves and visual
// layering, launch hand anchors from CourierView. Projectiles and flight wakes
// are owned by ProjectilesView; they must not be duplicated here. Validate a
// real Creator build and target devices before claiming finished-game parity.
