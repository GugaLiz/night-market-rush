import {ELEMENTAL, elementalRadius} from '../core/elemental-skills';
import {clamp} from '../core/geometry';
import type {ElementalField, Enemy, GameState, Settings} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';

type Canvas = CanvasRenderingContext2D;
const turn = Math.PI * 2;
const unit = (n:number) => clamp(n,0,1);

function oval(c:Canvas,x:number,y:number,rx:number,ry:number,color:string|CanvasGradient,angle=0):void {
  c.fillStyle=color;
  c.beginPath();c.ellipse(x,y,rx,ry,angle,0,turn);c.fill();
}

// A tapered strip curls from the far edge of the field into the mouth of the wok.
function spiral(c:Canvas,length:number,angle:number,phase:number,gold:boolean):void {
  c.save();c.rotate(angle);
  const ink=c.createRadialGradient(0,0,0,0,0,length);
  ink.addColorStop(0,gold?'#fff4b8':'#fff1ff');
  ink.addColorStop(.27,gold?'#ffa856ef':'#d889fff2');
  ink.addColorStop(.63,gold?'#f4a25191':'#c67bf3a3');
  ink.addColorStop(1,'#e1b5ff00');
  c.fillStyle=ink;
  c.beginPath();c.moveTo(length,0);
  c.bezierCurveTo(length*.67,-length*.35,length*.19,-length*.53,-length*.10,-length*.27);
  c.bezierCurveTo(-length*.26,-length*.09,-length*.13,length*.10,length*.04,length*.06);
  c.bezierCurveTo(-length*.12,length*.11,-length*.22,-length*.06,-length*.08,-length*.22);
  c.bezierCurveTo(length*.18,-length*(.53+phase*.018),length*.65,-length*.35,length,0);
  c.closePath();c.fill();
  c.strokeStyle=gold?'#ffd5849c':'#e4b1fcb8';c.lineWidth=1.45;
  c.beginPath();c.moveTo(-length*.08,-length*.22);
  c.quadraticCurveTo(-length*.18,-length*.09,-length*.14,-length*.012);c.stroke();
  c.restore();
}

function gravityWell(c:Canvas,field:ElementalField,time:number,settings:Settings,assets:Assets):void {
  const age=time-field.bornAt, after=time-field.releaseAt;
  const opening=unit(age/.32), closing=unit(-after/.38), contraction=.54+.46*closing;
  const size=(25+opening*47)*contraction;
  const spin=settings.reduceMotion?.45:age*1.47;
  if(after>=0){
    const t=unit(after/ELEMENTAL.vortex.fade), fade=1-t;
    const rim=ELEMENTAL.vortex.blastRadius;
    const wave=rim*(settings.reduceMotion?1:.16+.84*(1-(1-t)**3));
    const burst=c.createRadialGradient(0,0,0,0,0,wave);
    burst.addColorStop(0,'#3c1d5400');burst.addColorStop(.76,'#a754cf19');
    burst.addColorStop(.92,'#ef98ff87');burst.addColorStop(1,'#ffd68100');
    c.globalAlpha=fade;oval(c,0,0,wave,wave,burst);
    c.strokeStyle='#fff1c3';c.lineWidth=2+4*fade;c.beginPath();
    for(let i=0;i<8;i++) {
      const a=i*turn/8+.08;c.moveTo(Math.cos(a)*wave,Math.sin(a)*wave);
      c.arc(0,0,wave,a,a+.46);
    }
    c.stroke();return;
  }
  const length=420*(.40+.60*opening)*contraction;
  c.globalAlpha=opening;
  const halo=c.createRadialGradient(0,0,0,0,0,length*.82);
  halo.addColorStop(0,'#42214676');halo.addColorStop(.32,'#6a38884f');halo.addColorStop(1,'#8c4cb000');
  oval(c,0,0,length*.82,length*.82,halo);
  c.save();c.scale(1,.82);
  const arms=settings.quality==='simple'?4:7;
  for(let i=0;i<arms;i++){
    spiral(c,length*(.84+.16*Math.cos(i*2.3)),spin+i*turn/arms,Math.cos(i),i%3===0);
  }
  c.restore();
  if(!settings.reduceMotion){
    const motes=settings.quality==='simple'?6:18;
    for(let i=0;i<motes;i++){
      const inward=(age*.66+i*.618)%1, r=30+length*(1-inward)**1.7;
      const a=i*2.4+inward*2.35+spin*.45;
      const x=Math.cos(a)*r,y=Math.sin(a)*r*.82;
      // Loose sesame grains and paper tags shrink as they drop out of sight.
      const w=(3+i%4)*(1-inward*.63);
      c.save();c.translate(x,y);c.rotate(a+.73);
      if(i%4===0){
        c.fillStyle='#fff2c9';c.fillRect(-w,-w*.64,w*2,w*1.28);
        c.fillStyle='#a34148';c.fillRect(-w*.72,-w*.34,w*.46,w*.68);
      }else oval(c,0,0,w,w*.43,i%2?'#ffc369':'#efd4ff');
      c.restore();
    }
  }
  // Tilted lens and raised enamel rim remain readable on the patterned market floor.
  c.save();c.rotate(-.12);c.scale(1,.65);
  const lens=c.createRadialGradient(-size*.07,-size*.15,1,0,0,size*1.37);
  lens.addColorStop(0,'#0e0825');lens.addColorStop(.34,'#170c34');lens.addColorStop(.48,'#382154');
  lens.addColorStop(.59,'#8d46a9');lens.addColorStop(.69,'#f5b9ff');lens.addColorStop(.73,'#784a9c');
  lens.addColorStop(.87,'#4b28597a');lens.addColorStop(1,'#652a8c00');
  oval(c,0,0,size*1.37,size*1.37,lens);
  c.lineCap='round';
  c.strokeStyle='#f7bd72';c.lineWidth=4;c.beginPath();c.arc(0,0,size*.97,.17,2.63);c.stroke();
  c.strokeStyle='#fff1b9';c.lineWidth=1.8;c.beginPath();c.arc(0,0,size*.97,.60,1.55);c.stroke();
  c.restore();
  if(age<.7){
    c.globalAlpha=unit((age-.18)/.11)*unit(1-(age-.20)/.5);
    drawSprite(c,assets,'vortex',0,-3,48*(1-.45*opening),-.16,1,.55);
  }
}

