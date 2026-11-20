import type {Settings} from '../shared/types';

type Canvas = CanvasRenderingContext2D;
const turn = 2 * Math.PI;
const iceLanePieces = [
  {position:.63, offset:7, length:28, radius:4},
  {position:.80, offset:-7, length:28, radius:4},
  {position:1, offset:0, length:41, radius:5.6},
  {position:.40, offset:-6, length:15, radius:2.9},
  {position:.52, offset:5, length:15, radius:2.9},
];

// A bevel catches the light even when several pieces overlap a pale enemy.
function iceSliver(c:Canvas,length:number,radius:number):void {
  const shoulder=length*.31;
  c.beginPath();c.moveTo(0,0);c.lineTo(-length*.62,-radius);
  c.lineTo(-length,-radius*.35);c.lineTo(-length*.84,radius*.85);
  c.lineTo(-shoulder,radius*.54);c.closePath();
  c.fillStyle='#70d3e9';c.fill();
  c.strokeStyle='#245773';c.lineWidth=2.2;c.stroke();
  c.beginPath();c.moveTo(-length*.91,-radius*.36);c.lineTo(-length*.62,-radius*.84);
  c.lineTo(-2,0);c.lineTo(-length*.64,radius*.14);c.closePath();
  c.fillStyle='#eefffc';c.fill();
}

export function drawIceShardLane(c:Canvas,x:number,y:number,angle:number,reach:number,progress:number,settings:Settings):void {
  const advance=settings.reduceMotion?1:1-(1-Math.min(progress/.38,1))**3;
  const tip=reach*(.27+.73*advance);
  c.save();c.translate(x,y-21);c.rotate(angle);c.lineJoin='round';c.lineCap='round';

  // Ice filings trail all the way back to the broken shell. The lane is 24 units wide.
  const tail=settings.reduceMotion?4:Math.max(0,progress-.46)*reach*.66;
  c.beginPath();c.moveTo(tail,-1);c.quadraticCurveTo(tip*.48,-12,tip*.76,-8);
  c.lineTo(tip,-1);c.lineTo(tip*.69,7);c.quadraticCurveTo(tip*.48,10,tail,2);
  c.closePath();c.fillStyle='#51bbd9a8';c.fill();
  c.beginPath();c.moveTo(tail,2);c.quadraticCurveTo(tip*.6,7,tip-3,0);
  c.strokeStyle='#ddfff5';c.lineWidth=2.8;c.stroke();

  // Stagger the tips along the lane so that each chipped edge remains readable.
  const count=settings.quality==='simple'?3:iceLanePieces.length;
  for(let i=0;i<count;i++){
    const piece=iceLanePieces[i],nose=tip*piece.position;
    c.save();c.translate(nose,piece.offset*advance);
    c.rotate(piece.offset*.009);
    iceSliver(c,Math.min(piece.length,nose),piece.radius);
    c.restore();
  }
  c.restore();
}

