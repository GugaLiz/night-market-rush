import {expect,test} from '@playwright/test';

test('bowl and kettle attack cues render and stop on interruption',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const ready=page.waitForEvent('console',{predicate:m=>m.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const result=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)throw new Error('Development game unavailable');
    w.__rangedGame=game;
    game.action('practice');game.action('spawn',{kind:'bowl',group:false});game.session.pause();game.show('play');
    const state=game.session.state,e=state.enemies[0];if(!e)throw new Error('Practice bowl unavailable');
    state.enemies.splice(1);state.player.x=state.player.px=150;state.player.y=state.player.py=580;
    e.x=e.px=650;e.y=e.py=400;e.facing=1;e.spawnAt=state.time-2;e.hurtAt=-999;e.stunUntil=0;e.hp=e.maxHp=9999;
    e.shotAngle=0;e.shotWarnUntil=0;e.volleyRemaining=0;state.enemyShots=[];
    game.settings.reduceMotion=true;game.settings.quality='simple';game.settings.shake=false;
    const graphics=game.enemies.status,original=graphics.stroke;let strokes=0;
    graphics.stroke=function(...args:any[]){strokes++;return original.apply(this,args);};
    const sample=()=>{strokes=0;game.render(0);return strokes;};
    try{
      const idle=sample();
      e.shotWarnUntil=state.time+.1;const bowl=sample();
      e.stunUntil=state.time+1;const stunned=sample();e.stunUntil=0;
      e.kind='eliteKettle';const kettle=sample();
      e.shotWarnUntil=0;
      state.enemyShots=[{id:999,ownerId:e.id,kind:'tea',x:760,y:385,px:760,py:385,vx:100,vy:0,radius:7,damage:1,bornAt:state.time-.13,expiresAt:state.time+1}];
      const jet=sample();
      state.enemyShots[0].ownerId=e.id+100;const otherPot=sample();
      state.enemyShots[0].ownerId=e.id;game.render(0);
      return {idle,bowl,stunned,kettle,jet,otherPot};
    }finally{graphics.stroke=original;}
  });
  expect(result.bowl).toBeGreaterThan(result.idle);
  expect(result.stunned).toBe(result.idle);
  expect(result.kettle).toBeGreaterThan(result.idle);
  expect(result.jet).toBeGreaterThan(result.otherPot);
  await page.screenshot({path:info.outputPath('kettle-tea-stream.png'),clip:{x:550,y:220,width:240,height:230}});
  await page.evaluate(()=>{
    const game=(window as any).__rangedGame,state=game.session.state,e=state.enemies[0];
    e.kind='bowl';e.shotWarnUntil=state.time+.1;state.enemyShots=[];game.enemies.reset();game.render(0);
  });
  await page.screenshot({path:info.outputPath('bowl-noodle.png'),clip:{x:550,y:220,width:240,height:230}});
  expect(errors).toEqual([]);
});