let lensStamp:HTMLCanvasElement|undefined;

function accretionDisk():HTMLCanvasElement {
  if(lensStamp)return lensStamp;
  const stamp=document.createElement('canvas');stamp.width=312;stamp.height=176;
  const c=stamp.getContext('2d')!;c.translate(156,92);c.rotate(-.14);
  const light=c.createLinearGradient(-120,0,120,0);
  light.addColorStop(0,'#7051c300');light.addColorStop(.15,'#bb6bee');
  light.addColorStop(.41,'#ffe2fc');light.addColorStop(.59,'#fff3bd');
  light.addColorStop(.80,'#ffab59');light.addColorStop(1,'#e86f7d00');
  // The back half of the accretion disk bends up over the lens, the near half
  // crosses its equator. Bake the soft light so crowds never pay for a live blur.
  function lightBand(near:boolean):void {
    c.lineCap='round';c.strokeStyle=light;
    for(let k=-4;k<=4;k++){
      c.beginPath();
      for(let i=0;i<=64;i++){
        const x=(i/32-1)*135, u=x/135, taper=Math.sqrt(Math.max(0,1-u*u));
        const strand=Math.cos(u*13+k*.7)*.7;
        const bend=near?10*taper-6*Math.cos(u*4):
          -51*Math.exp(-((u+.08)**2)/.098)-6*taper;
        const y=bend+k*taper*1.45+strand;
        if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
      }
      c.globalAlpha=k===0?.96:.59;
      c.lineWidth=k===0?4.2:1.15;
      c.shadowBlur=k===0?11:3;c.shadowColor=near?'#ffd3a3':'#dc97fc';c.stroke();
    }
    c.shadowBlur=0;c.globalAlpha=1;
  }
  lightBand(false);
  const core=c.createRadialGradient(-2,-4,0,0,0,44);
  core.addColorStop(0,'#070419');core.addColorStop(.72,'#0d0920');core.addColorStop(.83,'#241237');
  core.addColorStop(.92,'#573073');core.addColorStop(.975,'#f5b4ee');core.addColorStop(1,'#ffe9ba');
  oval(c,0,0,44,44,core);
  c.strokeStyle='#e7a3caa8';c.lineWidth=1.8;c.beginPath();c.ellipse(0,2,42,48,-.17,.10,3.05);c.stroke();
  lightBand(true);
  lensStamp=stamp;return stamp;
}

