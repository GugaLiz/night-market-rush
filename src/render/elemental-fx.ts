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

// The rim and handle keep the lighting of the clay prop. Only its soup turns.
interface WokArt {pan:HTMLCanvasElement; broth:HTMLCanvasElement}
let wokArt:WokArt|undefined;

function prepareWok(assets:Assets):WokArt {
  if(wokArt)return wokArt;
  const sprite=assets.sprites.vortex;
  const pan=document.createElement('canvas');
  pan.width=sprite.width;pan.height=sprite.height;
  const brush=pan.getContext('2d')!;
  brush.drawImage(sprite.image,sprite.x,sprite.y,sprite.width,sprite.height,0,0,pan.width,pan.height);
  // Glaze the purple ridges with warm stock while preserving the sculpted highlights.
  const pixels=brush.getImageData(0,0,pan.width,pan.height), rgba=pixels.data;
  for(let i=0;i<rgba.length;i+=4){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2], tint=unit((Math.min(r,b)-g-5)/35)*.82;
    const light=.44*r+.30*g+.26*b;
    rgba[i]=r+(light*1.08+12-r)*tint;
    rgba[i+1]=g+(light*.63+7-g)*tint;
    rgba[i+2]=b+(light*.47+12-b)*tint;
  }
  brush.putImageData(pixels,0,0);
  // Unproject the bowl to a round texture, feathering its edge into the stationary rim.
  const broth=document.createElement('canvas');broth.width=broth.height=128;
  const soup=broth.getContext('2d')!;
  soup.drawImage(pan,83,26,122,76,0,0,128,128);
  const edge=soup.createRadialGradient(64,64,0,64,64,64);
  edge.addColorStop(0,'#000');edge.addColorStop(.82,'#000');edge.addColorStop(1,'#0000');
  soup.globalCompositeOperation='destination-in';soup.fillStyle=edge;soup.fillRect(0,0,128,128);
  wokArt={pan,broth};
  return wokArt;
}

function placeWok(c:Canvas,age:number,after:number,quiet:boolean):void {
  const open=unit((age-.17)/.25), windup=unit((after+.32)/.32);
  const fade=unit(1-after/ELEMENTAL.vortex.fade);
  const scale=(quiet?.70:.28+.42*(1-(1-open)**2))*(1-.10*windup)*(.80+.20*fade);
  c.globalAlpha*=open*fade;
  c.translate(0,-8-(quiet?0:Math.sin(open*Math.PI)*9));
  c.rotate(quiet?0:-.10*(1-open)+.05*windup);
  c.scale(scale,scale);
}

function wokSteam(c:Canvas,age:number,after:number,quiet:boolean,full:boolean):void {
  const count=full?3:2;
  c.lineCap='round';
  for(let i=0;i<count;i++){
    const lift=quiet?.36+i*.12:(age*.57+i*.37)%1;
    const x=(i-(count-1)/2)*17, y=-18-lift*45;
    const bend=quiet?6:5+3*Math.sin(age*2+i);
    c.save();c.globalAlpha*=Math.sin(Math.PI*lift)*(.72+.25*unit((after+.38)/.38));
    c.beginPath();c.moveTo(x,y+7);c.bezierCurveTo(x-bend,y-1,x+bend,y-6,x+2,y-15);
    c.lineWidth=4.2;c.strokeStyle='#bea9908a';c.stroke();
    c.lineWidth=2.4;c.strokeStyle='#ffead3db';c.stroke();c.restore();
  }
}

function wokBurst(c:Canvas,t:number,settings:Settings):void {
  const quiet=settings.reduceMotion, count=settings.quality==='simple'?8:13;
  const travel=quiet?.85:1-(1-t)**2;
  c.lineCap='round';
  // The sauce rolls off the rim in three broad crescents before breaking into droplets.
  if(t<.68){
    const radius=ELEMENTAL.vortex.blastRadius*(.22+.78*travel);
    c.save();c.globalAlpha*=1-t/.68;
    for(let i=0;i<3;i++){
      const a=i*turn/3+.27;
      c.beginPath();c.arc(0,0,radius,a-.64,a+.60);
      c.strokeStyle='#975631';c.lineWidth=7;c.stroke();
      c.beginPath();c.arc(0,0,radius+2,a-.56,a+.17);
      c.strokeStyle='#ffdcaa';c.lineWidth=3;c.stroke();
    }
    c.restore();
  }
  for(let i=0;i<count;i++){
    const a=i*turn/count+.21, r=ELEMENTAL.vortex.blastRadius*(.24+.76*travel)*(.83+.17*Math.sin(i*3.2)**2);
    const lift=quiet?4:Math.sin(Math.PI*t)*(15+(i%3)*7);
    const x=Math.cos(a)*r,y=Math.sin(a)*r-lift;
    c.beginPath();c.ellipse(x,y,9+5*travel,3+2*travel,a+Math.PI/2,3.28,5.80);
    c.lineWidth=4.3;c.strokeStyle='#fae3baba';c.stroke();
    oval(c,x+Math.cos(a)*6,y+Math.sin(a)*7,4.1,2.3,'#c27c45c9',a);
  }
}