export function drawSplitShell(c:Canvas,x:number,y:number,progress:number,quiet:boolean,simple=false,height=55,angle=0):void {
  const t=quiet?.62:progress, opening=1-(1-Math.min(t/.86,1))**2;
  const scale=Math.min(1.32,height/58);
  const dx=Math.cos(angle),dy=Math.sin(angle);
  // Give the right half the nearest side of the lane, even when the rider reverses.
  const flip=dy>0?-1:1, nx=-dy*flip, ny=dx*flip;
  const variation=Math.sin(x*.071+y*.123);
  const bodyMid=height*.49;
  const falling=t*t*8-Math.sin(t*Math.PI)*5;
  c.save();c.translate(x,y-bodyMid+(bodyMid-21)*opening*.85+falling);
  c.lineJoin='round';c.lineCap='round';
  for(const side of [-1,1]){
    const hand=side*height*.19*(1-opening*.69);
    const scatter=side*(27+scale*12+variation*side*5)*opening;
    const carry=(4+variation*8*side)*opening;
    c.save();c.translate(hand+nx*scatter+dx*carry,ny*scatter+dy*carry);
    c.rotate(side*(.14+opening*(.65+.42*variation*side)));
    c.scale(side*scale*(.88+variation*side*.10),scale*(.9-variation*side*.12));
    c.beginPath();c.moveTo(-2,-21);c.lineTo(11,-17);c.lineTo(19,-4);
    c.lineTo(16,8);c.lineTo(7,17);c.lineTo(-6,14);c.lineTo(2,5);
    c.lineTo(-4,1);c.lineTo(3,-7);c.lineTo(-3,-11);c.closePath();
    c.fillStyle='#a2e8f3a8';c.fill();c.strokeStyle='#376b80df';c.lineWidth=2.4;c.stroke();
    c.beginPath();c.moveTo(10,-14);c.lineTo(17,-4);c.lineTo(14,8);
    c.lineTo(7,14);c.lineTo(5,7);c.closePath();c.fillStyle='#4593bba8';c.fill();
    c.beginPath();c.moveTo(-1,-18);c.lineTo(8,-15);c.lineTo(4,-6);c.closePath();
    c.fillStyle='#effffce8';c.fill();
    c.beginPath();c.moveTo(9,-15);c.lineTo(17,-4);c.lineTo(15,4);
    c.strokeStyle='#d4fff7';c.lineWidth=1.4;c.stroke();
    c.beginPath();c.moveTo(-1,-10);c.lineTo(4,-7);c.lineTo(-2,1);c.lineTo(4,5);c.lineTo(-3,13);
    c.strokeStyle='#f1ffff';c.lineWidth=2.7;c.stroke();
    c.restore();
  }

  const chips=simple||quiet?2:4;
  for(let i=0;i<chips;i++){
    const side=i%2===0?-1:1, leading=i<2;
    const scatter=side*(14+opening*((leading?40:22)+variation*5));
    const carry=(leading?12:-15)*(1+opening*.7);
    c.save();c.translate(nx*scatter+dx*carry,ny*scatter+dy*carry);
    c.rotate(angle+side*(.7+opening*(1+variation*.44)));
    iceSliver(c,leading?12:8,leading?3.7:2.8);
    c.restore();
  }
  c.restore();
}

function juiceDrop(c:Canvas,x:number,y:number,size:number):void {
  c.save();c.translate(x,y);c.scale(size,size);
  c.beginPath();c.moveTo(.10,-.93);c.bezierCurveTo(-.13,-.64,-.79,-.20,-.72,.35);
  c.bezierCurveTo(-.65,1.03,.59,1.10,.69,.38);c.bezierCurveTo(.75,-.09,.33,-.63,.10,-.93);
  c.closePath();c.fillStyle='#72ce98';c.fill();c.strokeStyle='#195e57';c.lineWidth=.22;c.stroke();
  c.beginPath();c.ellipse(-.21,.21,.17,.33,.51,0,turn);c.fillStyle='#e6ffcd';c.fill();c.restore();
}

export function drawTrayBrine(c:Canvas,x:number,y:number,angle:number,travelled:number,settings:Settings):void {
  c.save();c.translate(x,y);
  // A thick, scalloped rim and two attached drips stay visible as the tray reverses.
  c.beginPath();c.moveTo(-17,1);c.quadraticCurveTo(-9,7,-5,4);
  c.quadraticCurveTo(-1,9,4,5);c.quadraticCurveTo(10,7,17,0);
  c.lineCap='round';c.lineJoin='round';c.strokeStyle='#216a61';c.lineWidth=5.8;c.stroke();
  c.strokeStyle='#abedab';c.lineWidth=3.4;c.stroke();
  juiceDrop(c,-8,8,4.6);juiceDrop(c,7,6,3.4);
  if(!settings.reduceMotion){
    c.rotate(angle);const count=settings.quality==='simple'?1:3;
    for(let i=0;i<count;i++){
      const age=(travelled*.018+i*.37)%1;
      c.save();c.globalAlpha*=1-age*.8;
      juiceDrop(c,-19-age*25,(i%2===0?1:-1)*(3+age*5),3.6-age*1.7);
      c.restore();
    }
  }
  c.restore();
}

export function drawBoxPatch(c:Canvas,x:number,y:number,facing:number,upgrade:'brine'|'frost'):void {
  c.save();c.translate(x,y);c.rotate(-.12*facing);
  c.fillStyle='#fff2c9';c.strokeStyle='#634531';c.lineWidth=1.6;
  c.beginPath();c.roundRect(-8,-7,16,14,3);c.fill();c.stroke();
  if(upgrade==='frost'){
    c.strokeStyle='#30748d';c.lineCap='round';c.lineWidth=1.9;
    for(let i=0;i<3;i++){
      c.beginPath();c.moveTo(0,-5);c.lineTo(0,5);c.stroke();c.rotate(Math.PI/3);
    }
  }else juiceDrop(c,0,.2,5.4);
  c.restore();
}