// Keep the projected lens visible at the point where the creatures converge.
export function drawVortexMouth(c:Canvas,field:ElementalField,time:number,quiet:boolean):void {
  const age=time-field.bornAt, opening=unit((age-.11)/.27), closing=unit((field.releaseAt-time)/.38);
  if(!opening)return;
  const strength=opening*(.42+.58*closing)*.85;
  c.save();c.translate(field.x,field.y-9);
  if(!quiet)c.rotate(Math.sin(age*1.9)*.055);
  c.scale(strength,strength);c.drawImage(accretionDisk(),-156,-92);
  c.restore();
}

let brineVapor:HTMLCanvasElement|undefined;

// Paint a soft, scalloped vapor tuft once; each puff on the street uses the same small stamp.
function vaporStamp(assets:Assets):HTMLCanvasElement {
  if(brineVapor)return brineVapor;
  const stamp=document.createElement('canvas');stamp.width=128;stamp.height=96;
  const brush=stamp.getContext('2d')!;
  for(const [x,y,r] of [[25,64,25],[86,65,36],[58,54,38],[35,45,25],[66,34,22],[90,44,19],[105,59,20]]){
    const fill=brush.createRadialGradient(x-4,y-r*.3,0,x,y,r);
    fill.addColorStop(0,'#edffb8c4');fill.addColorStop(.38,'#bcea78a8');
    fill.addColorStop(.73,'#81bf6184');fill.addColorStop(1,'#54878600');
    oval(brush,x,y,r,r*.84,fill);
  }
  // Borrow the sculpted swirls of the steamer's vapor, glaze them the color of
  // pickling brine, and let the edge dissolve into the translucent outer mist.
  const tuft=document.createElement('canvas');tuft.width=128;tuft.height=96;
  const clay=tuft.getContext('2d')!, cell=assets.ultimateFx.naturalWidth/2;
  clay.drawImage(assets.ultimateFx,cell,0,cell,cell,-6,-20,140,130);
  clay.globalCompositeOperation='source-atop';clay.fillStyle='#88c741a8';clay.fillRect(0,0,128,96);
  brush.globalAlpha=.45;brush.drawImage(tuft,0,0);
  brineVapor=stamp;return stamp;
}

function bubble(c:Canvas,x:number,y:number,r:number):void {
  oval(c,x,y,r,r*1.02,'#55944dcb');
  oval(c,x-r*.09,y-r*.15,r*.79,r*.73,'#b7e364d9');
  oval(c,x-r*.25,y-r*.38,r*.29,r*.18,'#f9ffe4',-.45);
}

