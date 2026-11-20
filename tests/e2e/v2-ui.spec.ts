import {test,expect,type Page} from '@playwright/test';
import {ELEMENTAL_KINDS,ELITE_KINDS,ENEMY_NAMES,EPIC_KINDS,isGuard,WEAPON_KINDS,SKILL_KINDS,SKILL_NAMES,type EnemyKind,type GameState} from '../../src/shared/types';
import {CONFIG} from '../../src/core/config';
import {SAVE_KEY} from '../../src/platform/storage';
import {clayFrames} from '../../src/render/clay-frames';
const state=(page:Page)=>page.evaluate(()=>(window as unknown as {__gameTest:{snapshot():GameState}}).__gameTest.snapshot());
const view=(page:Page,name:string)=>expect(page.locator('#game-shell')).toHaveAttribute('data-view',name);
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{const found:string[]=[];errors.set(page,found);page.on('pageerror',error=>found.push(error.message));await page.goto('/');await view(page,'home');});
test.afterEach(async({page})=>{expect(errors.get(page),'uncaught browser exceptions').toEqual([]);});

async function expectCatalogArt(page:Page,kinds:readonly string[],frames:Record<string,readonly number[]>){
  const icons=await page.locator('.catalog-grid .atlas-icon').evaluateAll(nodes=>nodes.map(node=>{
    if(node instanceof HTMLImageElement)return {kind:node.dataset.icon,src:node.src};
    const crop=node.querySelector('svg')!;
    const {x,y,width,height}=crop.viewBox.baseVal;
    return {kind:node.getAttribute('data-icon'),frame:[x,y,width,height],viewport:[crop.width.baseVal.value,crop.height.baseVal.value]};
  }));
  expect(icons.map(item=>item.kind)).toEqual(kinds);
  for(const [i,art] of icons.entries()){
    if(kinds[i]==='health'){expect(art.src).toMatch(/\/clay-soup-dumpling\.webp$/);continue;}
    expect(art.frame).toEqual(frames[kinds[i]]);
    expect(art.viewport).toEqual(frames[kinds[i]].slice(2));
  }
}

test('complete catalog and safe laboratory lifecycle with all weapons, skills and monsters',async({page},info)=>{
  await page.getByRole('button',{name:'夜市图鉴',exact:true}).click();
  await expect(page.locator('.catalog-grid article')).toHaveCount(10);
  await expectCatalogArt(page,WEAPON_KINDS,clayFrames.weapons);
  await page.getByRole('tab',{name:`${SKILL_KINDS.length} 种技能`}).click();await expect(page.locator('.catalog-grid article')).toHaveCount(SKILL_KINDS.length);
  await expectCatalogArt(page,SKILL_KINDS,{...clayFrames.supplies,...clayFrames.ultimates,...clayFrames.elementals});
  await page.screenshot({animations:'disabled',path:info.outputPath('v2-catalog.png')});
  const kinds=Object.keys(ENEMY_NAMES) as EnemyKind[];
  const enemyTabLabel=`${kinds.length} 种怪物`;
  const enemyTab=page.getByRole('tab',{name:enemyTabLabel});
  await enemyTab.click();
  await expect(enemyTab).toHaveAttribute('aria-selected','true');
  const enemies=page.getByRole('tabpanel',{name:enemyTabLabel});
  const groups=[
    {name:'普通怪',kinds:kinds.filter(kind=>!isGuard(kind)),frames:{...clayFrames.streetSnacks,...clayFrames.mascots}},
    {name:'精英怪',kinds:ELITE_KINDS,frames:{...clayFrames.mascots,...clayFrames.elites,...clayFrames.champions}},
    {name:'史诗 Boss',kinds:EPIC_KINDS,frames:clayFrames.bosses},
  ] as const;
  for(const group of groups){
    const filter=enemies.getByRole('button',{name:`${group.name} ${group.kinds.length}`,exact:true});
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed','true');
    await expect(enemies.getByRole('heading',{level:3})).toHaveText(group.kinds.map(kind=>ENEMY_NAMES[kind]));
    await expectCatalogArt(page,group.kinds,group.frames);
    for(const kind of group.kinds){
      const card=enemies.locator('article').filter({has:page.locator(`[data-icon="${kind}"]`)});
      await expect(card.locator('.enemy-rank')).toHaveText(group.name);
      await expect(card.locator('small')).toContainText(`生命 ${CONFIG.enemies[kind].hp}`);
    }
  }
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();await view(page,'lab');
  expect((await state(page)).practice).toBe(true);await expect(page.locator('#hp-value')).toHaveText('100 / 100');
  await page.screenshot({animations:'disabled',path:info.outputPath('v2-laboratory.png')});
  const paused=await state(page);await page.waitForTimeout(150);expect((await state(page)).time).toBe(paused.time);
  for(const kind of WEAPON_KINDS){
    await page.getByLabel('试验武器',{exact:true}).selectOption(kind);
    await page.getByRole('button',{name:'装备并体验'}).click();await view(page,'play');expect((await state(page)).weapon.kind).toBe(kind);
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
  }
  for(const kind of SKILL_KINDS){
    await page.getByLabel('试验技能',{exact:true}).selectOption(kind);
    await page.getByRole('button',{name:'触发并体验'}).click();await view(page,'play');await page.waitForTimeout(70);
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
  }
  expect(await page.locator('.status-chip').count()).toBeLessThanOrEqual(6);
  await page.getByRole('button',{name:'清空场地',exact:true}).click();
  const cleared=await state(page);expect(cleared.enemies).toHaveLength(0);expect(cleared.pickups).toHaveLength(0);expect(cleared.projectiles).toHaveLength(0);
  await page.getByRole('button',{name:'重置试验',exact:true}).click();
  const reset=await state(page);expect(reset.time).toBe(0);expect(reset.player.hp).toBe(100);expect(reset.weapon.kind).toBe('talisman');
  await page.getByRole('button',{name:'0.5× 速度',exact:true}).click();await page.getByRole('button',{name:'继续试验',exact:true}).click();
  const begin=(await state(page)).time;await page.waitForTimeout(600);const later=await state(page);
  expect(later.time-begin).toBeGreaterThan(.15);expect(later.time-begin).toBeLessThan(.5);expect(later.enemies).toHaveLength(0);expect(later.score).toBe(0);
  await page.keyboard.press('Escape');await view(page,'pause');await page.getByRole('button',{name:'返回首页',exact:true}).click();await view(page,'confirm');
  await page.getByRole('button',{name:'结束本局',exact:true}).click();await view(page,'home');
  const best=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null')?.best??null,SAVE_KEY);expect(best).toBeNull();
});

