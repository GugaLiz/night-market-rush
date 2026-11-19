import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const folder=process.env.ENEMY_CAPTURE || 'docs/verification/clay';
const browser=await chromium.launch({channel:'chrome'});
try {
  await mkdir(folder,{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket(url=>url.searchParams.has('token'),socket=>socket.onMessage(()=>{}));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
  for(let i=0;i<120 && await page.locator('#game-shell').getAttribute('data-view')!=='play';i++)await page.clock.runFor(32);
  await page.evaluate(async()=>{
    const {loadAssets}=await import('/src/render/assets.ts'),{sprites}=await loadAssets();
    const names=new Map();
    for(const [name,s] of Object.entries(sprites))names.set([s.image.src,s.x,s.y].join(','),name);
    const c=document.querySelector('#game-canvas').getContext('2d');
    const draw=c.drawImage.bind(c),clear=c.clearRect.bind(c),fill=c.fillText.bind(c);
    c.clearRect=(...args)=>{window.enemyFrame={sprites:[],text:[]};return clear(...args);};
    c.drawImage=(img,...args)=>{
      if(args.length===8 && img instanceof HTMLImageElement){
        const name=names.get([img.src,args[0],args[1]].join(','));
        if(name)window.enemyFrame.sprites.push(name);
      }
      return draw(img,...args);
    };
    window.enemySceneText=new Set();
    c.fillText=(str,...args)=>{
      window.enemyFrame.text.push(str);window.enemySceneText.add(str);
      return fill(str,...args);
    };
  });
  await page.clock.runFor(1300);
  const frame=()=>page.evaluate(()=>window.enemyFrame);
  const opening=await frame();
  assert.ok(['bun','bunGrin','bunCurious'].every(name=>opening.sprites.includes(name)));
  const snacks=['onigiri','siumai','zongzi'];
  for(const kind of snacks)assert.ok(opening.sprites.some(name=>name.startsWith(kind)),kind+' drawn in the first wave');
  const canvasCapture=async(file,clip)=>{
    const data=await page.evaluate(([x,y,w,h])=>{
      const source=document.querySelector('#game-canvas'),out=document.createElement('canvas');
      out.width=w;out.height=h;
      out.getContext('2d').drawImage(source,x,y,w,h,0,0,w,h);
      return out.toDataURL('image/webp',.93).split(',')[1];
    },clip);
    await writeFile(folder+'/'+file,Buffer.from(data,'base64'));
  };
  await canvasCapture('enemy-opening.webp',[0,100,1280,525]);
  await page.evaluate(kinds=>{
    const game=window.__gameTest.game();game.reset(738,true);
    game.state.weapon.readyAt=Infinity;
    for(const [row,kind] of kinds.entries()){
      const y=283+row*87;
      for(const [col,x] of [320,740,880,1010].entries()){
        const enemy=game.spawnEnemy(kind,{x,y});
        enemy.march={x:0,y:0,until:10};
        if(col===2)enemy.hurtAt=game.state.time;
        if(col===3)enemy.hp=1;
      }
    }
  },snacks);
  await page.clock.runFor(64);
  const snackLineup=await frame();
  for(const kind of snacks)for(const pose of ['', 'Alert', 'Hurt', 'Low']){
    assert.ok(snackLineup.sprites.includes(kind+pose),'Missing battle sprite '+kind+pose);
  }
  // Seat the nine full-health personalities apart, then deal genuine skate damage to a single bun.
  await page.evaluate(()=>{
    window.__gameTest.scenario('showcase');
    const g=window.__gameTest.game();g.reset(738,true);
    Object.assign(g.state.player,{x:275,y:360,px:275,py:360});
    g.state.weapon.readyAt=9999;
    for(const [i,kind] of ['bun','box','bowl'].entries())for(let j=0;j<3;j++){
      const e=g.spawnEnemy(kind,{x:593+j*105,y:276+i*118});
      e.march={x:0,y:0,until:100};e.phaseUntil=e.shotReadyAt=9999;e.facing=1;
    }
    const e=g.spawnEnemy('bun',{x:381,y:360});e.march={x:0,y:0,until:100};
  });
  await page.clock.runFor(80);
  const lineup=await frame();
  for(const kind of ['bun','box','bowl'])for(const face of ['', 'Grin','Curious'])assert.ok(lineup.sprites.includes(kind+face));
  assert.ok(lineup.text.includes('30/30'));
  await canvasCapture('enemy-expressions.webp',[538,195,335,339]);
  const assertNoDamageNumbers=async()=>{
    const painted=await page.evaluate(()=>[...window.enemySceneText]);
    assert.deepEqual(painted.filter(t=>/^[+−-]?\d+(?:\.\d+)?(?:段|(?:\s+\+\d+)+)?$/.test(t)),[]);
  };
  await page.evaluate(()=>{const g=window.__gameTest.game();window.enemySceneText.clear();g.triggerSkill('skate');g.state.player.skateUntil=0;});
  await page.clock.runFor(96);
  const impact=await frame();
  assert.ok(impact.sprites.includes('bunHurt') && impact.text.includes('10/30'));
  await page.clock.runFor(3100);
  const injured=await frame();assert.ok(injured.sprites.includes('bunLow') && injured.text.includes('10/30'));
  await assertNoDamageNumbers();
  await canvasCapture('enemy-health.webp',[202,183,278,204]);
  await page.evaluate(()=>{
    const g=window.__gameTest.game();g.reset(61,true);
    g.state.weapon.readyAt=9999;
    for(const kind of ['box','bowl']){
      const e=g.spawnEnemy(kind,{x:g.state.player.x+150,y:g.state.player.y+(kind==='box'?-60:60)});
      e.hp=1;e.phaseUntil=e.shotReadyAt=9999;
    }
    g.spawnEnemy('giantBun',{x:300,y:300});
    g.spawnEnemy('giantBun',{x:300,y:480}).hurtAt=g.state.time;
    g.spawnEnemy('giantBun',{x:950,y:450}).hp=1;
  });
  await page.clock.runFor(64);
  const tired=await frame();
  for(const face of ['boxLow','bowlLow','giantBun','giantBunHurt','giantBunLow'])
    assert.ok(tired.sprites.includes(face),'Missing mascot state '+face);
  await page.evaluate(()=>{
    const g=window.__gameTest.game();
    for(const e of g.state.enemies)if(e.kind==='box'||e.kind==='bowl')e.phaseUntil=e.shotReadyAt=g.state.time;
  });
  await page.clock.runFor(48);
  const warning=await frame();
  assert.ok(warning.sprites.includes('box') && warning.sprites.includes('bowl'),'Low-health monsters face the player during attack warnings');
  assert.ok(!warning.sprites.includes('boxLow') && !warning.sprites.includes('bowlLow'));
  await page.evaluate(()=>{
    window.__gameTest.scenario('showcase');const g=window.__gameTest.game();
    g.reset(44,true);g.state.weapon.readyAt=999;
    for(let i=0;i<30;i++){
      const angle=i*Math.PI*2/30,r=95+i%3*15;
      g.spawnEnemy('bun',{x:g.state.player.x+Math.cos(angle)*r,y:g.state.player.y+Math.sin(angle)*r});
    }
    window.enemySceneText.clear();g.triggerSkill('fan');
  });
  await page.clock.runFor(230);
  assert.equal(await page.evaluate(()=>window.__gameTest.game().state.kills),30);
  const crowd=await frame(),empty=crowd.text.filter(t=>t==='0/30').length;
  assert.equal(empty,1,'Painted crowd readouts '+crowd.text.join(', '));
  await canvasCapture('enemy-sweep.webp',[394,128,508,419]);
  await page.clock.runFor(630);assert.ok(!(await frame()).text.includes('0/30'));
  await assertNoDamageNumbers();
  await page.evaluate(()=>{
    window.__gameTest.scenario('showcase');
    const g=window.__gameTest.game();g.reset(45,true);g.state.weapon.readyAt=999;
    g.spawnEnemy('bun',g.state.player);
  });
  await page.clock.runFor(80);
  assert.equal(await page.evaluate(()=>window.__gameTest.snapshot().player.hp),92);
  assert.ok((await frame()).text.includes('−8'),'rider damage indicator');
  await page.evaluate(()=>window.__gameTest.game().healPlayer());
  await page.clock.runFor(48);
  assert.equal(await page.evaluate(()=>window.__gameTest.snapshot().player.hp),100);
  assert.ok((await frame()).text.includes('+8'),'rider healing indicator');
  assert.deepEqual(errors,[]);
  console.log('Mixed opening, 12 street-snack poses and nine original face/species combinations. Hurt and 10/30 HP, 30 KOs with one empty plaque, no enemy damage text across frames, rider −8 and +8.');
} finally {await browser.close();}