function drawWokField(c:Canvas,field:ElementalField,time:number,settings:Settings,assets:Assets):void {
  const age=time-field.bornAt, after=time-field.releaseAt;
  const quiet=settings.reduceMotion, full=settings.quality==='standard';
  const open=unit((age-.15)/.26), fade=unit(1-after/ELEMENTAL.vortex.fade);
  c.globalAlpha=open*fade;
  oval(c,-4,17,56,13,'#38291f48');
  if(after>=0){
    wokBurst(c,1-fade,settings);
  }else{
    const count=full?12:7;
    const gather=.72+.28*unit(-after/.38);
    for(let i=0;i<count;i++){
      const progress=((quiet?0:age*.49)+.38+i*.618)%1;
      const radius=(25+(1-progress)**1.25*(126+i%3*20))*gather;
      const angle=i*2.4+progress*2.9;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*.80-8;
      c.save();c.translate(x,y);c.rotate(angle+1.16);
      c.globalAlpha*=Math.sin(progress*Math.PI)**.6;
      if(i%3===0){
        c.strokeStyle='#71914c';c.lineWidth=2.7;c.beginPath();c.ellipse(0,0,4.5,2.1,.23,0,turn);c.stroke();
      }else if(i%3===1){
        oval(c,0,0,5.2,2.3,'#ad5039');oval(c,-1,-.8,2.5,.65,'#edac6f');
      }else{
        oval(c,0,0,4.1,1.9,'#f4d89d');
      }
      if(!quiet&&full&&i%2===0){
        c.beginPath();c.moveTo(-5,1);c.quadraticCurveTo(-12,2,-19,7);
        c.strokeStyle='#f8d8a887';c.lineWidth=1.8;c.stroke();
      }
      c.restore();
    }
  }
  c.globalAlpha=1;
  const art=prepareWok(assets);
  placeWok(c,age,after,quiet);
  c.drawImage(art.pan,-144,-64);
  c.save();c.scale(61/64,38/64);
  if(!quiet)c.rotate(age*1.52+.84*unit((after+.38)/.38));
  c.drawImage(art.broth,-64,-64);c.restore();
  wokSteam(c,age,after,quiet,full);
}

// Paint just the near iron wall over monsters that have reached the soup.
export function drawVortexMouth(c:Canvas,field:ElementalField,time:number,quiet:boolean,assets:Assets):void {
  c.save();c.translate(field.x,field.y);
  placeWok(c,time-field.bornAt,time-field.releaseAt,quiet);
  c.beginPath();c.moveTo(-89,-4);
  c.bezierCurveTo(-84,44,56,65,83,-3);
  c.lineTo(83,75);c.lineTo(-89,75);c.closePath();c.clip();
  c.drawImage(prepareWok(assets).pan,-144,-64);c.restore();
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
  // Vented bubbles break the brine's outer edge; keep the middle transparent over the street.
  const edges=full?8:5;
  for(let i=0;i<edges;i++){
    const a=i*turn/edges+.17;
    const t=settings.reduceMotion?.35:(age/ELEMENTAL.poison.interval*.5+i*.381)%1;
    c.globalAlpha=fade*(.65-.36*t);
    c.strokeStyle='#d5e689';c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r*(.94+.045*t),a-.21,a+.14);c.stroke();
    if(full || i%2===0)bubble(c,Math.cos(a)*r*.94,Math.sin(a)*r*.94-8*t,4.2+3*t);
  }
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

export function drawElementalGround(c:Canvas,s:GameState,settings:Settings,assets:Assets):void {
  if(!s.elementalFields)return;
  for(const field of s.elementalFields){
    if(field.kind==='frost'||s.time<field.bornAt||s.time>=field.expiresAt)continue;
    c.save();c.translate(field.x,field.y);
    if(field.kind==='vortex')drawWokField(c,field,s.time,settings,assets);
    else if(field.kind==='poison')brineCloud(c,field,s.time,settings,assets);
    c.restore();
  }
}