test.describe('touch landscape',()=>{
  test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  test('landscape catalog groups and practice bosses show the matching name and current HP',async({page},info)=>{
    await page.getByRole('button',{name:'夜市图鉴',exact:true}).tap();
    await page.getByRole('tab',{name:/种怪物/}).tap();
    await page.getByRole('button',{name:'史诗 Boss 5',exact:true}).tap();
    const panel=page.getByRole('tabpanel');
    await expect(panel.getByRole('heading',{level:3})).toHaveText(EPIC_KINDS.map(kind=>ENEMY_NAMES[kind]));
    await expect(panel).toContainText('每五波');
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await page.screenshot({animations:'disabled',path:info.outputPath('epic-guide-landscape.png')});
    await page.getByRole('button',{name:'返回',exact:true}).tap();
    await page.getByRole('button',{name:'配送试验场',exact:true}).tap();
    const select=page.getByLabel('敌人类型',{exact:true});
    await expect(select.locator('optgroup[label="史诗 Boss"] option')).toHaveCount(5);
    await expect(select.locator('optgroup[label="精英怪"] option')).toHaveCount(10);
    for(const kind of EPIC_KINDS){
      await select.selectOption(kind);
      await expect(page.getByRole('button',{name:'生成敌群'})).toHaveCount(0);
      await page.getByRole('button',{name:'生成单只'}).tap();
      await expect(page.getByRole('progressbar',{name:ENEMY_NAMES[kind],exact:true})).toBeVisible();
      const health=page.locator('#epic-meter');
      await expect(health).toHaveAttribute('max',String(CONFIG.enemies[kind].hp));
      await expect(page.locator('#epic-health')).toContainText(`/ ${CONFIG.enemies[kind].hp}`);
      if(kind===EPIC_KINDS[0]){
        await page.getByRole('button',{name:'试验工具',exact:true}).tap();
        await page.getByLabel('试验技能',{exact:true}).selectOption('steamer');
        await page.getByRole('button',{name:'触发并体验',exact:true}).tap();
        await expect.poll(async()=>Number(await health.getAttribute('value'))).toBeLessThan(CONFIG.enemies[kind].hp);
        await expect(page.locator('#epic-move')).toBeVisible();
        await page.screenshot({animations:'disabled',path:info.outputPath('epic-battle-landscape.png')});
      }
      await page.getByRole('button',{name:'试验工具',exact:true}).tap();
      await page.getByRole('button',{name:'清空场地',exact:true}).tap();
      await expect(page.locator('#epic-panel')).toBeHidden();
    }
  });
});

