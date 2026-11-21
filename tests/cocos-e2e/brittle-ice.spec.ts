import {expect,test} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('frost upgrade marks only actively frozen targets, including simple reduced-motion mode',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ready=page.waitForEvent('console',{predicate:m=>m.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)throw new Error('Development game unavailable');
    w.__brittleGame=game;game.action('practice');game.action('spawn',{kind:'bun',group:false});
    game.session.pause();game.show('play');
    const state=game.session.state,enemy=state.enemies[0];
    if(!enemy)throw new Error('Practice enemy unavailable');
    state.enemies.splice(1);enemy.x=enemy.px=650;enemy.y=enemy.py=400;
    state.player.x=state.player.px=150;state.player.y=state.player.py=580;
    enemy.hp=enemy.maxHp=9999;enemy.spawnAt=state.time-2;enemy.hurtAt=-999;
    enemy.frostUntil=state.time+10;enemy.stunUntil=state.time+10;
    state.market.upgrade=null;game.settings.shake=false;game.settings.quality='simple';game.settings.reduceMotion=true;game.render(0);
  });
  const snap=async()=>{
    await page.waitForTimeout(100);
    return page.screenshot({clip:{x:560,y:260,width:180,height:180},animations:'disabled'});
  };
  for(const quality of ['simple','standard'] as const)for(const reduceMotion of [true,false]){
    await page.evaluate(({quality,reduceMotion})=>{
      const g=(window as any).__brittleGame,e=g.session.state.enemies[0];
      e.frostUntil=g.session.state.time+10;delete e.chilledUntil;g.session.state.market.upgrade=null;
      g.settings.quality=quality;g.settings.reduceMotion=reduceMotion;g.render(0);
    },{quality,reduceMotion});
    const normal=await snap();
    await page.evaluate(()=>{const g=(window as any).__brittleGame;g.session.state.market.upgrade='frost';g.render(0);});
    const marked=await snap();expect(marked.equals(normal),`${quality}, reduced=${reduceMotion}: active frost has a visible marker`).toBe(false);
    if(reduceMotion&&quality==='simple'){
      await writeFile(info.outputPath('frozen-unmodified.png'),normal);
      await writeFile(info.outputPath('frost-upgrade.png'),marked);
    }
    await page.evaluate(()=>{
      const g=(window as any).__brittleGame,e=g.session.state.enemies[0];
      e.chilledUntil=e.frostUntil;delete e.frostUntil;g.render(0);
    });
    const chilled=await snap();expect(chilled.equals(normal),`${quality}, reduced=${reduceMotion}: ordinary chill does not show marker`).toBe(true);
  }
  expect(errors).toEqual([]);
});
