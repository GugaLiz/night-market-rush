import {expect,test,type Page} from '@playwright/test';

const key='night-market-rush.save.v4',legacyKey='night-market-rush.save.v1';
const build=process.env.COCOS_CANDIDATE_TEST_BUILD??'web-storage-candidate1121';
const settings={mode:'joystick',joystickSize:'medium',hand:'right',sensitivity:'medium',music:.35,sfx:.7,muted:true,reduceMotion:false,shake:true,quality:'standard',haptics:true};
const best={score:200,time:19,rulesVersion:'night-market-4.0',date:'2026-11-18T00:00:00Z'};
const go=async(page:Page,label:string)=>{const target=page.getByRole('button',{name:label,exact:true});await target.focus();await page.keyboard.press('Enter');};
const saved=async(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null'),key);
async function candidate(page:Page){
  await page.goto(`/cocos/build/${build}/`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'开始挑战',exact:true})).toBeAttached({timeout:45000});
  await expect(page.getByRole('button',{name:'配送试验场',exact:true})).toHaveCount(0);
}
async function seed(page:Page,values:Record<string,string>){
  await page.goto('/dist/');
  await page.evaluate(values=>{localStorage.clear();for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);},values);
}
async function sound(page:Page){await go(page,'操作设置');await go(page,'声音');}

test('legacy preferences, tutorial and result survive restart and old-site rollback',async({page})=>{
  const legacy={version:1,settings,best:{...best,rulesVersion:'night-market-3.0'},tutorialSeen:false};
  await seed(page,{[legacyKey]:JSON.stringify(legacy)});await candidate(page);
  await sound(page);await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','true');
  await go(page,'应用');await go(page,'开始挑战');
  await expect.poll(async()=>(await saved(page))?.tutorialSeen).toBe(true);
  // Establish the defeat boundary directly; result buttons and persistence use
  // the real release candidate component, not a fabricated SaveStore call.
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene().getChildByName('Canvas').getComponent('AtlasSmoke');
    if(!game)throw new Error('Game component unavailable');
    game.session.pause();game.session.state.kills=246;game.session.state.ended=true;
    game.session.state.player.hp=0;game.show('revive');
  });
  await go(page,'结束本局');await expect.poll(async()=>(await saved(page))?.best?.score).toBe(246);
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),legacyKey)).toEqual(legacy);
  await candidate(page);
  await expect(page.getByText(/本地最佳击败 246 只/)).toBeAttached();
  await page.goto('/dist/');await expect(page.locator('#game-shell')).toHaveAttribute('data-view','home',{timeout:45000});
  await expect(page.getByText('246 只',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'操作设置',exact:true}).click();await page.getByRole('tab',{name:'声音'}).click();
  await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','true');
});

test('v4 settings and best load, settings update and persist after refresh',async({page})=>{
  await seed(page,{[key]:JSON.stringify({version:1,settings,best,tutorialSeen:true})});await candidate(page);
  const debug=await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    const game=cc.director.getScene().getChildByName('Canvas').getComponent('AtlasSmoke');
    game.action('practice');return {view:game.view,practice:game.session.state.practice};
  });
  expect(debug).toEqual({view:'home',practice:false});
  await expect(page.getByText(/本地最佳击败 200 只/)).toBeAttached();
  await sound(page);await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','true');
  await page.getByRole('switch',{name:'总静音'}).focus();await page.keyboard.press('Enter');await go(page,'应用');
  expect((await saved(page)).settings.muted).toBe(false);expect((await saved(page)).best).toEqual(best);
  await candidate(page);await sound(page);
  await expect(page.getByRole('switch',{name:'总静音'})).toHaveAttribute('aria-checked','false');
});

test('unknown future schema is not overwritten by settings or tutorial',async({page})=>{
  const future=JSON.stringify({version:99,settings,best,tutorialSeen:false});
  await seed(page,{[key]:future});await candidate(page);
  await sound(page);await page.getByRole('switch',{name:'总静音'}).focus();await page.keyboard.press('Enter');await go(page,'应用');
  await go(page,'开始挑战');expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(future);
});

test('a stale tab does not claim a new record over a newer higher score',async({page,context})=>{
  await seed(page,{[key]:JSON.stringify({version:1,settings,best,tutorialSeen:true})});
  const second=await context.newPage();await candidate(page);await candidate(second);
  await go(page,'开始挑战');await go(second,'开始挑战');
  const finish=async(target:Page,score:number)=>{
    await target.evaluate(async score=>{
      const w=window as any,cc=await w.System.import('cc');
      const game=cc.director.getScene().getChildByName('Canvas').getComponent('AtlasSmoke');
      game.session.pause();game.session.state.kills=score;game.session.state.ended=true;
      game.session.state.player.hp=0;game.show('revive');
    },score);
    await go(target,'结束本局');
  };
  await finish(page,500);await expect.poll(async()=>(await saved(page)).best.score).toBe(500);
  await finish(second,246);expect((await saved(second)).best.score).toBe(500);
  await expect(second.getByRole('dialog',{name:'本局结果'})).not.toContainText('新纪录');
});

test('damaged record is backed up and storage denial stays playable',async({page})=>{
  await seed(page,{[key]:'{corrupt'});await candidate(page);
  expect(await page.evaluate(k=>Object.keys(localStorage).some(name=>name.startsWith(k+'.recovery.')&&localStorage.getItem(name)==='{corrupt'),key)).toBe(true);
  await sound(page);await go(page,'应用');expect((await saved(page)).version).toBe(1);
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};});
  await candidate(page);await sound(page);await page.getByRole('switch',{name:'总静音'}).focus();await page.keyboard.press('Enter');await go(page,'应用');
  await expect(page.getByText(/设置仅在本次打开期间保留/)).toBeAttached();
  await go(page,'开始挑战');await expect(page.locator('#GameCanvas')).toBeFocused();
});
