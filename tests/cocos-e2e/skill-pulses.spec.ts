import {expect,test} from '@playwright/test';

test('soda, bell and dispatch draw live activation cues in all quality modes',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__pulseGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__pulseGame)throw new Error('Cocos prototype component unavailable');
    w.__pulseGame.action('practice');
  });
  for(const kind of ['soda','bell','dispatch'] as const){
    const sampled=await page.evaluate(kind=>{
      const g=(window as any).__pulseGame;if(g.view==='play')g.action('lab');g.action('reset-lab');g.action('trigger-skill',kind);g.session.pause();
      const pulses=g.deliveryUse.pulses,graphics=pulses.graphics,original=graphics.stroke.bind(graphics);
      let strokes=0;graphics.stroke=(...args:any[])=>{strokes++;return original(...args);};
      const use=pulses.uses.find((item:any)=>item.kind===kind);if(!use)throw new Error(`${kind} skill event was not captured`);
      const before=use.time-.005;pulses.update(before,{reduceMotion:false,quality:'standard'});
      const queuedBefore=pulses.uses.includes(use);
      g.session.state.time=use.time+.2;g.settings.quality='standard';g.settings.reduceMotion=false;g.render(0);
      const normal=strokes;strokes=0;g.settings.quality='simple';g.settings.reduceMotion=true;g.render(0);
      const reduced=strokes;strokes=0;g.session.state.time=use.time+1.36;g.render(0);
      const expired=pulses.uses.length;
      graphics.stroke=original;
      return {normal,reduced,expired,queuedBefore,active:pulses.node.activeInHierarchy,
        groundOrder:g.elemental.groundNode.getSiblingIndex(),enemyOrder:g.enemies.node.getSiblingIndex()};
    },kind);
    expect(sampled.queuedBefore,`${kind}: retain a future event for the interpolated frame`).toBe(true);
    expect(sampled.active,`${kind}: ground layer is active`).toBe(true);
    expect(sampled.groundOrder).toBeLessThan(sampled.enemyOrder);
    expect(sampled.normal,`${kind}: normal graphics`).toBeGreaterThan(0);
    expect(sampled.reduced,`${kind}: reduced-motion/simple graphics`).toBeGreaterThan(0);
    expect(sampled.expired,`${kind}: event expires`).toBe(0);
  }
  expect(errors).toEqual([]);
});
