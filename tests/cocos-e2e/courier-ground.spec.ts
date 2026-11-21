import {expect,test} from '@playwright/test';

test('ground marker and frozen dash poses follow simulation and quality settings',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const state=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const g=cc.director.getScene().getChildByName('Canvas').getComponent('AtlasSmoke');w.__groundGame=g;
    g.session.start(42,true);g.show('play');g.session.pause();g.settings.quality='standard';g.settings.reduceMotion=false;
    const s=g.session.state;s.player.x=570;s.player.y=370;s.player.px=570;s.player.py=370;s.player.dashUntil=3;
    s.player.moveDirection={x:1,y:0};s.player.vx=100;s.player.vy=0;s.time=1;
    s.weapon.kind='tongs';s.weapon.attack={id:1,kind:'tongs',phase:'active',angle:0,startedAt:.9,releaseAt:1,endsAt:1.4,targetId:-1,hitIds:[],blocked:false,swingSide:1};
    const before=JSON.stringify(s);g.render(.06);
    const unchanged=JSON.stringify(s)===before,first=g.courierGround.ghosts[0],firstX=first.position.x;
    s.time=1.06;s.player.x=610;g.render(.06);s.time=1.12;s.player.x=650;g.render(.06);
    const nodes=g.courierGround.ghosts.filter(Boolean),tongs=first.getChildByName('Articulated tongs');
    const index=(node:any)=>node.getSiblingIndex();
    return {unchanged,firstX,firstXAfter:first.position.x,count:nodes.length,active:nodes.filter((node:any)=>node.activeInHierarchy).length,
      opacity:nodes.map((node:any)=>node.getComponent(cc.UIOpacity)?.opacity),tongsActive:tongs?.activeInHierarchy,
      maskCount:tongs?.children.filter((pivot:any)=>!!pivot.children[0]?.getComponent(cc.Mask)).length,
      ground:index(g.courierGround.node),courier:index(g.courier.node),projectiles:index(g.projectiles.node)};
  });
  expect(state.unchanged).toBe(true);expect(state.count).toBe(3);expect(state.active).toBe(3);
  expect(state.firstX).toBe(state.firstXAfter);expect(state.opacity[0]).toBeLessThan(state.opacity[2]);
  expect(state.tongsActive).toBe(true);expect(state.maskCount).toBe(3);
  expect(state.ground).toBeLessThan(state.courier);expect(state.courier).toBeLessThan(state.projectiles);
  const visible=await page.screenshot({clip:{x:500,y:240,width:210,height:170}});
  await page.evaluate(()=>{(window as any).__groundGame.courierGround.node.active=false;});await page.waitForTimeout(100);
  const hidden=await page.screenshot({clip:{x:500,y:240,width:210,height:170}});
  expect(visible.equals(hidden)).toBe(false);
  const pausedBefore=await page.evaluate(async()=>{
    const cc=await (window as any).System.import('cc');const g=(window as any).__groundGame;g.courierGround.node.active=true;g.action('pause');
    return g.courierGround.ghosts.map((node:any)=>node&&({active:node.active,x:node.position.x,opacity:node.getComponent(cc.UIOpacity)?.opacity}));
  });
  await page.waitForTimeout(250);
  const pausedAfter=await page.evaluate(async()=>{
    const cc=await (window as any).System.import('cc');const g=(window as any).__groundGame;return g.courierGround.ghosts.map((node:any)=>node&&({active:node.active,x:node.position.x,opacity:node.getComponent(cc.UIOpacity)?.opacity}));
  });
  expect(pausedAfter).toEqual(pausedBefore);
  const policies=await page.evaluate(()=>{
    const g=(window as any).__groundGame,s=g.session.state;g.courierGround.node.active=true;
    g.courierGround.update(s,{quality:'simple',reduceMotion:false},true);
    const simple=g.courierGround.ghosts.filter((node:any)=>node?.active).length;
    s.time=1.2;g.courierGround.update(s,{quality:'standard',reduceMotion:true},true);
    const reduced=g.courierGround.ghosts.filter((node:any)=>node?.active).length;
    g.courierGround.update(s,{quality:'standard',reduceMotion:false},true);
    const resumed=g.courierGround.ghosts.filter((node:any)=>node?.active).length;
    g.courierGround.reset();const reset=g.courierGround.ghosts.filter((node:any)=>node?.active).length;
    return {simple,reduced,resumed,reset};
  });
  expect(policies).toEqual({simple:0,reduced:0,resumed:1,reset:0});
  expect(errors).toEqual([]);
});
