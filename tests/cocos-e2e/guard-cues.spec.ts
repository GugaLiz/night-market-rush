import {expect,test} from '@playwright/test';

test('guard danger area keeps its outline while directional and summon details render',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const ready=page.waitForEvent('console',{predicate:m=>m.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const result=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)throw new Error('Development game unavailable');
    w.__guardCueGame=game;game.action('practice');game.action('spawn',{kind:'eliteLotus',group:false});
    game.session.pause();game.show('play');
    const state=game.session.state,e=state.enemies[0];if(!e)throw new Error('Guard unavailable');
    state.enemies.splice(1);state.player.x=state.player.px=160;state.player.y=state.player.py=580;
    e.x=e.px=650;e.y=e.py=400;e.spawnAt=state.time-2;e.hurtAt=-999;e.hp=e.maxHp=9999;
    e.guardCast={name:'test',startsAt:state.time-.5,endsAt:state.time+1,marks:[{
      shape:{kind:'ring',center:{x:650,y:400},inner:66,radius:152},warnAt:state.time-.5,hitAt:state.time+.5,endAt:state.time+1,damage:20}]};
    game.settings.reduceMotion=false;game.settings.quality='simple';game.settings.shake=false;
    const graphics=game.enemies.ground,oldQuadratic=graphics.quadraticCurveTo,oldStroke=graphics.stroke;
    let curves=0,strokes=0;
    graphics.quadraticCurveTo=function(...args:any[]){curves++;return oldQuadratic.apply(this,args);};
    graphics.stroke=function(...args:any[]){strokes++;return oldStroke.apply(this,args);};
    const sample=()=>{curves=0;strokes=0;game.render(0);return {curves,strokes};};
    try{
      const simple=sample();game.settings.quality='standard';const standard=sample();
      e.kind='epicSteamer';game.enemies.reset();game.settings.quality='simple';
      const mark=e.guardCast.marks[0];mark.shape={kind:'disc',center:{x:850,y:400},radius:40,inner:0};
      const noSummon=sample();mark.summon='bun';const summon=sample();
      return {simple,standard,noSummon,summon};
    }finally{graphics.quadraticCurveTo=oldQuadratic;graphics.stroke=oldStroke;}
  });
  expect(result.simple.strokes).toBeGreaterThan(0);
  expect(result.standard.strokes).toBeGreaterThanOrEqual(result.simple.strokes);
  expect(result.standard.curves).toBeGreaterThan(result.simple.curves);
  expect(result.summon.curves).toBeGreaterThan(result.noSummon.curves);
  await page.screenshot({path:info.outputPath('summon-basket.png'),clip:{x:770,y:320,width:160,height:160}});
  await page.evaluate(()=>{
    const game=(window as any).__guardCueGame,state=game.session.state,e=state.enemies[0],mark=e.guardCast.marks[0];
    e.kind='eliteLotus';mark.shape={kind:'ring',center:{x:650,y:400},inner:66,radius:152};delete mark.summon;
    game.settings.quality='standard';game.enemies.reset();game.render(0);
  });
  await page.screenshot({path:info.outputPath('lotus-ring-warning.png'),clip:{x:490,y:240,width:320,height:320}});
  expect(errors).toEqual([]);
});
