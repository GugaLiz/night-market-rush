import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

// Equip and spawn through the real lab UI. Position its six bowls for each range check,
// hold them still and postpone the next swing so one attack can be followed to its last hit.
const out=process.env.MELEE_IMAGE || fileURLToPath(new URL('../docs/verification/courier/melee.webp',import.meta.url));
const frameSize=366;
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],rows=[];
page.on('pageerror',error=>errors.push(error.message));
await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
try{
  const clock=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:clock});await page.clock.pauseAt(new Date(+clock+1000));
  for(const kind of ['tongs','knife','sword','umbrella']){
    await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
    await page.getByLabel('试验武器',{exact:true}).selectOption(kind,{force:true});
    await page.getByRole('button',{name:'装备并体验'}).click({force:true});
    await page.getByRole('button',{name:'试验工具',exact:true}).click({force:true});
    await page.getByLabel('敌人类型',{exact:true}).selectOption('bowl',{force:true});
    await page.getByRole('button',{name:'生成敌群',exact:true}).click({force:true});
    const info=await page.evaluate(async kind=>{
      const {MELEE_WEAPONS,meleePose,meleeWaveBand}=await import('/src/core/melee.ts');
      const {WEAPON_NAMES}=await import('/src/shared/types.ts');
      const config=MELEE_WEAPONS[kind], s=window.__gameTest.game().state;
      if(s.enemies.length!==6 || s.weapon.kind!==kind) throw Error('Expected selected weapon and six lab targets.');
      const targets=[['near',0,44],['far',0,config.range*.92],['left',-94,config.range*.74],
        ['right',94,config.range*.74],['rear',180,120],['outside',33,config.range+65]];
      for(const [i,[,degrees,distance]] of targets.entries()){
        const e=s.enemies[i], angle=degrees*Math.PI/180;
        e.x=e.px=s.player.x+Math.cos(angle)*distance;
        e.y=e.py=s.player.y+Math.sin(angle)*distance;
        e.march={x:0,y:0,until:s.time+3};
      }
      window.observeSwing=()=>{
        const attack=s.weapon.attack, wave=s.meleeWaves[0];
        const reach=attack ? meleePose(attack,s.time)?.reach : null;
        const bands=wave?.slices.map(slice=>meleeWaveBand(wave,slice,s.time)).filter(Boolean)??[];
        if(wave) s.weapon.readyAt=Infinity;
        return {time:s.time,release:wave?.releaseAt,id:attack?.id??wave?.id,
          emitted:wave?.nextSlice??0,reach,outer:Math.max(0,...bands.map(b=>b.outer)),
          detached:bands.filter(b=>b.inner>config.bodyReach+10).length,hp:s.enemies.map(e=>e.hp)};
      };
      return {...config,name:WEAPON_NAMES[kind],health:s.enemies[0].maxHp,roles:targets.map(t=>t[0])};
    },kind);
    const crop=()=>page.evaluate(size=>{
      const canvas=document.querySelector('#game-canvas'),frame=document.createElement('canvas');
      frame.width=size;frame.height=size;
      frame.getContext('2d').drawImage(canvas,350,2,680,680,0,0,size,size);
      return frame.toDataURL('image/webp',.97);
    },frameSize);
    const frames=[],firstHit={};let attackId,release,final,maxReach=0,maxOuter=0,maxSlices=0,maxDetached=0;
    for(let i=0;i<120;i++){
      await page.clock.runFor(16);
      const s=await page.evaluate(()=>window.observeSwing());
      if(s.release===undefined && release===undefined)continue;
      release??=s.release;attackId??=s.id;
      if(s.id!==undefined)assert.equal(s.id,attackId);
      maxReach=Math.max(maxReach,s.reach??0);maxOuter=Math.max(maxOuter,s.outer);
      maxDetached=Math.max(maxDetached,s.detached);maxSlices=Math.max(maxSlices,s.emitted);
      for(const [j,hp] of s.hp.entries())if(hp<info.health)firstHit[info.roles[j]]??=s.time-release;
      const progress=(s.time-release)/info.active;
      if(frames.length===0 || (frames.length===1 && progress>=.53) ||
        (frames.length===2 && progress>=1.04) || (frames.length===3 && s.time-release>=firstHit.far+.045)){
        frames.push(await crop());
      }
      final=s;
      if(!s.emitted && s.time-release>.35)break;
    }
    assert.equal(frames.length,4,kind+' must show the full stroke');
    const hitHp=info.health-info.damage;
    assert.deepEqual(final.hp,[hitHp,hitHp,hitHp,hitHp,info.health,info.health],kind+' single-swing HP');
    assert.ok(firstHit.far>firstHit.near+.05,kind+' must travel before reaching the far bowl');
    assert.ok(maxReach<=info.bodyReach && maxOuter===info.range && maxDetached>=3);
    assert.ok(maxSlices>=Math.ceil(info.sweep/12));
    rows.push({...info,frames});
    console.log(kind,JSON.stringify({bodyReach:maxReach,range:maxOuter,sweep:info.sweep,damage:info.damage,
      slices:maxSlices,maxDetached,health:final.hp,firstHitSeconds:Object.fromEntries(Object.entries(firstHit).map(([k,t])=>[k,+t.toFixed(3)]))}));
  }
  assert.deepEqual(errors,[]);
  const sheet=await page.evaluate(async({rows,size})=>{
    const canvas=document.createElement('canvas'),w=size,h=size,gap=4,label=110;
    canvas.width=label+4*(w+gap);canvas.height=32+rows.length*(h+gap);
    const c=canvas.getContext('2d');c.fillStyle='#312932';c.fillRect(0,0,canvas.width,canvas.height);
    c.textAlign='center';c.fillStyle='#ffe6bd';c.font='600 16px "Microsoft YaHei",sans-serif';
    ['肩后起挥','气浪离手','扫过另一肩','外圈伤害'].forEach((name,i)=>c.fillText(name,label+i*(w+gap)+w/2,22));
    for(const [i,row] of rows.entries()){
      const y=32+i*(h+gap);c.fillStyle='#fff2da';c.font='600 16px "Microsoft YaHei",sans-serif';
      c.fillText(row.name,label/2,y+h/2-4);c.fillStyle='#ffc575';c.font='bold 21px sans-serif';c.fillText(row.sweep+'°',label/2,y+h/2+25);
      c.fillStyle='#efdac1';c.font='14px "Microsoft YaHei",sans-serif';c.fillText('持具 '+row.bodyReach,label/2,y+h/2+53);c.fillText('气浪 '+row.range,label/2,y+h/2+73);
      for(const [j,url] of row.frames.entries()){const image=new Image();image.src=url;await image.decode();c.drawImage(image,label+j*(w+gap),y);}
    }
    return canvas.toDataURL('image/webp',.94).split(',')[1];
  },{rows,size:frameSize});
  await mkdir(dirname(out),{recursive:true});await writeFile(out,Buffer.from(sheet,'base64'));
}finally{await browser.close();}
