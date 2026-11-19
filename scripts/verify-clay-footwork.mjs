import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
  for(let i=0;i<120&&await page.locator('#game-shell').getAttribute('data-view')!=='play';i++)await page.clock.runFor(32);
  assert.equal(await page.locator('#game-shell').getAttribute('data-view'),'play');
  await page.evaluate(async()=>{
    const game=window.__gameTest.game();game.reset(639,true);
    game.state.weapon.readyAt=Infinity;
    const {loadAssets}=await import('/src/render/assets.ts');
    const assets=await loadAssets();
    const parts=new Map(Object.entries(assets.sprites).map(([name,s])=>[[s.image.src,s.x,s.y].join('|'),name]));
    const canvas=document.querySelector('#game-canvas'),ctx=canvas.getContext('2d');
    const draw=ctx.drawImage.bind(ctx),ellipse=ctx.ellipse.bind(ctx);
    const readings=window.shoeCheck={views:[],ground:null,shoes:[],parts:{}};
    // Compare the battle pixels before and after the trousers and shoes are painted.
    // This includes the clipped openings of the sneakers and the renderer's actual layer order.
    const width=144,height=110;
    let before=null,after=null;
    const lowerPixels=()=>ctx.getImageData(Math.round(readings.ground.x)-72,Math.round(readings.ground.y)-84,width,height).data;
    window.lowerBodyConnected=()=>{
      if(!before||!after)return [];
      const solid=new Uint8Array(width*height);
      for(let n=0;n<solid.length;n++){
        const j=n*4;
        const contrast=Math.max(Math.abs(after[j]-before[j]),Math.abs(after[j+1]-before[j+1]),Math.abs(after[j+2]-before[j+2]));
        if(contrast>8)solid[n]=1;
      }
      const islands=[];
      for(let n=0;n<solid.length;n++){
        if(!solid[n])continue;
        const pending=[n];solid[n]=0;let area=0;
        while(pending.length){
          const i=pending.pop();area++;
          for(const next of [i-1,i+1,i-width,i+width]){
            if(solid[next]){solid[next]=0;pending.push(next);}
          }
        }
        if(area>=8)islands.push(area);
      }
      return islands.sort((a,b)=>b-a);
    };
    ctx.drawImage=(image,...args)=>{
      if(image instanceof HTMLImageElement && args.length===8){
        const name=parts.get([image.src,args[0],args[1]].join('|'));
        if(['rigUpperR','rigForeR','rigHipFront','rigTorsoFront','rigHeadFront'].includes(name)){
          const [x,y,w,h]=args.slice(4),m=ctx.getTransform();
          const center=m.transformPoint({x:x+w/2,y:y+h/2});
          readings.parts[name]={width:Math.hypot(m.a,m.b)*w,height:Math.hypot(m.c,m.d)*h,y:center.y};
        }
        if(readings.ground && /^rig(Thigh|Shin|Shoe|Hip)/.test(name)){
          if(!before)before=lowerPixels();
          if(name.startsWith('rigShoe')){
            const m=ctx.getTransform();
            const [x,y,w,h]=args.slice(4);
            const sole=m.transformPoint({x:x+w*.5,y:y+h});
            const facing=name==='rigShoeR'||name==='rigShoeL'?'side':name;
            const view=facing+'/'+Math.sign(m.a);
            readings.shoes.push({x:sole.x,y:sole.y,view});
            readings.views.push(view);
          }
        }else if(before&&!after)after=lowerPixels();
      }
      return draw(image,...args);
    };
    ctx.ellipse=(x,y,rx,ry,...rest)=>{
      if(ry===4&&ctx.strokeStyle==='#fff1bc'){
        readings.ground=ctx.getTransform().transformPoint({x,y}).toJSON();
        readings.shoes=[];readings.parts={};before=null;after=null;
      }
      return ellipse(x,y,rx,ry,...rest);
    };
  });
  const route=[
    {at:6,down:['ArrowRight']},{at:21,up:['ArrowRight'],down:['ArrowLeft']},
    {at:34,down:['ArrowUp']},{at:44,up:['ArrowLeft']},
    {at:57,up:['ArrowUp'],down:['ArrowDown','ArrowRight']},
    {at:70,up:['ArrowRight']},{at:81,up:['ArrowDown']},
    {at:96,down:['ArrowRight']},{at:111,up:['ArrowRight'],down:['ArrowLeft']},
    {at:124,up:['ArrowLeft']},
  ];
  const captions=new Map([[4,'站稳持夹'],[15,'向右蹬地'],[28,'向左折返'],[39,'斜向远处'],
    [52,'背向跑动'],[63,'向前转弯'],[76,'迎面跑动'],[94,'松手站定'],
    [98,'移动起手'],[108,'持夹前进'],[114,'持夹回身'],[147,'收步站定']]);
  const cards=[];
  if(process.env.FOOTWORK_FRAMES)await mkdir(process.env.FOOTWORK_FRAMES,{recursive:true});
  const samples=[];
  let idleProportions;
  for(let i=0;i<148;i++){
    if(i===96)await page.evaluate(()=>{window.__gameTest.game().state.weapon.readyAt=0;});
    const keys=route.find(event=>event.at===i);
    for(const key of keys?.up??[])await page.keyboard.up(key);
    for(const key of keys?.down??[])await page.keyboard.down(key);
    await page.clock.runFor(32);
    const sample=await page.evaluate(()=>{
      const {shoes,ground}=window.shoeCheck, {player,weapon}=window.__gameTest.game().state;
      const soles=shoes.map(p=>({x:p.x-ground.x,y:p.y-ground.y,view:p.view})).sort((a,b)=>a.x-b.x);
      return {shoes:soles,islands:window.lowerBodyConnected(),speed:Math.hypot(player.vx,player.vy),phase:weapon.attack?.phase};
    });
    samples.push(sample);
    if(i===4){
      idleProportions=await page.evaluate(()=>{
        const {parts,shoes}=window.shoeCheck;
        return {head:parts.rigHeadFront.height,arm:parts.rigUpperR.height+parts.rigForeR.height,
          coatWidth:parts.rigTorsoFront.width,coatHeight:parts.rigTorsoFront.height,
          hipToSole:Math.max(...shoes.map(foot=>foot.y))-parts.rigHipFront.y};
      });
      // Use projected lengths, so changes to scale or atlas pixel dimensions are harmless.
      assert.ok(idleProportions.arm/idleProportions.head<.48,'The two arm segments must fit the compact courier silhouette');
      assert.ok(idleProportions.hipToSole/idleProportions.head<.32,'The coat hem should sit close to the planted sneakers');
      assert.ok(idleProportions.coatWidth/idleProportions.coatHeight>1.45,'The battle jacket should retain its wide, flared silhouette');
    }
    if(!captions.has(i)&&!process.env.FOOTWORK_FRAMES)continue;
    const crop=await page.evaluate(()=>{
      const {ground}=window.shoeCheck;
      const image=document.createElement('canvas');image.width=163;image.height=152;
      image.getContext('2d').drawImage(document.querySelector('#game-canvas'),
        Math.round(ground.x)-82,Math.round(ground.y)-136,163,152,0,0,163,152);
      return image.toDataURL('image/png').split(',')[1];
    });
    if(captions.has(i))cards.push({caption:captions.get(i),crop});
    if(process.env.FOOTWORK_FRAMES)await writeFile(process.env.FOOTWORK_FRAMES+'/'+String(i).padStart(3,'0')+'.png',Buffer.from(crop,'base64'));
  }
  const views=await page.evaluate(()=>window.shoeCheck.views);
  for(const flip of [-1,1])assert.ok(views.includes('side/'+flip),'Missing side facing '+flip);
  for(const view of ['rigShoeToe','rigShoeHeel','rigShoeHeelSide'])assert.ok(views.some(v=>v.startsWith(view+'/')),'Missing '+view);
  for(const [i,sample] of samples.entries()){
    assert.equal(sample.shoes.length,2,'Expected two shoes in sample '+i);
    assert.equal(sample.islands.length,1,'Disconnected lower body in sample '+i+' (pixel areas: '+sample.islands+')');
  }
  assert.ok(samples.slice(21,34).some(s=>s.shoes[0].view!==s.shoes[1].view),'During reversal the planted and swinging shoe turn independently');
  assert.ok(samples.slice(96,124).some(s=>s.phase==='active'&&s.speed>150),'Auto-attack must overlap running');
  const settled=samples.slice(-5);
  assert.ok(settled.every(s=>s.speed<.01),'Both feet must settle after key release');
  const drift=Math.max(...settled.flatMap(s=>s.shoes.map((p,i)=>Math.hypot(p.x-settled[0].shoes[i].x,p.y-settled[0].shoes[i].y))));
  assert.ok(drift<1,'Resting shoes drifted '+drift.toFixed(2)+' px');
  const image=await page.evaluate(async frames=>{
    const out=document.createElement('canvas');out.width=4*163;out.height=3*178;
    const ctx=out.getContext('2d');ctx.fillStyle='#302629';ctx.fillRect(0,0,out.width,out.height);
    ctx.font='bold 15px "Microsoft YaHei", sans-serif';ctx.fillStyle='#fff1d6';
    for(const [i,card] of frames.entries()){
      const x=i%4*163,y=Math.floor(i/4)*178,im=new Image();im.src='data:image/png;base64,'+card.crop;await im.decode();
      ctx.drawImage(im,x,y);ctx.fillText(card.caption,x+10,y+171);
    }
    return out.toDataURL('image/webp',.94).split(',')[1];
  },cards);
  await mkdir('test-results/footwork',{recursive:true});
  await writeFile('test-results/footwork/courier.webp',Buffer.from(image,'base64'));
  await page.keyboard.down('ArrowLeft');await page.keyboard.press('Space');await page.clock.runFor(80);
  const dash=await page.evaluate(()=>{
    const {player,time}=window.__gameTest.game().state;
    return {active:player.dashUntil>time,vx:player.vx,ground:window.shoeCheck.ground};
  });
  assert.ok(dash.active && dash.vx<0,'Dash should run left');
  await page.screenshot({clip:{x:Math.round(dash.ground.x)-82,y:Math.round(dash.ground.y)-136,width:163,height:152},path:'test-results/footwork/dash.png'});
  await page.keyboard.up('ArrowLeft');
  assert.deepEqual(errors,[]);
  console.log('Checked '+samples.length+' connected lower-body silhouettes (five views), a real moving attack, a dash and a settled shoe drift of '+drift.toFixed(2)+' px.',
    'Standing lengths in canvas pixels:',idleProportions);
} finally {await browser.close();}
