import {expect,test,type Page} from '@playwright/test';

// These checks drive the real Cocos development build using controlled state;
// they do not claim to be a complete natural playthrough or device test.
async function openHud(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)return null;w.__statusGame=game;return game.view;
  })).toBe('play');
  await page.evaluate(()=>{const game=(window as any).__statusGame;game.session.pause();});
  return errors;
}

async function statusCards(page:Page){return page.evaluate(async()=>{
  const w=window as any,cc=await w.System.import('cc'),root=w.__statusGame.ui.node;
  const find=(node:any,name:string):any=>node.name===name?node:node.children.map((child:any)=>find(child,name)).find(Boolean);
  return Array.from({length:6},(_,index)=>{
    const card=find(root,`Status card ${index}`);
    if(!card?.activeInHierarchy)return null;
    const icon=find(card,'Status icon'),label=find(card,'Status label'),time=find(card,'Status time');
    const sprite=icon?.getComponent(cc.Sprite),iconLabel=icon?.getComponent(cc.Label),graphics=icon?.getComponent(cc.Graphics);
    const rect=card.getComponent(cc.UITransform).getBoundingBoxToWorld(),origin=root.worldPosition;
    const labelComponent=label?.getComponent(cc.Label),timeComponent=time?.getComponent(cc.Label);
    const cssScale=cc.view.getScaleY()/Math.max(1,cc.screen.devicePixelRatio);
    return {label:labelComponent?.string??'',time:timeComponent?.string??'',
      labelCssPx:(labelComponent?.actualFontSize??0)*cssScale,timeCssPx:(timeComponent?.actualFontSize??0)*cssScale,
      iconVisible:!!icon?.activeInHierarchy&&!!(sprite?.enabledInHierarchy&&sprite.spriteFrame||iconLabel?.enabledInHierarchy&&iconLabel.string||graphics?.enabledInHierarchy),
      opacity:card.getComponent(cc.UIOpacity)?.opacity??255,
      x:rect.x+rect.width/2-origin.x,y:rect.y+rect.height/2-origin.y,width:rect.width,height:rect.height};
  }).filter(Boolean) as Array<{label:string;time:string;labelCssPx:number;timeCssPx:number;iconVisible:boolean;opacity:number;x:number;y:number;width:number;height:number}>;
});}

async function installStatuses(page:Page){await page.evaluate(()=>{
  const game=(window as any).__statusGame,s=game.session.state;s.time=10;
  s.player.x=640;s.player.y=360;s.player.bubbleUntil=13;s.player.skateUntil=14;s.player.stampUntil=15;
  s.effects.hookUntil=16;s.effects.dispatchUntil=17;
  s.zones=[{id:999,kind:'route',x:600,y:360,radius:0,bornAt:9,expiresAt:18,angle:0,length:420,width:110,hp:1}];
  game.ui.updateHud(game.hud());
});}

test('shows independent status cards, dims the unused route and clears expired effects',async({page})=>{
  const errors=await openHud(page);await installStatuses(page);
  await expect.poll(async()=>(await statusCards(page)).length).toBe(6);
  const active=await statusCards(page);
  expect(active.every(card=>card.iconVisible&&card.label&&/\d/.test(card.time))).toBe(true);
  const route=active.find(card=>card.label.includes('移速'));
  expect(route).toBeTruthy();
  await page.evaluate(()=>{const game=(window as any).__statusGame;game.session.state.player.x=500;game.ui.updateHud(game.hud());});
  const outside=await statusCards(page),inactiveRoute=outside.find(card=>card.label.includes('踏上路线'));
  expect(inactiveRoute).toBeTruthy();expect(inactiveRoute!.opacity).toBeLessThan(route!.opacity);
  await page.evaluate(()=>{const game=(window as any).__statusGame;game.session.state.time=18.1;game.ui.updateHud(game.hud());});
  await expect.poll(async()=>(await statusCards(page)).length).toBe(0);
  expect(errors).toEqual([]);
});

async function comboState(page:Page){return page.evaluate(async()=>{
  const w=window as any,cc=await w.System.import('cc'),root=w.__statusGame.ui.node;
  const find=(node:any,name:string):any=>node.name===name?node:node.children.map((child:any)=>find(child,name)).find(Boolean);
  const panel=find(root,'Combo panel'),count=find(root,'Combo count'),burst=find(root,'Combo burst'),fuse=find(root,'Combo fuse');
  const rect=fuse?.getComponent(cc.UITransform)?.getBoundingBoxToWorld();
  return {visible:!!panel?.activeInHierarchy,count:count?.getComponent(cc.Label)?.string??'',
    burstVisible:!!burst?.activeInHierarchy&&!!burst.getComponent(cc.Label)?.string,burst:burst?.getComponent(cc.Label)?.string??'',
    fuse:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null};
});}

