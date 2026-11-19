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
    const readings=window.shoeCheck={frames:0,maxGap:0,views:[],ground:null};
    // The two independent pieces must touch on the actual canvas, including on
    // diagonals where a shin with an accidentally vertical rotation detaches.
    let ankle;
    ctx.drawImage=(image,...args)=>{
      if(image instanceof HTMLImageElement && args.length===8){
        const name=parts.get([image.src,args[0],args[1]].join('|'));
        const [, , , , x,y,width,height]=args,matrix=ctx.getTransform();
        if(name==='rigShin')ankle=matrix.transformPoint({x:0,y:height-2});
        if(name?.startsWith('rigShoe') && ankle){
          const side=name==='rigShoeL'||name==='rigShoeR';
          const cuffX=side?.36:name==='rigShoeHeelSide'?.40:.50;
          const opening=matrix.transformPoint({x:x+cuffX*width,y:y+(side?.13:.12)*height});
          readings.maxGap=Math.max(readings.maxGap,Math.hypot(ankle.x-opening.x,ankle.y-opening.y));
          readings.frames++;readings.views.push({name,flip:Math.sign(matrix.a)});ankle=undefined;
        }
      }
      return draw(image,...args);
    };
    ctx.ellipse=(x,y,rx,ry,...rest)=>{
      if(ry===4&&ctx.strokeStyle==='#fff1bc')readings.ground=ctx.getTransform().transformPoint({x,y}).toJSON();
      return ellipse(x,y,rx,ry,...rest);
    };
  });
  const route=[
    {at:6,down:['ArrowRight']},{at:21,up:['ArrowRight'],down:['ArrowLeft']},
    {at:34,down:['ArrowUp']},{at:44,up:['ArrowLeft']},
    {at:57,up:['ArrowUp'],down:['ArrowDown','ArrowRight']},
    {at:70,up:['ArrowRight']},{at:81,up:['ArrowDown']},
  ];
  const captions=new Map([[4,'站稳持夹'],[15,'向右蹬地'],[28,'向左折返'],[39,'斜向远处'],
    [52,'背向跑动'],[63,'向前转弯'],[76,'迎面跑动'],[94,'松手站定']]);
  const cards=[];
  if(process.env.FOOTWORK_FRAMES)await mkdir(process.env.FOOTWORK_FRAMES,{recursive:true});
  for(let i=0;i<96;i++){
    const keys=route.find(event=>event.at===i);
    for(const key of keys?.up??[])await page.keyboard.up(key);
    for(const key of keys?.down??[])await page.keyboard.down(key);
    await page.clock.runFor(32);
    if(!captions.has(i)&&!process.env.FOOTWORK_FRAMES)continue;
    const crop=await page.evaluate(()=>{
      const {ground}=window.shoeCheck;
      const image=document.createElement('canvas');image.width=163;image.height=152;
      image.getContext('2d').drawImage(document.querySelector('#game-canvas'),
        ground.x-82,ground.y-136,163,152,0,0,163,152);
      return image.toDataURL('image/png').split(',')[1];
    });
    if(captions.has(i))cards.push({caption:captions.get(i),crop});
    if(process.env.FOOTWORK_FRAMES)await writeFile(process.env.FOOTWORK_FRAMES+'/'+String(i).padStart(3,'0')+'.png',Buffer.from(crop,'base64'));
  }
  const {maxGap,frames,views}=await page.evaluate(()=>window.shoeCheck);
  assert.ok(frames>200,'Measure both shoes across the whole route');
  assert.ok(maxGap<.5,'Painted shin endpoint misses sock opening by '+maxGap.toFixed(2)+' px');
  for(const view of ['rigShoeToe','rigShoeHeel','rigShoeHeelSide'])assert.ok(views.some(v=>v.name===view),'Missing '+view);
  for(const flip of [-1,1])assert.ok(views.some(v=>v.name==='rigShoeR'&&v.flip===flip),'Missing side facing '+flip);
  assert.deepEqual(errors,[]);
  const image=await page.evaluate(async frames=>{
    const out=document.createElement('canvas');out.width=4*163;out.height=2*178;
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
  console.log('Measured '+frames+' painted shin-to-shoe contacts in five facing views. Maximum gap '+maxGap.toFixed(2)+' px.');
} finally {await browser.close();}
