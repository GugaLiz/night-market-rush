import {CONFIG, WORLD} from '../core/config';
import {skillFieldRadius} from '../core/skill-fields';
import type {GameState, GroundCoin, SkillField} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';
import {cartFanOffset} from './delivery-skills';

const circle = Math.PI * 2;

export function drawMarketBackground(
  ctx: CanvasRenderingContext2D, assets: Assets, state: GameState | null, reduceMotion: boolean,
): void {
  const wave = state?.wave ?? 1;
  const age = state ? Math.max(0, state.time - state.waveStartedAt) : 0;
  const changing = wave > 1 && age < CONFIG.waves.transition;
  const progress = Math.min(1, age / CONFIG.waves.transition);
  const shownWave = changing && progress < .45 ? wave - 1 : wave;
  const backdrop = shownWave % 2 === 0 ? assets.riverside : assets.background;
  ctx.drawImage(backdrop, 0, 0, WORLD.width, WORLD.height);
  if (!changing) return;

  // Only the painted floor fades. Actors and collectible positions stay readable.
  ctx.save();
  const fade = progress < .45 ? progress / .45 : (1 - progress) / .55;
  ctx.globalAlpha = Math.min(1, fade) * (reduceMotion ? .35 : .80);
  ctx.fillStyle = '#171a2d';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  if (!reduceMotion && progress < .55 && state) {
    ctx.globalAlpha = .42 * (1 - progress / .55);
    ctx.strokeStyle = '#fff3db';
    ctx.lineWidth = 18 * (1 - progress) + 2;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 18 + progress * 1900, 0, circle);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSkillFields(
  ctx: CanvasRenderingContext2D, fields: SkillField[], time: number, simple: boolean, reduceMotion: boolean, assets: Assets,
): void {
  const atlas = assets.deliveryFields, cell = atlas.naturalWidth / 2;
  let source: SkillField | undefined;
  for (const field of fields) {
    const main = field.id === field.castId, hot = field.kind === 'fire';
    if (main) source = field;
    const age = time-field.bornAt, remaining = field.expiresAt-time;
    if (remaining <= 0) continue;
    // A loose receipt travels out on the fan's airflow before each side pocket arrives.
    if (hot && !main && !reduceMotion && source?.castId === field.castId && time>=source.bornAt && age<.10) {
      const flight = Math.min(1,(time-source.bornAt)/(field.bornAt-source.bornAt));
      const dx=field.x-source.x, dy=field.y-source.y;
      const bend=Math.sin(flight*Math.PI)*.12;
      const x=source.x+dx*flight-dy*bend, y=source.y+dy*flight+dx*bend;
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx)+bend*3);
      ctx.globalAlpha=Math.min(1,flight*5)*Math.min(1,(.10-age)/.10);
      ctx.strokeStyle='#ffe4ad';ctx.lineWidth=2.5;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-28,-2);ctx.quadraticCurveTo(-18,4,-7,1);ctx.stroke();
      if (!simple) {
        ctx.fillStyle='#fff2cc';ctx.strokeStyle='#946344';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(-6,-4);ctx.quadraticCurveTo(0,-7,8,-4);ctx.lineTo(7,4);ctx.quadraticCurveTo(1,2,-6,5);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#ca7652';ctx.fillRect(3,-2,2,4);
      }
      ctx.restore();
    }
    const radius=skillFieldRadius(field,time);
    if (radius<=0) continue;
    const fade=Math.min(1,remaining/.42);
    // Radius and ownership are visible immediately. Hot air and liquid develop after the tool moves.
    ctx.save();ctx.translate(field.x,field.y);
    ctx.globalAlpha=fade;
    if(hot){
      const castAge=source ? time-source.bornAt : age;
      const lift=Math.min(1,Math.max(0,(castAge-.09)/.30));
      const spread=Math.min(1,age/(main?.38:.22));
      const r=radius*(.24+.76*(1-(1-spread)**2));
      const strength=(.07+.93*lift)*Math.min(1,.25+age*4);
      ctx.fillStyle='rgba(230,170,96,.06)';
      ctx.beginPath();ctx.arc(0,0,radius,0,circle);ctx.fill();
      const lanes=main?(simple?4:6):(simple?2:3);
      const spin=reduceMotion?0:age*(main?1.1:1.5);
      for(let j=0;j<lanes;j++){
        const inner=main && (j===1 || j===4), reach=r*(inner?.51:.88);
        const a=j*circle/lanes+spin+(main?.35:field.id*.89);
        const w=Math.min(main?122:69,reach*(inner?1.00:.84));
        ctx.save();ctx.rotate(a);
        // Each ribbon has a narrow tail reaching back towards the takeout box.
        ctx.globalAlpha=fade*strength*(inner?.62:.82);
        ctx.lineCap='round';ctx.strokeStyle='#efad5f';ctx.lineWidth=main?3.4:2;
        ctx.beginPath();ctx.moveTo(-reach*.74,-reach*.58);
        ctx.bezierCurveTo(-reach*.54,-reach*.91,-w*.40,-reach,w*.10,-reach);ctx.stroke();
        ctx.strokeStyle='#fff0c9';ctx.lineWidth=1.4;ctx.beginPath();
        ctx.moveTo(-reach*.62,-reach*.75);ctx.quadraticCurveTo(-reach*.42,-reach*.97,-w*.17,-reach*1.01);ctx.stroke();
        // The painted brush and any printed slips keep an object-sized silhouette in a 250-unit gust.
        const variant=(j+Number(main))%2;
        ctx.globalAlpha=fade*strength*(inner?.74:.95);
        ctx.drawImage(atlas,variant*cell,0,cell,cell,-w*.48,-reach-w*.51,w,w);
        ctx.restore();
      }
    }else{
      const pour=Math.min(1,Math.max(0,(age-.11)/.30));
      const r=radius*(.14+.86*(1-(1-pour)**2));
      ctx.rotate((field.id%5)*.45);
      ctx.fillStyle='rgba(84,170,137,.09)';ctx.beginPath();ctx.arc(0,0,radius,0,circle);ctx.fill();
      ctx.globalAlpha=fade*(.10+.90*pour);
      const water=ctx.createRadialGradient(-r*.15,-r*.08,0,0,0,Math.max(1,r));
      water.addColorStop(0,'rgba(53,140,119,.20)');water.addColorStop(.76,'rgba(88,187,150,.34)');water.addColorStop(1,'rgba(160,218,173,.18)');
      ctx.fillStyle=water;ctx.strokeStyle='rgba(199,232,194,.60)';ctx.lineWidth=1.5;
      ctx.beginPath();
      for(let j=0;j<=50;j++){
        const a=circle*j/50,edge=r*(.92+.046*Math.sin(3*a+field.id)+.032*Math.cos(5*a));
        if(j===0)ctx.moveTo(edge,0);else ctx.lineTo(Math.cos(a)*edge,Math.sin(a)*edge);
      }
      ctx.closePath();ctx.fill();ctx.stroke();
      const settle=reduceMotion?1:Math.min(1,Math.max(0,(age-.32)/.54));
      const w=r*1.82;
      const opacity=fade*(.025+.65*pour);
      if(settle<1 && !simple){ctx.globalAlpha=opacity*(1-settle);ctx.drawImage(atlas,0,cell,cell,cell,-w/2,-w/2,w,w);}
      ctx.globalAlpha=opacity*(simple?1:settle);
      ctx.drawImage(atlas,cell,cell,cell,cell,-w/2,-w/2,w,w);
    }
    ctx.restore();
    if (hot && main) {
      // Both pieces stay where the courier set them down, even after she runs away.
      const unpack=Math.max(0,Math.min(1,(age-.22)/.18));
      ctx.save();ctx.globalAlpha=unpack*fade;
      drawSprite(ctx,assets,'meal',field.x+1,field.y+9,25,-.12,1,.5);
      ctx.globalAlpha*=Math.max(0,Math.min(1,(age-.34)/.12));
      drawSprite(ctx,assets,'fan',field.x+cartFanOffset.x,field.y+cartFanOffset.y,40,0,1,.5);
      ctx.restore();
    }
  }
}

