import {CONFIG} from '../core/config';
import type {Pickup,Player,Vec,Zone} from '../shared/types';

const tau=Math.PI*2;
const unit=(n:number)=>Math.max(0,Math.min(1,n));

/** Printed accordion folds roll out over the route's actual floor rectangle. */
export function drawPaperRoute(c:CanvasRenderingContext2D,z:Zone,age:number,reduced:boolean,occupied:boolean):void {
  if(z.length<1)return;
  c.save();c.translate(z.x,z.y);c.rotate(z.angle);
  const half=z.width/2,unfold=reduced?1:1-(1-unit(age/.36))**3,edge=z.length*unfold;
  c.strokeStyle='#fff0bb80';c.lineWidth=1.5;c.setLineDash([6,10]);c.strokeRect(0,-half,z.length,z.width);c.setLineDash([]);
  c.beginPath();c.rect(0,-half,edge,z.width);c.clip();
  c.fillStyle='#f3d39b94';c.fillRect(0,-half,z.length,z.width);
  for(let x=0,i=0;x<edge;x+=70,i++){
    c.fillStyle=i%2?'#fff0c842':'#a98a5242';c.fillRect(x,-half,70,z.width);
    c.strokeStyle='#71574388';c.lineWidth=1.4;c.beginPath();c.moveTo(x,-half);c.lineTo(x,half);c.stroke();
    const corner=15+(i%3)*10,offset=i%2===0?4:-6;
    c.fillStyle=i%2===0?'#83a98e6e':'#be87685c';
    c.fillRect(x+6,half*.42+offset,14+i%3*5,11);
    c.fillRect(x+56,-half+6,10,8+i%3*4);
    c.strokeStyle='#fff3cdab';c.lineWidth=2.5;c.beginPath();
    c.moveTo(x+corner,-half);c.lineTo(x+corner+3,-half*.46+offset);
    c.lineTo(x+70,-half*.46);c.moveTo(x+70,half*.38);
    c.lineTo(x+corner+8,half*.38+offset);c.lineTo(x+corner+10,half);c.stroke();
  }
  c.fillStyle=occupied?'#68f0c7':'#786446a1';
  for(const y of [-half+2,half-5])c.fillRect(0,y,edge,occupied?4:2);
  c.strokeStyle=occupied?'#205d56':'#3a8176';c.lineWidth=3;c.lineCap='round';c.setLineDash([6,6]);
  const routeY=(x:number)=>Math.sin(x/48)*6;
  c.beginPath();c.moveTo(3,0);
  for(let x=12;x<z.length-18;x+=12)c.lineTo(x,routeY(x));
  c.lineTo(Math.max(3,z.length-18),0);c.stroke();c.setLineDash([]);
  c.strokeStyle=occupied?'#fffce1':'#fff1c6';c.fillStyle=occupied?'#136357':'#387f72';c.lineWidth=2;
  const advance=reduced?0:(age*(occupied?80:32))%63;
  for(let x=-35+advance;x<edge-18;x+=63){
    if(x<5)continue;
    const y=routeY(x);c.beginPath();c.moveTo(x-8,y-7);c.lineTo(x+5,y);c.lineTo(x-8,y+7);c.lineTo(x-4,y);c.closePath();c.fill();c.stroke();
  }
  if(z.length>=30 && edge>=z.length-18){
    // The printed pin faces the viewer when the paper is laid in any direction.
    c.save();c.translate(z.length-14,0);c.rotate(-z.angle);c.fillStyle='#ec7737';c.strokeStyle='#724a37';
    c.beginPath();c.moveTo(0,5);c.bezierCurveTo(-3,1,-10,-5,-10,-11);
    c.bezierCurveTo(-10,-24,10,-24,10,-11);c.bezierCurveTo(10,-5,3,1,0,5);c.fill();c.stroke();
    c.fillStyle='#fff1ce';c.beginPath();c.arc(0,-11,4,0,tau);c.fill();c.restore();
  }
  if(unfold<1){c.fillStyle='#ffedc0b0';c.fillRect(Math.max(0,edge-5),-half,5,z.width);}
  c.restore();

  if(edge>=100){
    // Keep the little road sign upright even when the map crosses the screen diagonally.
    const along=Math.min(z.length*.42,142),across=half-19;
    const cos=Math.cos(z.angle),sin=Math.sin(z.angle);
    c.save();
    c.translate(z.x+along*cos-across*sin,z.y+along*sin+across*cos);
    c.font='bold 15px "Microsoft YaHei", sans-serif';c.textAlign='center';c.textBaseline='middle';
    const label=occupied?'加速中':'上路加速',width=c.measureText(label).width+15;
    c.fillStyle=occupied?'#235e51':'#493f32';c.strokeStyle=occupied?'#a8f6d3':'#efdbb3';c.lineWidth=1.5;
    c.beginPath();c.roundRect(-width/2,-11,width,22,5);c.fill();c.stroke();
    c.fillStyle='#fff4d9';c.fillText(label,0,1);c.restore();
  }
}