test('the three elemental trials start from a drifting pickup and play through their release',async({page},info)=>{
  await page.clock.install();
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();
  for(const kind of ELEMENTAL_KINDS){
    await page.getByRole('button',{name:SKILL_NAMES[kind],exact:true}).click();
    const start=await state(page);
    expect(start.pickups.map(p=>p.kind)).toEqual([kind]);
    expect(start.elementalFields).toHaveLength(0);
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(320);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator(`[data-status="${kind}"]`)).toBeVisible();
    await page.clock.runFor(620);
    const active=await state(page);
    const field=active.elementalFields!.find(f=>f.kind===kind)!;
    expect(field.released).toBe(false);
    if(kind==='vortex'){
      const spread=(s:GameState)=>Math.max(...s.enemies.map(e=>Math.hypot(e.x-field.x,e.y-field.y)));
      expect(spread(active)).toBeLessThan(spread(start)*.75);
    }else if(kind==='poison'){
      expect(active.enemies.some(e=>(e.poisonUntil??0)>active.time)).toBe(true);
    }else{
      expect(active.enemies.filter(e=>(e.frostUntil??0)>active.time).length).toBeGreaterThan(2);
    }
    await page.screenshot({path:info.outputPath(kind+'.png')});
    await page.clock.runFor(Math.ceil((field.expiresAt-active.time+.15)*1000));
    expect((await state(page)).elementalFields).toHaveLength(0);
    await expect(page.locator(`[data-status="${kind}"]`)).toHaveCount(0);
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
  }
});

test('HP feedback, healing, safety state priority, and portrait recovery in practice',async({page},info)=>{
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();await page.getByLabel('敌人类型',{exact:true}).selectOption('bowl');await page.getByRole('button',{name:'生成敌群',exact:true}).click();
  await expect.poll(async()=>(await state(page)).player.hp,{timeout:10000}).toBeLessThan(100);
  const hurt=await state(page);expect(hurt.ended).toBe(false);await page.getByRole('button',{name:'试验工具',exact:true}).click();
  await expect(page.locator('#hp-value')).toHaveText(`${hurt.player.hp} / 100`);
  await page.getByRole('button',{name:'补满生命',exact:true}).click();await expect(page.locator('#hp-value')).toHaveText('100 / 100');
  await page.getByRole('button',{name:'清空场地',exact:true}).click();
  for(const kind of ['lure','cones','stamp','dispatch','route','skate','bubble']){
    await page.getByLabel('试验技能',{exact:true}).selectOption(kind);await page.getByRole('button',{name:'触发并体验'}).click();await page.getByRole('button',{name:'试验工具',exact:true}).click();
  }
  const statuses=await page.locator('.status-chip').evaluateAll(elements=>elements.map(el=>(el as HTMLElement).dataset.status));expect(statuses[0]).toBe('bubble');expect(statuses[1]).toBe('skate');expect(statuses[2]).toBe('stamp');expect(statuses.length).toBeLessThanOrEqual(6);
  const frozen=(await state(page)).time;await page.setViewportSize({width:390,height:844});await view(page,'rotate');await page.setViewportSize({width:844,height:390});await view(page,'lab');expect((await state(page)).time).toBe(frozen);
  await page.screenshot({animations:'disabled',path:info.outputPath('v2-mobile-lab.png')});await page.getByRole('button',{name:'继续试验',exact:true}).click();await view(page,'play');await page.screenshot({animations:'disabled',path:info.outputPath('v2-mobile-hud.png')});
});

test('all ten weapons cause real enemy HP damage through laboratory controls',async({page},info)=>{
  test.setTimeout(90000);
  await page.getByRole('button',{name:'配送试验场',exact:true}).click();
  for(const kind of WEAPON_KINDS){
    await page.getByRole('button',{name:'清空场地',exact:true}).click();
    await page.getByRole('button',{name:'补满生命',exact:true}).click();
    await page.getByLabel('试验武器',{exact:true}).selectOption(kind);
    await page.getByRole('button',{name:'装备并体验'}).click();
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
    await page.getByLabel('敌人类型',{exact:true}).selectOption('bowl');
    const killsBefore=(await state(page)).kills;
    await page.getByRole('button',{name:'生成单只',exact:true}).click();
    await expect.poll(async()=>{const s=await state(page);return s.enemies.some(e=>e.hp<e.maxHp)||s.kills>killsBefore;},{timeout:6500,message:`${kind} should cause actual HP loss`}).toBe(true);
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
    expect((await state(page)).practice).toBe(true);
    await page.getByRole('button',{name:'继续试验',exact:true}).click();
    await page.screenshot({animations:'disabled',path:info.outputPath(`weapon-${kind}.png`)});
    await page.getByRole('button',{name:'试验工具',exact:true}).click();
  }
});
