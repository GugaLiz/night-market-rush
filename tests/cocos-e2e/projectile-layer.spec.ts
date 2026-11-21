import {expect,test} from '@playwright/test';

test('weapon projectiles render in front of the courier but below foreground warnings',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  const info=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const g=cc.director.getScene().getChildByName('Canvas').getComponent('AtlasSmoke');w.__layerGame=g;
    g.session.start(42,true);g.show('play');g.session.pause();
    const s=g.session.state;s.player.x=640;s.player.y=360;s.player.px=640;s.player.py=360;s.player.vx=0;s.player.vy=0;
    s.time=1;s.projectiles=[{id:999,attackId:998,kind:'spirit',x:640,y:324,px:640,py:324,vx:1,vy:0,radius:17,
      originX:640,originY:324,targetX:1000,targetY:324,bornAt:.5,expiresAt:5,travelled:300,maxDistance:500,
      phase:'out',hitIds:[],phaseHitIds:[],targetId:-1,retargets:0,nextHitAt:0,hits:0}];
    g.render(0);
    const i=(node:any)=>node.getSiblingIndex();
    const projectile=g.projectiles.sprites.get(999).node,head=g.courier.parts.head.node;
    const shot=projectile.getComponent(cc.UITransform).getBoundingBoxToWorld(),body=head.getComponent(cc.UITransform).getBoundingBoxToWorld();
    return {pickups:i(g.pickups.floatingNode),courier:i(g.courier.node),delivery:i(g.deliveryUse.node),weapon:i(g.projectiles.node),
      status:i(g.statusZones.frontNode),elemental:i(g.elemental.foregroundNode),ultimate:i(g.ultimate.airNode),melee:i(g.melee.effectNode),
      outline:i(g.skillFields.outlineNode),warning:i(g.enemies.warningNode),enemyShot:i(g.projectiles.enemyShotNode),
      overlap:shot.intersects(body),spriteActive:projectile.activeInHierarchy};
  });
  expect(info.pickups).toBeLessThan(info.courier);
  expect(info.courier).toBeLessThan(info.delivery);
  expect(info.delivery).toBeLessThan(info.weapon);
  for(const key of ['status','elemental','ultimate','melee','outline','warning','enemyShot'] as const)expect(info.weapon,key).toBeLessThan(info[key]);
  expect(info.overlap).toBe(true);expect(info.spriteActive).toBe(true);
  // The projectile lies over the head. Removing only its sprite must change
  // pixels in the overlapping head area; simulation state remains unchanged.
  const visible=await page.screenshot({clip:{x:610,y:270,width:60,height:65}});
  await page.evaluate(()=>(window as any).__layerGame.projectiles.sprites.get(999).node.active=false);
  await page.waitForTimeout(100);
  const hidden=await page.screenshot({clip:{x:610,y:270,width:60,height:65}});
  expect(visible.equals(hidden)).toBe(false);
  expect(errors).toEqual([]);
});