function brineCloud(c:Canvas,field:ElementalField,time:number,settings:Settings,assets:Assets):void {
  const age=time-field.bornAt, fade=unit((field.expiresAt-time)/ELEMENTAL.poison.fade);
  const r=time<field.releaseAt?elementalRadius(field,time):field.radius;
  if(r<=0)return;
  const motion=settings.reduceMotion?0:age, full=settings.quality==='standard';
  const pool=c.createRadialGradient(0,0,0,0,0,r);
  pool.addColorStop(0,'#344f332e');pool.addColorStop(.48,'#50783345');
  pool.addColorStop(.87,'#a8da624a');pool.addColorStop(1,'#c9ee8400');
  c.globalAlpha=fade;
  oval(c,0,0,r,r,pool);
  const lobes=full?13:8, stamp=vaporStamp(assets);
  for(let i=0;i<lobes;i++){
    const a=i*2.4+.16+.09*Math.sin(i+motion*.45), lift=settings.reduceMotion?.35:(age*.38+i*.381)%1;
    const radius=r*Math.sqrt((i+.45)/lobes)*.89;
    const x=Math.cos(a)*radius, y=Math.sin(a)*radius-lift*16;
    const w=Math.min(158,r*.77)*(.92+.21*Math.sin(a+motion));
    c.globalAlpha=fade*(.55+.18*Math.sin(lift*Math.PI));
    c.save();c.translate(x,y);c.scale(i%2===0?1:-1,1);c.rotate(Math.sin(a)*.17);
    c.drawImage(stamp,-w/2,-w*.49,w,w*.74);c.restore();
    c.globalAlpha=fade*.88;
    bubble(c,x+w*.26,y-w*.1-lift*13,3.3+((i+1)%3)*1.5);
    if(i%3===0){
      c.strokeStyle='#d7e99ba1';c.lineWidth=1.7;c.beginPath();
      c.moveTo(x-w*.32,y);c.bezierCurveTo(x-w*.53,y-14,x-w*.18,y-w*.20,x-w*.36,y-w*.28);c.stroke();
      // Thin pickle slices float in the brine beneath the mist.
      c.save();c.translate(x+w*.08,y+w*.09);c.rotate(a*.43);
      oval(c,0,0,10.5,4.3,'#668d43');oval(c,-.4,-.8,8.7,3.4,'#c0de73');
      for(let seed=0;seed<3;seed++)oval(c,-3.7+seed*3.4,-.9,1,.67,'#fff6ba');
      c.restore();
    }
  }
  c.globalAlpha=fade*unit((age-.18)/.11);
  drawSprite(c,assets,'poison',0,5,50,.035*Math.sin(motion*2.3));
  // Narrow ribbons leave the mouth of the jar and curl into the lower cloud bank.
  c.lineCap='round';
  for(let i=0;i<3;i++){
    const side=i===0?-1:1,w=10+i*5;
    c.strokeStyle=i===1?'#d9f58dbf':'#94cc69bf';c.lineWidth=3.2-i*.55;
    c.beginPath();c.moveTo(-4+i*3,-37);
    c.bezierCurveTo(side*w,-52,side*(-w),-55,side*(w+4*Math.sin(motion+i)),-68-i*4);c.stroke();
  }
}

function shard(c:Canvas,x:number,y:number,w:number,h:number,a:number):void {
  c.save();c.translate(x,y);c.rotate(a);
  c.fillStyle='#54b8d5';c.strokeStyle='#dcfaff';c.lineWidth=1.2;
  c.beginPath();c.moveTo(0,0);c.lineTo(-w*.50,-h*.28);c.lineTo(-w*.33,-h*.78);
  c.lineTo(w*.08,-h);c.lineTo(w*.50,-h*.47);c.lineTo(w*.38,-h*.16);c.closePath();
  c.fill();c.stroke();
  c.fillStyle='#bcf2fc';c.beginPath();c.moveTo(0,-h*.1);c.lineTo(-w*.33,-h*.78);
  c.lineTo(w*.08,-h);c.lineTo(w*.16,-h*.53);c.closePath();c.fill();c.restore();
}

