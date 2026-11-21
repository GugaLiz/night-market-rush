import {expect,test} from '@playwright/test';

test('chopstick volley draws its paired sticks and sleeves in normal and quiet modes',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const result=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const g=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!g)throw new Error('Cocos prototype component unavailable');
    g.action('practice');g.action('choose-weapon','chopsticks');g.action('lab');g.action('spawn',{kind:'eliteCrab',group:false});
    for(let i=0;i<300&&g.session.isRunning;i++){
      g.session.update(1/60,{x:0,y:0});g.render(1/60);
      if(g.session.state.projectiles.some((q:any)=>q.kind==='chopsticks'&&q.travelled>80))break;
    }
    g.session.pause();
    const view=g.projectiles,old=view.drawChopsticks.bind(view),oldQuad=view.graphics.quadraticCurveTo.bind(view.graphics);
    let calls:any[]=[],curves=0;
    view.drawChopsticks=(...args:any[])=>{calls.push({distance:args[3],quiet:args[5]});return old(...args);};
    view.graphics.quadraticCurveTo=(...args:any[])=>{curves++;return oldQuad(...args);};
    g.settings.quality='standard';g.settings.reduceMotion=false;g.render(0);
    const normal={calls,curves};calls=[];curves=0;
    g.settings.quality='simple';g.settings.reduceMotion=false;g.render(0);
    const simple={calls,curves};calls=[];curves=0;
    g.settings.quality='standard';g.settings.reduceMotion=true;g.render(0);
    const reduced={calls,curves};view.drawChopsticks=old;view.graphics.quadraticCurveTo=oldQuad;
    return {normal,simple,reduced};
  });
  for(const [name,view] of Object.entries(result)){
    expect(view.calls.length,`${name}: real volley is visible`).toBeGreaterThan(0);
    expect(view.calls.some((call:{distance:number})=>call.distance>80),`${name}: sleeve extends`).toBe(true);
    expect(view.curves,`${name}: paths are drawn`).toBeGreaterThan(0);
    expect(view.calls.every((call:{quiet:boolean})=>call.quiet===(name!=='normal'))).toBe(true);
  }
  expect(errors).toEqual([]);
});