async function fuseImage(page:Page){
  const state=await comboState(page);if(!state.fuse)throw new Error('Missing combo fuse');
  const r=state.fuse;
  // This check runs at the native 1280×720 design size and does not include
  // changing numeric text or the combat scene behind the panel.
  return page.screenshot({clip:{x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(720-r.y-r.height)),
    width:Math.max(1,Math.ceil(r.width)),height:Math.max(1,Math.ceil(r.height))}});
}

test('shows combo duration and only shows burst for kills within the short window',async({page})=>{
  const errors=await openHud(page);
  const step=async(time:number,kills:number,combo:number,until:number)=>page.evaluate(v=>{
    const game=(window as any).__statusGame,s=game.session.state;s.time=v.time;s.kills=v.kills;s.combo=v.combo;s.comboUntil=v.until;
    game.ui.updateHud(game.hud());
  },{time,kills,combo,until});
  await step(20,0,0,0);
  await step(20.01,1,1,22.5);await step(20.2,2,2,22.6);await step(20.37,3,3,22.7);await step(20.4,4,4,22.8);
  let state=await comboState(page);expect(state.visible).toBe(true);expect(state.burstVisible).toBe(false);
  await step(20.45,5,5,23);await step(20.5,6,6,23);
  state=await comboState(page);expect(state.burstVisible).toBe(true);expect(state.burst).toContain('4');expect(state.count).toContain('6');
  const early=await fuseImage(page);
  await step(21.3,6,6,23);expect((await comboState(page)).burstVisible).toBe(true);
  const later=await fuseImage(page);expect(early.equals(later),'combo fuse should contract as its expiry approaches').toBe(false);
  await step(21.36,6,6,23);expect((await comboState(page)).burstVisible).toBe(false);
  await step(23,6,6,23);expect((await comboState(page)).visible).toBe(false);
  expect(errors).toEqual([]);
});

async function hudBlockers(page:Page){return page.evaluate(async()=>{
  const w=window as any,cc=await w.System.import('cc'),root=w.__statusGame.ui.node;
  const find=(node:any,name:string):any=>node.name===name?node:node.children.map((child:any)=>find(child,name)).find(Boolean);
  const origin=root.worldPosition;
  return ['Battle ledger','Timing','Pause','Boss panel','Combo panel','Dash','Weapon card','Open lab'].map(name=>{
    const node=find(root,name);if(!node?.activeInHierarchy)return null;
    const rect=node.getComponent(cc.UITransform).getBoundingBoxToWorld();
    return {name,x:rect.x+rect.width/2-origin.x,y:rect.y+rect.height/2-origin.y,width:rect.width,height:rect.height};
  }).filter(Boolean) as Array<{name:string;x:number;y:number;width:number;height:number}>;
});}

test('six status cards remain within simulated short-screen safe insets',async({page})=>{
  await page.setViewportSize({width:932,height:430});const errors=await openHud(page);
  await page.evaluate(()=>{(window as any).__statusGame.ui.setSafeInsets({left:40,right:80,top:25,bottom:20});});
  await installStatuses(page);
  await page.evaluate(()=>{
    const game=(window as any).__statusGame,s=game.session.state;
    game.session.game.spawnEnemy('epicHotpot',{x:900,y:400});s.combo=2;s.comboUntil=s.time+2;game.ui.updateHud(game.hud());
  });
  await expect.poll(async()=>{const cards=await statusCards(page);return cards.length===6&&cards.every(card=>card.labelCssPx>=11.8&&card.timeCssPx>=11.8);},
    {message:'status names and times should render at least 11.8 CSS px in the simulated short viewport'}).toBe(true);
  const cards=await statusCards(page);expect(cards).toHaveLength(6);
  const blockers=await hudBlockers(page);expect(blockers.some(blocker=>blocker.name==='Boss panel')).toBe(true);
  expect(blockers.some(blocker=>blocker.name==='Combo panel')).toBe(true);
  for(const card of cards){
    expect(card.x-card.width/2).toBeGreaterThanOrEqual(-600);
    expect(card.x+card.width/2).toBeLessThanOrEqual(560);
    expect(card.y-card.height/2).toBeGreaterThanOrEqual(-340);
    expect(card.y+card.height/2).toBeLessThanOrEqual(335);
    for(const blocker of blockers){
      const overlapX=Math.abs(card.x-blocker.x)<(card.width+blocker.width)/2;
      const overlapY=Math.abs(card.y-blocker.y)<(card.height+blocker.height)/2;
      expect(overlapX&&overlapY,`status card should not overlap ${blocker.name}`).toBe(false);
    }
  }
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const a=cards[i],b=cards[j];
    const overlapX=Math.abs(a.x-b.x)<(a.width+b.width)/2,overlapY=Math.abs(a.y-b.y)<(a.height+b.height)/2;
    expect(overlapX&&overlapY,'status cards should not overlap').toBe(false);
  }
  expect(errors).toEqual([]);
});
