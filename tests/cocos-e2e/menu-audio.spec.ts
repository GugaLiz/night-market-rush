import {expect,test,type Page} from '@playwright/test';

/** Uses a Creator Web development build and the live Cocos audio objects.
 * Game.EVENT_HIDE/SHOW and window resizing simulate interruptions; they do not
 * establish behavior on a physical phone or under OS audio interruption. */
async function open(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const app=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!app?.audio)throw new Error('Cocos audio host unavailable');
    w.__menuAudio={cc,app};
  });
  return errors;
}
async function activate(page:Page,name:string){
  const node=page.getByRole('button',{name,exact:true});await expect(node).toBeAttached();await node.focus();await page.keyboard.press('Enter');
}
async function snapshot(page:Page){return page.evaluate(()=>{
  const {app}=(window as any).__menuAudio,audio=app.audio;
  return {view:app.view,scene:audio.policy.scene,playing:audio.music.playing,available:audio.available,
    clip:audio.music.clip?.name??null,volume:audio.music.volume,preview:audio.settings.music,stored:app.settings.music,running:app.session.isRunning};
});}
async function lifecycle(page:Page,kind:'hide'|'show'){
  await page.evaluate(kind=>{const {cc}=(window as any).__menuAudio;cc.game.emit(kind==='hide'?cc.Game.EVENT_HIDE:cc.Game.EVENT_SHOW);},kind);
}
async function openSound(page:Page){await activate(page,'声音');await expect(page.getByRole('slider',{name:'音乐音量'})).toBeAttached();}
async function stepMusic(page:Page,key:'ArrowRight'|'ArrowLeft',count=8){
  const slider=page.getByRole('slider',{name:'音乐音量'});await slider.focus();const before=Number(await slider.inputValue());
  for(let i=0;i<count;i++)await page.keyboard.press(key);
  await expect.poll(async()=>Number(await slider.inputValue())).not.toBe(before);
  return Number(await slider.inputValue())/100;
}
async function discard(page:Page){await activate(page,'取消');await activate(page,'放弃修改');}

test('home settings preview survives interruption and rotation, then cancel/apply restores or commits music',async({page})=>{
  const errors=await open(page);
  // A real menu gesture unlocks Web Audio; avoid synthetic game actions.
  await activate(page,'操作设置');await expect.poll(snapshot.bind(null,page),{timeout:30000}).toMatchObject({view:'settings',scene:'home',available:true,playing:true,clip:'music_home'});
  await openSound(page);const baseline=await snapshot(page),draft=await stepMusic(page,'ArrowRight');
  await expect.poll(async()=>(await snapshot(page)).preview).toBeCloseTo(draft,2);
  await expect.poll(async()=>(await snapshot(page)).volume).toBeGreaterThan(baseline.volume);
  expect((await snapshot(page)).stored).toBeCloseTo(baseline.stored,3);
  await lifecycle(page,'hide');expect(await snapshot(page)).toMatchObject({view:'settings',scene:'paused',playing:false});
  await lifecycle(page,'show');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'settings',scene:'home',playing:true,clip:'music_home'});
  expect((await snapshot(page)).preview).toBeCloseTo(draft,2);
  await page.setViewportSize({width:430,height:932});await expect.poll(async()=>(await snapshot(page)).view).toBe('rotate');
  await page.setViewportSize({width:1280,height:720});await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'settings',scene:'home',playing:true});
  expect((await snapshot(page)).preview).toBeCloseTo(draft,2);
  await discard(page);await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'home',scene:'home',playing:true});
  expect((await snapshot(page)).preview).toBeCloseTo(baseline.stored,3);
  await activate(page,'操作设置');await openSound(page);const applied=await stepMusic(page,'ArrowLeft');await activate(page,'应用');
  await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'home',scene:'home',playing:true});
  expect((await snapshot(page)).stored).toBeCloseTo(applied,2);
  expect((await snapshot(page)).preview).toBeCloseTo(applied,2);
  expect(errors).toEqual([]);
});

test('home and tutorial catalogs retain menu music through background and return',async({page})=>{
  const errors=await open(page);await activate(page,'夜市图鉴');
  await expect.poll(snapshot.bind(null,page),{timeout:30000}).toMatchObject({view:'catalog',scene:'home',playing:true,clip:'music_home'});
  await lifecycle(page,'hide');expect(await snapshot(page)).toMatchObject({view:'catalog',scene:'paused',playing:false});
  await lifecycle(page,'show');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'catalog',scene:'home',playing:true});
  await activate(page,'返回');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'home',scene:'home',playing:true});
  await activate(page,'玩法说明');await activate(page,'查看全部图鉴');
  await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'catalog',scene:'home',playing:true});
  await activate(page,'返回');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'tutorial',scene:'home',playing:true});
  expect(errors).toEqual([]);
});

test('battle pause and settings remain silent during interruption and on cancel or apply',async({page})=>{
  const errors=await open(page);await activate(page,'开始挑战');
  await expect.poll(snapshot.bind(null,page),{timeout:30000}).toMatchObject({view:'play',scene:'play',playing:true,running:true});
  await page.keyboard.press('p');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'pause',scene:'paused',playing:false,running:false});
  await activate(page,'设置');await openSound(page);const before=await snapshot(page);await stepMusic(page,'ArrowRight');
  expect(await snapshot(page)).toMatchObject({view:'settings',scene:'paused',playing:false,running:false});
  await lifecycle(page,'hide');await lifecycle(page,'show');expect(await snapshot(page)).toMatchObject({view:'settings',scene:'paused',playing:false,running:false});
  await discard(page);await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'pause',scene:'paused',playing:false,running:false});
  expect((await snapshot(page)).stored).toBeCloseTo(before.stored,3);
  await activate(page,'设置');await openSound(page);const applied=await stepMusic(page,'ArrowLeft');await activate(page,'应用');
  await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'pause',scene:'paused',playing:false,running:false});
  expect((await snapshot(page)).stored).toBeCloseTo(applied,2);
  expect(errors).toEqual([]);
});

test('practice catalog stays paused and resumes only after leaving the lab',async({page})=>{
  const errors=await open(page);await activate(page,'配送试验场');
  await expect.poll(snapshot.bind(null,page),{timeout:30000}).toMatchObject({view:'lab',scene:'paused',playing:false,running:false});
  await activate(page,'查看图鉴');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'catalog',scene:'paused',playing:false,running:false});
  await lifecycle(page,'hide');await lifecycle(page,'show');
  expect(await snapshot(page)).toMatchObject({view:'catalog',scene:'paused',playing:false,running:false});
  await activate(page,'返回');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'lab',scene:'paused',playing:false,running:false});
  await activate(page,'继续试验');await expect.poll(snapshot.bind(null,page)).toMatchObject({view:'play',scene:'play',playing:true,running:true});
  expect(errors).toEqual([]);
});