function frostBloom(c:Canvas,field:ElementalField,time:number,settings:Settings,assets:Assets):void {
  const age=time-field.bornAt, after=time-field.releaseAt;
  const radius=after<0?elementalRadius(field,time):field.radius;
  if(radius<1)return;
  const fade=unit((field.expiresAt-time)/ELEMENTAL.frost.fade);
  const quiet=settings.reduceMotion, full=settings.quality==='standard';
  const crack=after>=0?1:unit((time-field.releaseAt+.43)/.43);
  c.globalAlpha=fade;
  const ice=c.createRadialGradient(0,0,0,0,0,radius);
  ice.addColorStop(0,'#a4effd16');ice.addColorStop(.64,'#8ed8f426');
  ice.addColorStop(.92,'#91e3fa46');ice.addColorStop(1,'#f3ffff00');
  oval(c,0,0,radius,radius,ice);
  c.lineJoin='round';c.lineCap='round';
  // Grow six fern-like crystal branches along the floor from the machine. The
  // moving endpoints mark the exact current freeze range during its expansion.
  for(let i=0;i<6;i++){
    const a=i*turn/6+.17;
    c.save();c.rotate(a);
    const tip=radius*(.85+.10*Math.sin(i*2.1+1));
    const stem=radius*.026;
    c.fillStyle='#6bbcdc80';c.beginPath();c.moveTo(3,-stem*.43);c.lineTo(tip*.53,-stem*.55);
    c.lineTo(tip,0);c.lineTo(tip*.58,stem*.43);c.lineTo(3,stem*.85);c.closePath();c.fill();
    c.beginPath();c.moveTo(14,0);c.lineTo(tip,0);
    for(let j=1;j<=(full?3:2);j++){
      const root=tip*(j+1)*.17,branch=tip*(.27-j*.043);
      for(const side of [-1,1]){
        c.moveTo(root,0);c.lineTo(root+branch,side*branch*.64);
        if(full&&j<3){
          c.moveTo(root+branch*.52,side*branch*.33);c.lineTo(root+branch*.63,side*branch*.61);
        }
      }
    }
    c.strokeStyle='#517b9b8a';c.lineWidth=4.8;c.stroke();
    c.strokeStyle=crack>.6?'#f4ffffee':'#caf6ffd1';c.lineWidth=2.2;c.stroke();
    if(full){
      for(const side of [-1,1]){
        c.save();c.translate(tip*.42,0);c.rotate(side*.65);
        shard(c,0,0,Math.max(1,stem*1.4),Math.max(1,tip*.19),Math.PI*.50);
        c.restore();
      }
    }
    const cell=assets.ultimateFx.naturalWidth/2;
    // Each crystalline branch is seeded by a cluster cut from the same clay ice
    // sheet as the cold-box skill. The thinner etched forks continue beyond it.
    c.globalAlpha=fade*.80;
    c.drawImage(assets.ultimateFx,0,0,cell,cell,tip*.17,-tip*.22,tip*.63,tip*.33);
    if(full){
      c.save();c.translate(tip*.54,0);c.rotate(i%2===0?.57:-.57);
      c.drawImage(assets.ultimateFx,0,0,cell,cell,-tip*.03,-tip*.12,tip*.35,tip*.21);c.restore();
    }
    c.restore();
  }
  const count=full?18:10, throwOut=quiet?0:unit(after/ELEMENTAL.frost.fade);
  for(let i=0;i<count;i++){
    const a=i*turn/count+.13, lane=i%3;
    const d=radius*(.98-.07*lane)+throwOut*30;
    const x=Math.cos(a)*d,y=Math.sin(a)*d-throwOut*(1-throwOut)*53;
    const size=(20+lane*11)*(quiet?1:unit(age/.25));
    shard(c,x,y,size*.40,size,a+Math.PI*.50+Math.sin(i*7)*.28+throwOut*1.2);
    if(full&&lane!==1)shard(c,x+3,y+2,size*.30,size*.69,a+Math.PI*.72);
  }
  c.globalAlpha=fade*unit((age-.18)/.11);
  drawSprite(c,assets,'frost',0,5,52);
}

export function drawElementalGround(c:Canvas,s:GameState,settings:Settings,assets:Assets):void {
  if(!s.elementalFields)return;
  for(const field of s.elementalFields){
    if(s.time<field.bornAt||s.time>=field.expiresAt)continue;
    c.save();c.translate(field.x,field.y);
    if(field.kind==='vortex')gravityWell(c,field,s.time,settings,assets);
    else if(field.kind==='poison')brineCloud(c,field,s.time,settings,assets);
    else frostBloom(c,field,s.time,settings,assets);
    c.restore();
  }
}

export function drawPoisonedEnemy(c:Canvas,e:Enemy,foot:number,height:number,time:number,settings:Settings):void {
  if((e.poisonUntil??0)<=time)return;
  c.save();
  const count=settings.quality==='simple'?1:2;
  for(let i=0;i<count;i++){
    const t=settings.reduceMotion?.46:(time*.91+e.id*.382+i*.5)%1;
    const side=(i+e.id)%2===0?1:-1;
    const x=e.x+side*height*(.34+t*.12),y=foot-height*(.39+t*.45);
    c.globalAlpha=.45+.55*Math.sin(t*Math.PI);
    bubble(c,x,y,3.7+i*1.8);
  }
  c.restore();
}

export function drawIceFragments(c:Canvas,x:number,y:number,t:number,seed:number,settings:Settings):void {
  const quiet=settings.reduceMotion, count=settings.quality==='simple'?3:5;
  const distance=quiet?10:26*(1-(1-t)**2);
  for(let i=0;i<count;i++){
    const a=(i+.24)*turn/count+seed*.81;
    const px=x+Math.cos(a)*(9+distance),py=y+Math.sin(a)*(10+distance*.5)-(quiet?0:Math.sin(t*Math.PI)*12);
    shard(c,px,py,4+i%3,8+i%4,a+(quiet?0:t)*1.3);
  }
}
