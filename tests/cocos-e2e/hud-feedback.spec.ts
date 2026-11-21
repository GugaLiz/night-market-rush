import {expect,test,type Page} from '@playwright/test';

// Drive real Cocos HUD state in the development Web build. Values are set at
// boundaries explicitly; this is not a substitute for a naturally played run.
async function openHud(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)return null;w.__hudGame=game;return game.view;
  })).toBe('play');
  await page.evaluate(()=>{const game=(window as any).__hudGame;game.session.pause();game.session.state.player.maxHp=100;});
  return errors;
}

async function hudState(page:Page){return page.evaluate(async()=>{
  const w=window as any,cc=await w.System.import('cc'),root=w.__hudGame.ui.node;
  const find=(node:any,name:string):any=>node.name===name?node:node.children.map((child:any)=>find(child,name)).find(Boolean);
  const text=(node:any):string=>{
    if(!node)return '';
    const own=node.getComponent(cc.Label)?.string??'';
    return [own,...node.children.map(text)].filter(Boolean).join(' ');
  };
  const warning=find(root,'Low health warning'),badge=find(root,'Upgrade badge'),dash=find(root,'Dash');
  return {warningVisible:!!warning?.activeInHierarchy,warningText:text(warning),
    badgeVisible:!!badge?.activeInHierarchy,badgeText:text(badge),dashInteractable:dash?.getComponent(cc.Button)?.interactable??null};
});}

async function setHud(page:Page,values:{hp?:number;upgrade?:'frost'|'brine'|null;time?:number;dashReadyAt?:number}){
  await page.evaluate(v=>{
    const game=(window as any).__hudGame,state=game.session.state;
    if(v.hp!==undefined)state.player.hp=v.hp;
    if(v.upgrade!==undefined)state.market.upgrade=v.upgrade;
    if(v.time!==undefined)state.time=v.time;
    if(v.dashReadyAt!==undefined)state.player.dashReadyAt=v.dashReadyAt;
    state.player.dashUntil=0;
    game.ui.updateHud(game.hud());
  },values);
}

test('low-health threshold and both delivery-box upgrades remain visible and current',async({page})=>{
  const errors=await openHud(page);
  await setHud(page,{hp:30,upgrade:null});
  await expect.poll(()=>hudState(page)).toMatchObject({warningVisible:false,badgeVisible:false});
  await setHud(page,{hp:29,upgrade:'frost'});
  await expect.poll(()=>hudState(page)).toMatchObject({warningVisible:true,badgeVisible:true});
  expect((await hudState(page)).warningText).toMatch(/生命|血/);
  expect((await hudState(page)).badgeText).toContain('碎冰箱');
  await setHud(page,{hp:30,upgrade:'brine'});
  await expect.poll(()=>hudState(page)).toMatchObject({warningVisible:false,badgeVisible:true});
  expect((await hudState(page)).badgeText).toContain('泡菜箱');
  await setHud(page,{hp:80,upgrade:null});
  await expect.poll(()=>hudState(page)).toMatchObject({warningVisible:false,badgeVisible:false});
  expect(errors).toEqual([]);
});

async function dashColours(page:Page){
  const image=await page.screenshot({clip:{x:1186,y:588,width:64,height:64}});
  return page.evaluate(async(base64:string)=>{
    const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let green=0,orange=0;
    // Exclude the outline; text pixels are neutral and do not match the fills.
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(Math.hypot(x-32,y-32)<29){
      const offset=(y*64+x)*4,r=data[offset],g=data[offset+1],b=data[offset+2];
      if(r>=80&&r<=125&&g>=140&&g<=180&&b>=115&&b<=155)green++;
      if(r>=230&&g>=120&&g<=180&&b>=35&&b<=80)orange++;
    }
    return {green,orange};
  },image.toString('base64'));
}

test('dash cooldown changes its visible background and updates the keyboard and semantic state',async({page})=>{
  const errors=await openHud(page);
  const dash=page.getByRole('button',{name:/冲刺/});
  await setHud(page,{time:10,dashReadyAt:13});
  await expect.poll(()=>hudState(page)).toMatchObject({dashInteractable:false});
  await expect(dash).toBeDisabled();
  await expect(dash).toHaveAccessibleName(/冲刺.*冷却/);
  const start=await dashColours(page);
  await setHud(page,{time:10.75,dashReadyAt:13});
  const quarter=await dashColours(page);
  await setHud(page,{time:11.5,dashReadyAt:13});
  await expect(dash).toBeDisabled();
  const halfway=await dashColours(page);
  await setHud(page,{time:12.25,dashReadyAt:13});
  const threeQuarters=await dashColours(page);
  await setHud(page,{time:13,dashReadyAt:13});
  await expect.poll(()=>hudState(page)).toMatchObject({dashInteractable:true});
  await expect(dash).toBeEnabled();
  await expect(dash).toHaveAccessibleName(/冲刺/);
  const ready=await dashColours(page);
  // A circular segment accidentally closed along its chord looks plausible at
  // halfway; at one quarter it is far too small. Check intermediate areas.
  expect(quarter.green,'one-quarter cooldown should fill an actual wedge').toBeGreaterThan(start.green+350);
  expect(halfway.green).toBeGreaterThan(quarter.green+250);
  expect(threeQuarters.green).toBeGreaterThan(halfway.green+250);
  expect(ready.orange,'the ready button should regain its orange fill').toBeGreaterThan(start.orange+100);
  // Resume the real simulation and exercise its normal keyboard dash handler.
  const oldReady=await page.evaluate(()=>{const g=(window as any).__hudGame;g.session.resume();return g.session.state.player.dashReadyAt;});
  await page.locator('#GameCanvas').focus();await page.keyboard.press('Space');
  await expect.poll(()=>page.evaluate(()=>(window as any).__hudGame.session.state.player.dashReadyAt)).toBeGreaterThan(oldReady);
  expect(errors).toEqual([]);
});
