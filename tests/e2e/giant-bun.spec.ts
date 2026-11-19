import {test,expect,type Page} from '@playwright/test';
import type {GameState,Vec} from '../../src/shared/types';

const snapshot=(page:Page)=>page.evaluate(()=>
  (window as unknown as {__gameTest:{snapshot():GameState}}).__gameTest.snapshot());

async function walkTo(page:Page,point:Vec){
  const held=new Set<string>();
  for(let i=0;i<35;i++){
    const {player}=await snapshot(page);
    const dx=point.x-player.x,dy=point.y-player.y,needed=new Set<string>();
    if(Math.abs(dx)>9)needed.add(dx>0?'ArrowRight':'ArrowLeft');
    if(Math.abs(dy)>9)needed.add(dy>0?'ArrowDown':'ArrowUp');
    for(const key of held)if(!needed.has(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of needed)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    if(!held.size)return;
    await page.clock.runFor(32);
  }
  for(const key of held)await page.keyboard.up(key);
  throw new Error('Did not reach the marked opening before the landing');
}

test('giant can be selected, evaded through the last telegraph and hit during recovery',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const epoch=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(+epoch+1000));
  await page.goto('/');
  await page.getByRole('button',{name:'配送试验场',exact:true}).click({force:true});
  await page.getByLabel('敌人类型',{exact:true}).selectOption('giantBun');
  await page.getByRole('button',{name:'生成单只',exact:true}).click({force:true});
  async function until(predicate:(s:GameState)=>boolean){
    for(let i=0;i<120;i++){
      await page.clock.runFor(48);const state=await snapshot(page);
      if(predicate(state))return state;
    }
    throw new Error('Timed out watching the giant bun');
  }
  const warning=await until(s=>s.enemies.some(e=>e.jump?.hop===3&&e.jump.phase==='warn'));
  const jump=warning.enemies[0].jump!;
  await page.screenshot({path:info.outputPath('third-landing-warning.png')});
  const exit={x:jump.target.x+205*Math.cos(jump.gapAngle),y:jump.target.y+205*Math.sin(jump.gapAngle)};
  await walkTo(page,exit);
  await until(s=>s.enemies[0]?.jump?.phase==='flight' && s.time-s.enemies[0].jump.startedAt>.16);
  await page.screenshot({path:info.outputPath('giant-in-flight.png')});
  const safe=await until(s=>s.giantPulses?.some(p=>p.hop===3 && s.time-p.bornAt>.35)??false);
  expect(safe.player.hp).toBe(warning.player.hp);
  expect(safe.enemies[0].jump?.phase).toBe('rest');
  await page.screenshot({path:info.outputPath('open-flour-wave.png')});
  const hp=safe.enemies[0].hp;
  await walkTo(page,jump.target);
  await until(s=>s.kills>0 || (s.enemies[0]?.hp??0)<hp);
  await page.screenshot({path:info.outputPath('retaliation.png')});
  expect(errors).toEqual([]);
});