/** Brief shoe-level slipstreams follow the actual travel direction on the paper. */
export function drawRouteStride(c:CanvasRenderingContext2D,p:Player,time:number,reduced:boolean):void {
  const speed=Math.hypot(p.vx,p.vy);
  if(speed<55 || reduced)return;
  const flow=Math.min(1,speed/380);
  c.save();c.translate(p.x,p.y-2);c.rotate(Math.atan2(p.vy,p.vx));c.lineCap='round';
  for(const side of [-1,1]){
    const phase=(time*2.4+(side+1)*.24)%1;
    const head=-11-phase*13,length=(13+phase*14)*flow;
    c.beginPath();c.moveTo(head,side*9);c.quadraticCurveTo(head-length*.48,side*13,head-length,side*11);
    c.strokeStyle='#307b6a';c.lineWidth=4;c.stroke();
    c.strokeStyle='#beffe0';c.lineWidth=1.8;c.stroke();
  }
  c.restore();
}

function drawHookLine(c:CanvasRenderingContext2D, bag:Vec, tip:Vec, opening:number, time:number, reduced:boolean):void {
  const dx=tip.x-bag.x,dy=tip.y-bag.y;
  const bend=Math.min(16,Math.hypot(dx,dy)*.055);
  c.beginPath();
  c.moveTo(bag.x,bag.y);
  c.quadraticCurveTo((bag.x+tip.x)/2,(bag.y+tip.y)/2+bend,tip.x,tip.y);
  c.lineWidth=4.5;c.strokeStyle='#29464c';c.stroke();
  c.lineWidth=2.2;c.strokeStyle='#8dd0c5';c.stroke();
  c.setLineDash([4,10]);c.lineDashOffset=reduced?0:time*73;
  c.strokeStyle='#ffce76';c.stroke();c.setLineDash([]);

  c.save();c.translate(tip.x,tip.y);c.rotate(Math.atan2(dy-bend*2,dx));
  const gap=3+6*opening;
  c.lineJoin='round';
  c.beginPath();
  for(const side of [-1,1]){
    c.moveTo(-5,0);c.lineTo(0,side*6);c.lineTo(7,side*(gap+2));c.lineTo(11,side*gap);
  }
  c.strokeStyle='#32414a';c.lineWidth=6;c.stroke();
  c.strokeStyle='#ffd387';c.lineWidth=3.3;c.stroke();
  c.fillStyle='#477878';c.fillRect(-8,-3,6,6);c.restore();
}

