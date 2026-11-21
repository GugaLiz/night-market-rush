import {expect,test,type Page} from '@playwright/test';

/** Isolated browser contexts and in-memory storage doubles only: no existing
 * player save is read or written. Market scenarios use genuine Game events. */
async function openRun(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const app=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!app?.audio)throw new Error('Cocos prototype unavailable');
    w.__eventFeedback={app,cc,records:[]};
    const playCue=app.audio.playCue.bind(app.audio);
    app.audio.playCue=(cue:any)=>{
      playCue(cue);
      if(cue.name==='record')w.__eventFeedback.records.push({at:performance.now(),view:app.view,
        attached:app.audio.voices.some((voice:any)=>voice.source.clip?.name==='record')});
    };
  });
  const start=page.getByRole('button',{name:'开始挑战',exact:true});await start.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).__eventFeedback.app.view)).toBe('play');
  await expect.poll(()=>page.evaluate(()=>(window as any).__eventFeedback.app.audio.available),{timeout:30000}).toBe(true);
  return errors;
}
async function feedback(page:Page){return page.evaluate(()=>{
  const {app}=(window as any).__eventFeedback;
  return {text:app.feedback.string,active:app.feedback.node.active,seconds:app.feedbackTime,
    live:document.querySelector('[role="status"]')?.textContent??''};
});}
async function finish(page:Page,mode:'success'|'failed'|'not-record'|'practice'){
  return page.evaluate(mode=>{
    const w=window as any,{app}=w.__eventFeedback;app.session.pause();
    const best=mode==='not-record'?{score:100,time:100,rulesVersion:'test',date:new Date().toISOString()}:null;
    // Simulates SaveStore's session result on failure without touching any
    // browser storage key; only the success mode claims durable persistence.
    const store:any={data:{best},persistenceAvailable:mode!=='failed',calls:0,
      saveBest(record:any){this.calls++;this.data.best=record;return mode!=='failed';}};
    app.storage=store;
    const state=app.session.state;state.kills=5;state.time=30;state.ended=true;state.practice=mode==='practice';
    w.__eventFeedback.startedAt=performance.now();app.finish();
    return {view:app.view,record:app.resultRecord,saved:app.resultSaved,saveCalls:store.calls};
  },mode);
}
async function records(page:Page){return page.evaluate(()=>(window as any).__eventFeedback.records as Array<{at:number;view:string;attached:boolean}>);}

test('real weapon and market events produce immediate named messages and accessible feedback',async({page})=>{
  const errors=await openRun(page);
  const weaponEvents=await page.evaluate(()=>{
    const {app}=(window as any).__eventFeedback;app.session.pause();
    app.session.game.drainEvents();app.session.game.setWeapon('bag');
    const events=app.session.game.drainEvents();app.onGameEvents(events,app.session.state);return events.map((event:any)=>event.type);
  });
  expect(weaponEvents).toContain('weapon');
  await expect.poll(feedback.bind(null,page)).toMatchObject({text:'已换装 · 纸袋气炮',active:true});
  await expect.poll(async()=>(await feedback(page)).live).toContain('已换装 · 纸袋气炮');
  for(const [kind,expected] of [['frost','碎冰箱 · 冲刺撞碎带裂纹的冻怪'],['brine','泡菜箱 · 让回旋餐盘飞过毒雾']] as const){
    const result=await page.evaluate(kind=>{
      const {app}=(window as any).__eventFeedback,g=app.session.game;g.setupMarketDemo('marketUpgrade');g.drainEvents();
      const state=g.state,stall=state.market.offer.stalls.find((item:any)=>item.kind===kind);
      if(!stall)throw new Error(`Missing ${kind} market stall`);
      state.player.x=state.player.px=stall.x;state.player.y=state.player.py=stall.y;g.update(1/60,{x:0,y:0});
      const events=g.drainEvents();app.onGameEvents(events,state);
      return {signed:events.some((event:any)=>event.type==='market'&&event.action==='sign'&&event.kind===kind),upgrade:state.market.upgrade};
    },kind);
    expect(result).toEqual({signed:true,upgrade:kind});
    await expect.poll(feedback.bind(null,page)).toMatchObject({text:expected,active:true});
    await expect.poll(async()=>(await feedback(page)).live).toContain(expected);
  }
  expect(errors).toEqual([]);
});

test('only a successfully saved new record plays its cue after the result delay',async({page})=>{
  const errors=await openRun(page);const result=await finish(page,'success');
  expect(result).toEqual({view:'result',record:true,saved:true,saveCalls:1});
  expect(await records(page)).toHaveLength(0);
  await expect.poll(async()=>(await records(page)).length,{timeout:5000}).toBe(1);
  const [cue]=await records(page),started=await page.evaluate(()=>(window as any).__eventFeedback.startedAt as number);
  expect(cue.view).toBe('result');expect(cue.attached).toBe(true);expect(cue.at-started).toBeGreaterThanOrEqual(750);
  await page.waitForTimeout(350);expect(await records(page)).toHaveLength(1);expect(errors).toEqual([]);
});

for(const mode of ['failed','not-record','practice'] as const){
  test(`${mode} result never plays the record cue`,async({page})=>{
    const errors=await openRun(page);const result=await finish(page,mode);
    expect(result.view).toBe('result');
    if(mode==='failed'){expect(result.record).toBe(true);expect(result.saved).toBe(false);expect(result.saveCalls).toBe(1);}
    else {expect(result.record).toBe(false);expect(result.saveCalls).toBe(0);}
    await page.waitForTimeout(1400);expect(await records(page)).toHaveLength(0);expect(errors).toEqual([]);
  });
}

test('leaving a result cancels its pending record cue even if another result opens',async({page})=>{
  const errors=await openRun(page);expect((await finish(page,'success')).record).toBe(true);
  await page.waitForTimeout(300);
  await page.evaluate(()=>{const {app}=(window as any).__eventFeedback;app.action('home');});
  await expect.poll(()=>page.evaluate(()=>(window as any).__eventFeedback.app.view)).toBe('home');
  expect((await finish(page,'not-record')).record).toBe(false);
  await page.waitForTimeout(1400);expect(await records(page)).toHaveLength(0);expect(errors).toEqual([]);
});
