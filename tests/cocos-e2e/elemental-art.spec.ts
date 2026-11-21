import {expect,test} from '@playwright/test';

test('warm wok and brine art load, animate and clean up in the Creator build',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__elementalGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__elementalGame)throw new Error('Cocos prototype component unavailable');
  });
  await expect.poll(()=>page.evaluate(()=>{
    const e=(window as any).__elementalGame.elemental;return !!(e.warm&&e.broth&&e.rim&&e.vapor&&e.pool);
  }),{timeout:30000}).toBe(true);
  const sample=await page.evaluate(()=>{
    const g=(window as any).__elementalGame;g.action('practice');g.action('trigger-skill','vortex');g.session.pause();
    const field=g.session.state.elementalFields.find((f:any)=>f.kind==='vortex');
    g.session.state.time=field.bornAt+.5;g.render(0);
    const icon=g.elemental.icons.get(field.id),first=icon.broth.rotor.angle;
    g.session.state.time=field.bornAt+1;g.render(0);
    const second=icon.broth.rotor.angle;
    g.settings.reduceMotion=true;g.render(0);const quiet=icon.broth.rotor.angle;
    return {warm:icon.sprite.spriteFrame===g.elemental.warm,mask:icon.broth.mask.activeInHierarchy,first,second,quiet,
      rim:icon.rim.node.activeInHierarchy,rimFrame:icon.rim.sprite.spriteFrame===g.elemental.rim,
      samePosition:icon.rim.node.position.equals(icon.node.position),sameSize:icon.rim.transform.contentSize.equals(icon.transform.contentSize),
      sameAlpha:icon.rim.opacity.opacity===icon.opacity.opacity};
  });
  expect(sample.warm).toBe(true);expect(sample.mask).toBe(true);expect(sample.first).not.toBe(sample.second);expect(sample.quiet).toBe(0);
  expect(sample).toMatchObject({rim:true,rimFrame:true,samePosition:true,sameSize:true,sameAlpha:true});
  const brine=await page.evaluate(()=>{
    const g=(window as any).__elementalGame;g.action('lab');g.action('trigger-skill','poison');g.session.pause();
    const field=g.session.state.elementalFields.find((f:any)=>f.kind==='poison');
    g.session.state.time=field.bornAt+1;g.settings.quality='standard';g.render(0);
    const active=(items:any[])=>items.filter(item=>item.node.activeInHierarchy).length;
    const standard={pool:active(g.elemental.poolStamps),vapor:active(g.elemental.vaporStamps)};
    g.settings.quality='simple';g.render(0);const simple={pool:active(g.elemental.poolStamps),vapor:active(g.elemental.vaporStamps)};
    g.session.state.time=field.expiresAt+.01;g.render(0);const expired={pool:active(g.elemental.poolStamps),vapor:active(g.elemental.vaporStamps),rims:g.elemental.rims.children.filter((n:any)=>n.activeInHierarchy).length};
    return {standard,simple,expired};
  });
  expect(brine).toEqual({standard:{pool:1,vapor:13},simple:{pool:1,vapor:8},expired:{pool:0,vapor:0,rims:0}});
  expect(errors).toEqual([]);
});
