import {clamp} from '../core/geometry';
import type {GameState, MarketStall, MarketStallKind, Settings} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';

type Canvas = CanvasRenderingContext2D;
type SignState = 'open'|'signed'|'rolled';
type Placard = {coins:boolean; heal?:number; locked?:boolean; reenter?:boolean; state:SignState; age:number; remaining?:number|null};
const turn = 2*Math.PI;
const font = '"Microsoft YaHei","PingFang SC",sans-serif';
const stallStyles = {
  soup:   {ink:'#8b3e32', trim:'#c8543a', cloth:'', label:'回血', sprite:'health'},
  vortex: {ink:'#57374c', trim:'#90527a', cloth:'hue-rotate(297deg) saturate(.73)', label:'涡锅', sprite:'vortex'},
  frost:  {ink:'#23546a', trim:'#508899', cloth:'hue-rotate(158deg) saturate(.68)', label:'冲刺碎冰', sprite:'frost'},
  brine:  {ink:'#365647', trim:'#548568', cloth:'hue-rotate(73deg) saturate(.69)', label:'餐盘带毒', sprite:'poison'},
  final:  {ink:'#733f28', trim:'#ab6935', cloth:'hue-rotate(345deg)', label:'进圈交餐', sprite:'meal'},
} as const;
const awnings=new WeakMap<HTMLImageElement,Map<MarketStallKind,HTMLCanvasElement>>();
const bodyWidth=163,bodyHeight=106,baseY=-31;

// Re-dye just the raised cloth stripes once per stall. Frames, bell, lantern and counter
// retain their material and lighting on every stall, including the one guarding the tail order.
function stallArt(assets:Assets,kind:MarketStallKind):CanvasImageSource {
  const source=assets.sprites.orderStall.image;
  const dye=stallStyles[kind].cloth;
  if(!dye)return source;
  let family=awnings.get(source);
  if(!family){family=new Map();awnings.set(source,family);}
  const existing=family.get(kind);
  if(existing)return existing;
  const img=document.createElement('canvas');img.width=source.naturalWidth;img.height=source.naturalHeight;
  const c=img.getContext('2d')!;
  c.drawImage(source,0,0);
  c.save();c.scale(img.width,img.height);c.beginPath();
  c.moveTo(.096,.061);c.lineTo(.88,.037);c.lineTo(.862,.226);c.lineTo(.818,.266);
  c.lineTo(.80,.38);c.lineTo(.174,.391);c.lineTo(.094,.340);c.lineTo(.019,.288);
  c.lineTo(.018,.222);c.closePath();c.clip();
  c.filter=dye;c.drawImage(source,0,0,1,1);c.restore();family.set(kind,img);return img;
}

function signFloor(c:Canvas,stall:MarketStall,locked:boolean):void {
  const radius=stall.radius;
  c.save();c.translate(stall.x,stall.y);
  c.fillStyle=locked?'#3b373a50':'#f9d99b24';
  c.strokeStyle='#4c4144';c.lineWidth=5.2;c.beginPath();c.arc(0,0,radius,0,turn);c.fill();c.stroke();
  c.strokeStyle=locked?'#c5b9a7':'#ffe7b2';c.lineWidth=2.7;c.stroke();
  c.strokeStyle=locked?'#c2b8a4ad':'#f4d598dc';c.lineWidth=1.2;c.setLineDash([3.4,3.8]);
  c.beginPath();c.arc(0,0,radius-4,0,turn);c.stroke();c.setLineDash([]);
  c.lineJoin='round';c.lineCap='round';
  if(locked){
    // An actual padlock has a different silhouette from a ready delivery slip.
    c.strokeStyle='#f0d9b4';c.lineWidth=2.8;
    c.beginPath();c.arc(0,-2.8,4.2,Math.PI,0);c.lineTo(4.2,1);c.stroke();
    c.fillStyle='#ecd5b1';c.beginPath();c.roundRect(-7,-1,14,10,2);c.fill();
    c.fillStyle='#594a49';c.fillRect(-1.1,2,2.2,4);
  }else{
    c.rotate(-.12);c.fillStyle='#ffe6b5e6';c.strokeStyle='#685344';c.lineWidth=1.7;
    c.beginPath();c.moveTo(-8,-10);c.lineTo(5,-10);c.lineTo(9,-6);c.lineTo(9,10);
    c.lineTo(6,8.5);c.lineTo(3,10);c.lineTo(0,8.5);c.lineTo(-3,10);c.lineTo(-8,8.5);c.closePath();c.fill();c.stroke();
    c.strokeStyle='#576c55';c.lineWidth=2.4;c.beginPath();c.moveTo(-4,0);c.lineTo(-1,3);c.lineTo(5,-3);c.stroke();
  }
  c.restore();
}

