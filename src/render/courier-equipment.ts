import type {Player,Zone} from '../shared/types';

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
