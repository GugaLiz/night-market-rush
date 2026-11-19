/** All positions are local to the real projectile, with its tip at x=0. */
function bambooStick(c:CanvasRenderingContext2D):void {
  c.beginPath();c.moveTo(-40,-3);c.quadraticCurveTo(-43,-3,-42,0);
  c.quadraticCurveTo(-42,3.2,-39,3.3);c.lineTo(-8,1.6);c.quadraticCurveTo(2,1,2,0);
  c.lineTo(-10,-1.5);c.closePath();
  c.fillStyle='#ffce65';c.fill();c.strokeStyle='#79412f';c.lineWidth=1.6;c.stroke();
  c.fillStyle='#bb4535';c.fillRect(-41,-2.4,10,5.2);
  c.fillStyle='#fff0af';c.fillRect(-38,-2.3,2,5.1);
  c.fillStyle='#508874';c.fillRect(-31,-2.4,4.5,4.9);
  c.beginPath();c.moveTo(-25,-1.8);c.quadraticCurveTo(-26,0,-24.5,2);
  c.moveTo(-13,-1);c.quadraticCurveTo(-14,.2,-13,1.6);
  c.strokeStyle='#b67a34';c.lineWidth=1.5;c.stroke();
  c.beginPath();c.moveTo(-24,-1.4);c.lineTo(-5,-.4);c.strokeStyle='#fff3bb';c.lineWidth=1.2;c.stroke();
}

function bambooLeaf(c:CanvasRenderingContext2D):void {
  c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(3,-8,17,-6);c.quadraticCurveTo(11,3,0,0);
  c.fillStyle='#84dfab';c.fill();c.strokeStyle='#287260';c.lineWidth=1.5;c.stroke();
  c.beginPath();c.moveTo(2,0);c.lineTo(13,-5);c.strokeStyle='#e9ffe0';c.lineWidth=1.2;c.stroke();
}

/** A strip of bamboo wrapping unfurls from the lacquered ends, behind the tips. */
export function drawFlyingChopsticks(c:CanvasRenderingContext2D,x:number,y:number,angle:number,distance:number,laneSeed:number,quiet:boolean):void {
  c.save();c.translate(x,y);c.rotate(angle);
  const spread=Math.min(1,distance/85);
  const size=.45+.55*spread;
  c.scale(size,size);
  const length=Math.min(distance*.58,quiet?42:87);
  if(length>5){
    const tail=-32-length,mid=-32-length*.53;
    const crest=quiet?2:Math.sin(distance*.042+laneSeed*1.8)*5;
    // Alternating dark underside and mint face make the folded ribbon legible at phone scale.
    c.beginPath();c.moveTo(-29,-3);c.quadraticCurveTo(-41,-15-crest,mid,-4-crest);
    c.quadraticCurveTo(mid-12,5,tail,-2);c.lineTo(tail+9,3);
    c.quadraticCurveTo(mid-8,15,mid+3,3-crest);c.quadraticCurveTo(-42,-7-crest,-29,1);c.closePath();
    c.fillStyle='#40ac91';c.fill();c.strokeStyle='#286c61';c.lineWidth=1.4;c.stroke();
    c.beginPath();c.moveTo(-31,-4);c.quadraticCurveTo(-43,-14-crest,mid,-3-crest);
    c.strokeStyle='#dcffe1';c.lineWidth=2.3;c.stroke();
    if(!quiet && length>44){
      c.save();c.translate(tail+10,7+crest);c.scale(.72,.72);bambooLeaf(c);c.restore();
    }
  }
  for(const side of [-1,1]){
    c.save();c.translate(0,side*1.6);c.rotate(-side*(.045+spread*.15));
    bambooStick(c);c.restore();
  }
  c.restore();
}

/** The folded collar pops open once at the muzzle, before the five lanes separate. */
export function drawChopstickRelease(c:CanvasRenderingContext2D,t:number,reduced:boolean):void {
  const open=reduced?.7:1-(1-t)**2;
  c.save();c.scale(1+open*.4,.85+open*.53);
  c.lineCap='round';c.lineJoin='round';
  // The sleeve opens from behind the glove into two broad paper folds.
  for(const side of [-1,1]){
    c.save();c.scale(1,side);
    c.beginPath();c.moveTo(0,2);c.quadraticCurveTo(11,0,18,11);
    c.lineTo(28,18+open*6);c.lineTo(17,16);c.lineTo(17,21);c.quadraticCurveTo(5,16,0,2);
    c.fillStyle='#70cda3';c.fill();c.strokeStyle='#346d5e';c.lineWidth=1.6;c.stroke();
    c.beginPath();c.moveTo(3,3);c.quadraticCurveTo(13,7,19,15);c.strokeStyle='#fbefad';c.lineWidth=2.4;c.stroke();
    c.beginPath();c.moveTo(20,15);c.quadraticCurveTo(27,19,34,17);
    c.quadraticCurveTo(27,24,22,21);c.closePath();c.fillStyle='#d7f2c7';c.fill();
    c.restore();
  }
  c.beginPath();c.ellipse(6,0,4,12,0,-1.35,1.35);c.strokeStyle='#fff3b2';c.lineWidth=3.1;c.stroke();
  c.restore();
}

/** Two split bamboo impressions spring apart at a confirmed impact. */
export function drawChopstickImpact(c:CanvasRenderingContext2D,t:number,featured:boolean,quiet:boolean):void {
  const open=quiet?.65:Math.min(1,t*4);
  c.save();c.lineCap='round';
  c.scale(featured?1.15:.92,featured?1.15:.92);
  for(const side of [-1,1]){
    c.save();c.rotate(side*(.52+.25*open));
    // The short cut spreads from the point of contact as the bamboo shafts cross.
    c.beginPath();c.moveTo(-32-6*open,-3);c.quadraticCurveTo(-12,-7,3,-3);
    c.lineTo(21+9*open,-4);c.lineTo(12,1);c.lineTo(23,3);
    c.quadraticCurveTo(1,6,-10,3);c.lineTo(-37,-1);c.closePath();
    c.fillStyle=side>0?'#fff2a9':'#abecc9';c.fill();
    c.translate(17,0);
    bambooStick(c);c.restore();
    if(featured){
      c.save();c.rotate(side*.78);c.translate(11+12*open,side*4);c.scale(1,side);
      bambooLeaf(c);c.restore();
    }
  }
  c.beginPath();c.moveTo(-3,-9);c.lineTo(1,-3);c.lineTo(10,0);c.lineTo(2,3);
  c.lineTo(-2,10);c.lineTo(-4,3);c.lineTo(-11,0);c.lineTo(-4,-3);c.closePath();
  c.fillStyle='#ffdf76';c.fill();c.strokeStyle='#fff7cf';c.lineWidth=1.7;c.stroke();
  c.restore();
}