/** The reel stays on the satchel while each jaw flies out, closes on a bubble and draws it in. */
export function drawRetrievalHook(
  c:CanvasRenderingContext2D, bag:Vec, p:Player, pickups:Pickup[], until:number, time:number, reduced:boolean,
):void {
  const latched=pickups.filter(item=>(item.pulledUntil??0)>time);
  if(!latched.length && !(until>time))return;
  c.save();c.lineCap='round';
  for(const item of latched){
    const latchAge=time-(item.pulledUntil!-CONFIG.skills.hook.reelTimeout);
    const progress=reduced?1:unit(latchAge/CONFIG.skills.hook.launchTime);
    const dx=item.x-bag.x,dy=item.y-39-bag.y;
    const travel=progress*Math.max(0,1-34/(Math.hypot(dx,dy)||1));
    drawHookLine(c,bag,{x:bag.x+dx*travel,y:bag.y+dy*travel},1-progress,time,reduced);
  }
  if(!latched.length){
    // With no target, the spring-loaded jaw opens beside the bag and retracts to scan again.
    const age=time-until+CONFIG.skills.hook.duration;
    const sweep=reduced?.28:Math.sin(Math.PI*Math.min(1,(Math.max(0,age)%.95)/.72))**2;
    const tip={x:bag.x-p.facing*(17+33*sweep),y:bag.y+11-10*sweep};
    drawHookLine(c,bag,tip,sweep,time,reduced);
  }
  c.translate(bag.x,bag.y);
  c.fillStyle='#416c70';c.strokeStyle='#233d43';c.lineWidth=2;
  c.beginPath();c.arc(0,0,6,0,tau);c.fill();c.stroke();
  c.fillStyle='#ffcf80';c.beginPath();c.arc(0,0,3.6,0,tau);c.fill();c.restore();
}

/** A vermilion bow wave folds back into small order slips as the courier gains speed. */
export function drawStampWave(
  c: CanvasRenderingContext2D, p: Player, time: number, reduced: boolean, simple: boolean,
): void {
  const speed = Math.hypot(p.vx, p.vy);
  const heading = speed > 5 ? Math.atan2(p.vy, p.vx) : Math.atan2(p.moveDirection.y, p.moveDirection.x);
  const drive = unit(speed / CONFIG.player.speed);
  const dash = (p.dashUntil ?? 0) > time ? 1 : 0;
  // The helmet and shoes extend farther from the body's centre than the shoulders.
  const nose = 46 + 22 * Math.abs(Math.sin(heading)) + 20 * drive + 9 * dash;
  const wing = 32 + 8 * Math.abs(Math.cos(heading)) + 13 * drive + 4 * dash;
  const tail = 12 - 18 * drive - 13 * dash;
  const opening = unit((time - p.stampUntil + CONFIG.skills.stamp.duration) / .17);
  const fade = unit((p.stampUntil - time) / .26);
  c.save();
  c.translate(p.x, p.y - 43);
  c.rotate(heading);
  const unfold = reduced ? 1 : .78 + .22 * (1 - (1 - opening) ** 2);
  c.scale(unfold, unfold);
  c.globalAlpha *= (.74 + .26 * drive) * (.5 + .5 * fade);

  // Two tapered paper edges meet at a rounded pressure front. Keep the centre transparent.
  c.beginPath();
  c.moveTo(tail, -wing);
  c.bezierCurveTo(nose * .48, -wing, nose, -wing * .54, nose, 0);
  c.bezierCurveTo(nose, wing * .54, nose * .48, wing, tail, wing);
  c.bezierCurveTo(nose * .47, wing * .84, nose - 10 - 3 * drive, wing * .29, nose - 10 - 3 * drive, 0);
  c.bezierCurveTo(nose - 10 - 3 * drive, -wing * .29, nose * .47, -wing * .84, tail, -wing);
  c.closePath();
  const ink = c.createLinearGradient(tail, 0, nose, 0);
  ink.addColorStop(0, '#b53c2844');
  ink.addColorStop(.74, '#d75734e8');
  ink.addColorStop(1, '#ffb66c');
  c.fillStyle = ink;
  c.fill();
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(tail, -wing);
  c.bezierCurveTo(nose * .48, -wing, nose, -wing * .54, nose, 0);
  c.bezierCurveTo(nose, wing * .54, nose * .48, wing, tail, wing);
  c.strokeStyle = '#994627';
  c.lineWidth = 4;
  c.stroke();
  c.strokeStyle = '#fff0bc';
  c.lineWidth = 2;
  c.stroke();

  if (!reduced && drive > .08) {
    // A second compression front peels off the first and dissipates into the street.
    const phase = (time * 1.85) % 1;
    const offset = 4 + phase * (16 + dash * 9);
    c.save();
    c.globalAlpha *= drive * Math.sin(phase * Math.PI);
    c.beginPath();
    c.moveTo(nose * .62 + offset, -wing * .86);
    c.quadraticCurveTo(nose * 1.36 + offset, 0, nose * .62 + offset, wing * .86);
    c.strokeStyle = '#cb673c';
    c.lineWidth = 3.3;
    c.stroke();
    c.strokeStyle = '#fff1ba';
    c.lineWidth = 1.7;
    c.stroke();
    c.restore();
  }
  if (!simple && !reduced && drive > .08) {
    const beat = time * 1.85;
    for (const side of [-1, 1]) {
      const phase = (beat + (side === 1 ? .5 : 0)) % 1;
      c.save();
      c.globalAlpha *= Math.sin(phase * Math.PI) * drive;
      c.translate(tail + 18 - phase * (37 + 12 * dash), side * (wing - 4 + phase * 7));
      c.rotate(side * (.15 - phase * .46));
      c.fillStyle = '#fff1bd';
      c.fillRect(-8, -3, 16, 6);
      c.fillStyle = '#bd4b34';
      c.fillRect(-5, -1, 7, 2);
      c.fillRect(4, -2, 3, 3);
      c.restore();
    }
  }
  c.restore();
}