export function drawGroundCoins(
  ctx: CanvasRenderingContext2D, coins: GroundCoin[], time: number, reduceMotion: boolean,
): void {
  for (const coin of coins) {
    const age = Math.max(0, time - coin.bornAt);
    const flight = reduceMotion ? 1 : Math.min(1, age / CONFIG.rewards.coinGrace);
    const origin = coin.dropOrigin ?? coin;
    const ease = 1 - (1 - flight) ** 2;
    const x = origin.x + (coin.x - origin.x) * ease;
    const y = origin.y + (coin.y - origin.y) * ease;
    const hop = Math.sin(flight * Math.PI) * (21 + coin.id % 18);
    const size = coin.value > 1 ? 9 : 7.8;
    const phase = age * (flight < 1 ? 22 : 5) + coin.id;
    const spin = reduceMotion ? .94 : .56 + .44 * Math.abs(Math.cos(phase));
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#32212d80';
    ctx.beginPath();
    ctx.ellipse(0, 1, size * (1 - hop / 130), size * .40, 0, 0, circle);
    ctx.fill();
    ctx.translate(0, -6 - hop);
    ctx.rotate(-.25);
    ctx.scale(spin, 1);
    ctx.fillStyle = '#bd6b16';
    ctx.strokeStyle = '#73381b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, circle);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd349';
    ctx.beginPath();
    ctx.arc(-.7, -.9, size - 1.3, 0, circle);
    ctx.fill();
    ctx.strokeStyle = '#fff1a4';
    ctx.beginPath();
    ctx.arc(-.7, -.9, size - 2.7, Math.PI, Math.PI * 1.8);
    ctx.stroke();
    ctx.fillStyle = '#a96823';
    ctx.fillRect(-2.1, -2.2, 4, 4);
    ctx.restore();
  }
}
