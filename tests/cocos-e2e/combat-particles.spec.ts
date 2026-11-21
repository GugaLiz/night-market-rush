import {expect,test} from '@playwright/test';

test('real dash events create bounded particles with quality and motion settings',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const states=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const g=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!g)throw new Error('Cocos prototype component unavailable');
    g.action('practice');const results=[];
    for(const [quality,reduced] of [['standard',false],['simple',false],['standard',true]] as const){
      if(g.view==='play')g.action('lab');g.action('reset-lab');
      g.settings.quality=quality;g.settings.reduceMotion=reduced;g.action('close-lab');
      const layer=g.weaponImpacts,graphics=layer.particleGraphics,original=graphics.circle.bind(graphics);
      let circles=0;graphics.circle=(...args:any[])=>{circles++;return original(...args);};
      const dashed=g.session.dash({x:1,y:0});g.session.pause();g.render(0);graphics.circle=original;
      results.push({quality,reduced,dashed,circles,stored:layer.particles.particles.length,
        parent:graphics.node.parent.name,active:graphics.node.activeInHierarchy});
    }
    return results;
  });
  expect(states).toEqual([
    {quality:'standard',reduced:false,dashed:true,circles:10,stored:10,parent:'Weapon event effects',active:true},
    {quality:'simple',reduced:false,dashed:true,circles:4,stored:4,parent:'Weapon event effects',active:true},
    {quality:'standard',reduced:true,dashed:true,circles:0,stored:0,parent:'Weapon event effects',active:true},
  ]);
  expect(errors).toEqual([]);
});