/** Clear packing film, closed seams and air pockets at the edges leave the face visible. */
export function drawPackingWrap(c:CanvasRenderingContext2D,x:number,y:number,age:number,reduced:boolean):void {
  const wrap=reduced?1:1-(1-unit(age/.23))**2;
  c.save();c.translate(x,y-39);c.scale(.90+.10*wrap,.76+.24*wrap);
  c.fillStyle='#d0edde14';c.strokeStyle='#bce2dcbf';c.lineWidth=2;
  c.beginPath();c.moveTo(-18,-63);c.quadraticCurveTo(-39,-63,-38,-44);
  c.lineTo(-34,23);c.quadraticCurveTo(-34,36,-19,38);
  c.quadraticCurveTo(3,43,26,36);c.quadraticCurveTo(36,33,36,20);c.lineTo(39,-42);
  c.quadraticCurveTo(40,-60,25,-62);c.quadraticCurveTo(3,-66,-18,-63);c.closePath();c.fill();c.stroke();
  for(const side of [-1,1]){
    for(let row=0;row<5;row++){
      const bx=side*(29+(row%2)*3),by=-45+row*16;
      c.fillStyle='#ddf7e936';c.strokeStyle='#b7dfd3a1';c.lineWidth=1.2;
      c.beginPath();c.ellipse(bx,by,4.2,6.1,side*.12,0,tau);c.fill();c.stroke();
      c.strokeStyle='#fff9e9dd';c.lineWidth=1.7;c.beginPath();c.arc(bx+.4,by,3.2,3.65,4.95);c.stroke();
    }
    c.beginPath();c.moveTo(side*21,-59);c.lineTo(side*31,-58);c.lineTo(side*35,-47);
    c.strokeStyle='#fff3d6b0';c.lineWidth=1.6;c.stroke();
  }
  c.strokeStyle='#ffcf8ecc';c.lineWidth=2.6;c.setLineDash([3,3]);c.beginPath();
  c.moveTo(-23,31);c.quadraticCurveTo(0,36,24,30);c.stroke();c.setLineDash([]);
  c.strokeStyle='#e2f1dd77';c.lineWidth=1.2;c.beginPath();c.moveTo(-33,17);c.quadraticCurveTo(-3,20,35,10);c.stroke();
  c.fillStyle='#eaa453bb';c.fillRect(21,10,13,4);c.restore();
}