function drawRewardCoins(c:Canvas,x:number,y:number):void {
  c.save();c.translate(x,y);c.rotate(-.14);
  for(const offset of [-5,4]){
    c.fillStyle='#bc791e';c.strokeStyle='#955522';c.lineWidth=1.5;
    c.beginPath();c.ellipse(offset,1,8,8.8,0,0,turn);c.fill();c.stroke();
    c.fillStyle='#ffd66a';c.beginPath();c.ellipse(offset-.9,-.5,7,7.6,0,0,turn);c.fill();
    c.strokeStyle='#fff1a1';c.lineWidth=1.4;c.beginPath();c.arc(offset-.9,-.5,5.7,3.4,5.6);c.stroke();
    c.fillStyle='#aa7837';c.fillRect(offset-2.6,-2.5,3.8,4);
  }
  c.restore();
}

function paperSign(c:Canvas,assets:Assets,stall:MarketStall,sign:Placard,reduced:boolean,warningClip:Path2D):void {
  const {coins,locked,reenter,state,age,remaining}=sign;
  const style=stallStyles[stall.kind];
  let label:string=style.label;
  if(stall.kind==='soup')label=coins?'金币 +5':sign.heal==null?'回血':'回血 +'+sign.heal;
  if(stall.kind==='final')label=locked?'巨包守摊':reenter?'出圈再进':style.label;
  const picture=locked?'giantBun':style.sprite;
  const width=label.length<=2?100:143, height=35;
  const retract=state==='rolled'?(reduced?1:clamp(age/.48,0,1)):0;
  c.save();c.translate(-2,baseY-bodyHeight*.63);
  c.strokeStyle='#634634';c.lineWidth=2.3;c.lineCap='round';
  for(const side of [-1,1]){
    const x=side*(width*.32);
    c.beginPath();c.moveTo(x-2,-6);c.lineTo(x,4);c.stroke();
    c.strokeStyle='#e5cc97';c.lineWidth=1.1;c.beginPath();c.moveTo(x-1,-6);c.lineTo(x+1,4);c.stroke();
    c.strokeStyle='#634634';c.lineWidth=2.3;
  }
  if(!reduced&&state==='open'&&age<.34)c.rotate(Math.sin(age/.34*turn)*.045*(1-age/.34));
  c.rotate(-.016);
  const visibleHeight=height*(1-retract);
  if(visibleHeight>.6){
    c.save();c.beginPath();c.rect(-width/2-2,0,width+4,visibleHeight+2);c.clip();
    c.fillStyle='#4e382c88';c.beginPath();c.roundRect(-width/2+1,2,width,height,4);c.fill();
    const paper=c.createLinearGradient(0,0,8,height);
    paper.addColorStop(0,'#fff7df');paper.addColorStop(.74,'#ffecc7');paper.addColorStop(1,'#ebcc99');
    c.fillStyle=paper;c.strokeStyle='#795438';c.lineWidth=1.8;
    c.beginPath();c.roundRect(-width/2,0,width,height-1,[3,3,5,3]);c.fill();c.stroke();
    c.fillStyle=style.trim;c.fillRect(-width/2+3,3,3.3,height-7);
    const iconX=-width/2+23;
    if(stall.kind==='soup'&&coins)drawRewardCoins(c,iconX,height*.50);
    else{
      const sprite=assets.sprites[picture],h=Math.min(29,37*sprite.height/sprite.width);
      drawSprite(c,assets,picture,iconX,height*.49,h,0,1,.5);
    }
    c.fillStyle=style.ink;c.font='900 23px '+font;c.textBaseline='middle';c.textAlign='center';
    c.fillText(label,19,height*.53,width-46);
    if(remaining!=null){
      c.fillStyle='#b29d742e';c.fillRect(-width/2+8,height-3,width-16,1.7);
      c.fillStyle=style.trim;c.fillRect(-width/2+8,height-3,(width-16)*remaining,1.7);
    }
    c.restore();
  }
  if(state==='rolled'&&retract>0){
    c.fillStyle='#d6b687';c.strokeStyle='#845d42';c.lineWidth=1.2;
    c.beginPath();c.roundRect(-width/2,visibleHeight-1,width,4+retract*2,2.5);c.fill();c.stroke();
  }
  if(state==='signed'){
    const impact=reduced||stall.kind==='final'?1:clamp(age/.12,0,1);
    c.save();c.translate(width*.25,height+6);c.rotate(-.13);
    const scale=reduced?1:1+(1-impact)*.35;c.scale(scale,scale);c.globalAlpha*=impact;
    c.fillStyle='#fff0d0';c.strokeStyle='#ac4337';c.lineWidth=2.7;
    c.beginPath();c.roundRect(-21,-11,42,22,4);c.fill();c.stroke();
    c.fillStyle='#98362d';c.textAlign='center';c.textBaseline='middle';c.font='900 16px '+font;c.fillText('已签',0,1);c.restore();
  }
  c.restore();
  warningClip.rect(stall.x-width/2-5,stall.y+baseY-bodyHeight*.63-3,width+8,
    state==='signed'?height+25:visibleHeight+9);
}

