import type {Settings} from '../shared/types';

type Canvas = CanvasRenderingContext2D;
const turn = 2 * Math.PI;

export function drawIceShardLane(c:Canvas,x:number,y:number,angle:number,reach:number,progress:number,settings:Settings):void {
  const quiet=settings.reduceMotion;
  const advance=quiet?.80:1-(1-progress)**3;
  c.save();c.translate(x,y-21);c.rotate(angle);
  c.lineJoin='round';
  // Long splinters follow the actual lane. The fragments at the far end point forward.
  const shards=settings.quality==='simple'?3:5;
  for(let i=0;i<shards;i++){
    const spread=(i-(shards-1)/2)*3.8;
    const tip=reach*(.72+.28*(1-Math.abs(i-(shards-1)/2)/shards))*advance;
    const tail=Math.max(0,tip-reach*(.32+.075*(i%3)));
    const side=spread*(.5+.5*advance);
    c.beginPath();c.moveTo(tail,side*.65);c.lineTo(tip-12,side-3.2);
    c.lineTo(tip+3,side);c.lineTo(tip-17,side+2.7);c.closePath();
    c.strokeStyle='#3c8095';c.lineWidth=2.5;c.stroke();
    c.fillStyle=i%2===0?'#c9f9ff':'#85ddec';c.fill();
    c.strokeStyle='#fffdf2';c.lineWidth=1.6;
    c.beginPath();c.moveTo(tail+1,side*.65);c.lineTo(tip-2,side);c.stroke();
  }
  c.restore();
}

export function drawSplitShell(c:Canvas,x:number,y:number,progress:number,quiet:boolean):void {
  const spread=quiet?13:5+21*(1-(1-progress)**2);
  c.save();c.translate(x,y-22);c.lineJoin='round';
  for(const side of [-1,1]){
    c.save();c.translate(side*spread,quiet?0:progress*8);
    c.rotate(side*(quiet?.12:.10+progress*.62));c.scale(side,1);
    c.beginPath();c.moveTo(0,-18);c.lineTo(10,-14);c.lineTo(17,-1);
    c.lineTo(11,11);c.lineTo(-2,15);c.lineTo(3,4);c.lineTo(-2,1);
    c.lineTo(4,-8);c.lineTo(0,-11);c.closePath();
    c.fillStyle='#9edff1a8';c.fill();c.strokeStyle='#fcffff';c.lineWidth=2.3;c.stroke();
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