export function drawPoisonedEnemy(c:Canvas,e:Enemy,foot:number,height:number,time:number,settings:Settings):void {
  if((e.poisonUntil??0)<=time)return;
  c.save();
  const count=settings.quality==='simple'?1:2;
  const sinceTick=time-((e.poisonNextAt??0)-ELEMENTAL.poison.interval);
  const popping=!settings.reduceMotion && sinceTick>=0 && sinceTick<.16 &&
    Math.abs(time-e.hurtAt-sinceTick)<.02;
  for(let i=0;i<count;i++){
    const t=settings.reduceMotion?.46:(time*.91+e.id*.382+i*.5)%1;
    const side=(i+e.id)%2===0?1:-1;
    const x=e.x+side*height*(.34+t*.12),y=foot-height*(.39+t*.45);
    c.globalAlpha=.45+.55*Math.sin(t*Math.PI);
    if(i===0 && popping){
      const progress=sinceTick/.16, radius=7+8*progress;
      c.globalAlpha*=1-progress;c.strokeStyle='#e6ff9e';c.lineWidth=2.2;c.lineCap='round';
      for(let j=0;j<3;j++){
        const a=j*turn/3+side*.3;
        c.beginPath();c.arc(x,y,radius,a,a+.85);c.stroke();
      }
    }else bubble(c,x,y,3.7+i*1.8);
  }
  c.restore();
}

export function drawBrittleIceRim(c:Canvas,x:number,foot:number,height:number,remaining:number,settings:Settings):void {
  c.save();c.translate(x,foot);c.scale(height,height);
  c.lineJoin='round';c.lineCap='round';
  // Pick out opposite bevels of the existing shell. Its cracked center stays transparent.
  c.beginPath();
  c.moveTo(-.48,-.44);c.lineTo(-.34,-.84);c.lineTo(.04,-1.05);c.lineTo(.16,-.96);
  c.moveTo(.47,-.43);c.lineTo(.50,-.32);c.lineTo(.27,.01);c.lineTo(-.05,0);
  c.lineWidth=Math.min(.085,7/height);c.strokeStyle='#215d7b';c.stroke();
  c.lineWidth=Math.min(.055,4.7/height);c.strokeStyle='#66e5f4';c.stroke();
  c.lineWidth=Math.min(.021,2/height);c.strokeStyle='#f3fffe';c.stroke();

  // The two chipped edges give the breakable ice a distinct silhouette even at phone scale.
  const sheen=settings.reduceMotion?.65:.5+.5*Math.cos(remaining*turn/1.55);
  for(const side of [-1,1]){
    c.save();c.scale(side,1);c.translate(.46,side===1?-.35:-.51);
    c.beginPath();c.moveTo(-.045,.115);c.lineTo(.016,-.084);
    c.lineTo(.151,-.199);c.lineTo(.147,-.057);c.lineTo(.055,.077);c.closePath();
    c.fillStyle='#4db7d2';c.strokeStyle='#255d79';c.lineWidth=Math.min(.042,3/height);
    c.fill();c.stroke();
    c.beginPath();c.moveTo(-.045,.115);c.lineTo(.074,-.064);c.lineTo(.151,-.199);
    c.lineTo(.016,-.084);c.closePath();c.fillStyle='#d5ffff';c.fill();
    if(settings.quality==='standard'){
      c.globalAlpha*=.6+.4*sheen;
      c.strokeStyle='#fffef0';c.lineWidth=Math.min(.030,2.5/height);c.beginPath();
      c.moveTo(.016,-.084);c.lineTo(.095+.044*sheen,-.15-.035*sheen);c.stroke();
    }
    c.restore();
  }
  c.restore();
}

export function drawIceFragments(c:Canvas,x:number,y:number,t:number,seed:number,settings:Settings):void {
  const quiet=settings.reduceMotion, count=settings.quality==='simple'?3:5;
  const distance=quiet?10:35*(1-(1-t)**2);
  for(let i=0;i<count;i++){
    const a=(i+.24)*turn/count+seed*.81;
    const px=x+Math.cos(a)*(9+distance),py=y+Math.sin(a)*(10+distance*.5)-(quiet?0:Math.sin(t*Math.PI)*12);
    shard(c,px,py,6+i%3*2,10+i%4*2,a+(quiet?0:t)*1.3);
  }
}
