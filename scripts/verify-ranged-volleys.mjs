import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

// Equip through the practice menu. The development hook places three separated test
// targets; all projectile motion, collisions, real HP changes and artwork come from play.
const weapons=[
  ['bag','纸袋气炮',9,72],['chopsticks','飞筷匣',5,42],['tray','回旋餐盘',3,44],
  ['spirit','汤灵保温壶',3,48],['lunchbox','弹射餐盒',3,40],['talisman','派单符册',3,54],
];
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  const epoch=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(+epoch+1000));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
  const cards=[];
  for(const [kind,name,count,degrees] of weapons){
    await page.getByRole('button',{name:'重置试验',exact:true}).click({force:true});
    await page.getByLabel('试验武器',{exact:true}).selectOption(kind,{force:true});
    await page.getByRole('button',{name:'装备并体验'}).click({force:true});
    const ids=await page.evaluate(({kind,degrees})=>{
      const game=window.__gameTest.game(),s=game.state;
      s.weapon.readyAt=s.time;
      return [-1,0,1].map(side=>{
        const angle=side*degrees*Math.PI/180,reach=kind==='lunchbox'?(side===0?420:344):245;
        const e=game.spawnEnemy('bowl',{x:s.player.x+Math.cos(angle)*reach,y:s.player.y+Math.sin(angle)*reach});
        e.march={x:0,y:0,until:s.time+4};return e.id;
      });
    },{kind,degrees});
    let launch;
    for(let i=0;i<42&&!launch;i++){
      await page.clock.runFor(16);
      launch=await page.evaluate(()=>{
        const {weapon,projectiles}=window.__gameTest.game().state;
        if(!projectiles.length)return null;
        weapon.readyAt=Infinity;
        return projectiles.map(p=>Math.atan2(p.vy,p.vx)*180/Math.PI);
      });
    }
    assert.equal(launch?.length,count,name);
    assert.ok(Math.abs(Math.max(...launch)-degrees)<.001&&Math.abs(Math.min(...launch)+degrees)<.001,name);
    await page.clock.runFor(kind==='chopsticks'?232:kind==='lunchbox'?320:300);
    const image=await page.evaluate(()=>{
      const field=document.querySelector('#game-canvas'),c=document.createElement('canvas');
      c.width=570;c.height=544;
      const x=field.width/1280,y=field.height/720;
      c.getContext('2d').drawImage(field,550*x,35*y,650*x,620*y,0,0,c.width,c.height);
      return c.toDataURL('image/png');
    });
    await page.clock.runFor(1664);
    const loss=await page.evaluate(ids=>ids.map(id=>{
      const e=window.__gameTest.game().state.enemies.find(e=>e.id===id);
      return e?e.maxHp-e.hp:120;
    }),ids);
    assert.ok(loss.every(v=>v>0),name+' missing left, centre or right hit: '+loss);
    cards.push({name,count,degrees,image,loss});
    await page.getByRole('button',{name:'试验工具',exact:true}).click({force:true});
  }
  assert.deepEqual(errors,[]);
  const encoded=await page.evaluate(async cards=>{
    const output=document.createElement('canvas'),width=570,height=544,caption=52,gap=8;
    output.width=2*width+gap;output.height=3*(height+caption)+gap*2;
    const c=output.getContext('2d');
    c.fillStyle='#2a2527';c.fillRect(0,0,output.width,output.height);
    for(const [i,card] of cards.entries()){
      const image=new Image();image.src=card.image;await image.decode();
      const x=(i%2)*(width+gap),y=Math.floor(i/2)*(height+caption+gap);
      c.drawImage(image,x,y);
      c.fillStyle='#fff2d8';c.font='600 20px "Microsoft YaHei", sans-serif';
      c.fillText(card.name+' · '+card.count+' 路',x+14,y+height+33);
      c.textAlign='right';c.font='17px "Microsoft YaHei", sans-serif';c.fillStyle='#e6d4b3';
      c.fillText('左 / 中 / 右扣血  '+card.loss.join(' / '),x+width-14,y+height+33);
      c.textAlign='left';
    }
    return output.toDataURL('image/webp',.93).split(',')[1];
  },cards);
  const output=process.env.VOLLEY_IMAGE||fileURLToPath(new URL('../docs/verification/courier/ranged.webp',import.meta.url));
  await mkdir(dirname(output),{recursive:true});await writeFile(output,Buffer.from(encoded,'base64'));
  console.log(JSON.stringify(cards.map(({name,count,degrees,loss})=>({name,count,degrees,loss}))));
}finally{await browser.close();}
