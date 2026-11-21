import {expect,test} from '@playwright/test';

for(const quiet of [false,true])test(`frost has one visible shaver through its handoff (reduced motion: ${quiet})`,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const setup=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)throw new Error('Cocos prototype component unavailable');
    w.__frostGame=game;game.action('practice');game.action('trigger-skill','frost');game.session.pause();
    return {view:game.view,field:game.session.state.elementalFields?.[0]?.kind};
  });
  expect(setup).toEqual({view:'play',field:'frost'});
  for(const age of [0,.12,.25,.5,1.3,1.36]){
      const shown=await page.evaluate(({age,quiet})=>{
        const game=(window as any).__frostGame,field=game.session.state.elementalFields[0];
        game.settings.reduceMotion=quiet;game.session.state.time=field.bornAt+age;game.render(0);
        const icon=game.elemental.icons.get(field.id),props=game.deliveryUse.items;
        return {fieldIcon:!!icon?.node.activeInHierarchy,props:props.filter((item:any)=>item.node.activeInHierarchy).length};
      },{age,quiet});
      expect(shown,`age ${age}, reduced motion ${quiet}`).toEqual({fieldIcon:false,props:age<1.35?1:0});
  }
  expect(errors).toEqual([]);
});