function drawStall(c:Canvas,assets:Assets,stall:MarketStall,sign:Placard,settings:Settings,warningClip:Path2D|null):void {
  const {state,age,locked=false}=sign;
  const duration=state==='signed'?1.05:.70;
  if(state!=='open'&&age>=duration)return;
  c.save();
  if(state!=='open')c.globalAlpha*=Math.min(1,(duration-age)/.22);
  if(warningClip){
    c.translate(stall.x,stall.y);
    paperSign(c,assets,stall,sign,settings.reduceMotion,warningClip);
  }else{
    if(state==='open')signFloor(c,stall,locked);
    c.translate(stall.x,stall.y);
    c.fillStyle='#392e3b60';c.beginPath();c.ellipse(3,baseY-1,bodyWidth*.43,10,0,0,turn);c.fill();
    c.drawImage(stallArt(assets,stall.kind),-bodyWidth/2,baseY-bodyHeight,bodyWidth,bodyHeight);
  }
  c.restore();
}

export function drawMarketStalls(c:Canvas,s:GameState,settings:Settings,assets:Assets,layer:'ground'|'signs'):Path2D|null {
  const market=s.market;
  if(!market)return null;
  const {offer,receipt,expired}=market;
  const showingReceipt=receipt&&s.time-receipt.signedAt<1.05;
  const showingExpiry=expired&&s.time-expired.at<.70;
  if(!offer&&!showingReceipt&&!showingExpiry)return null;
  const warningClip=layer==='signs'?new Path2D():null;
  const coins=s.player.hp>=s.player.maxHp;
  const heal=Math.min(25,s.player.maxHp-s.player.hp);
  if(offer){
    const remaining=offer.expiresAt===null?null:clamp((offer.expiresAt-s.time)/(offer.expiresAt-offer.openedAt),0,1);
    for(const stall of offer.stalls){
      drawStall(c,assets,stall,{coins,heal,locked:stall.kind==='final'&&!offer.ready,reenter:offer.mustReenter,
        state:'open',age:s.time-offer.openedAt,remaining},settings,warningClip);
    }
  }
  if(showingReceipt){
    for(const stall of receipt.stalls){
      const signed=stall.kind===receipt.stall.kind;
      drawStall(c,assets,stall,{coins:signed?receipt.soupCoins:coins,heal:signed?receipt.soupHeal:heal,
        state:signed?'signed':'rolled',age:s.time-receipt.signedAt},settings,warningClip);
    }
  }
  if(showingExpiry){
    for(const stall of expired.stalls)drawStall(c,assets,stall,{coins,heal,state:'rolled',age:s.time-expired.at},settings,warningClip);
  }
  return warningClip;
}
