import {test,expect,type Route} from '@playwright/test';

declare global {
  interface Window { pendingBootImages:Map<string,()=>void>; }
}

test('staggered artwork downloads advance progress without replacing or fading the loading card',async({page})=>{
  const waiting=new Set<Route>();
  const released=new Set<string>();
  let finish=false;
  const file=(route:Route)=>new URL(route.request().url()).pathname.split('/').pop()!;
  await page.route('**/assets/*.webp',route=>{
    if(finish||released.has(file(route)))return route.continue();
    waiting.add(route);
  });
  async function release(...files:string[]){
    for(const name of files)released.add(name);
    for(const route of [...waiting]){
      if(!finish&&!released.has(file(route)))continue;
      waiting.delete(route);
      await route.continue();
    }
  }
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const progress=page.getByRole('progressbar',{name:'加载进度'});
  const card=page.getByRole('dialog',{name:'夜市正在开张'});
  await expect(progress).toHaveAttribute('aria-valuenow','0');
  const original=await card.evaluateHandle(el=>el);
  await card.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)).then(()=>true));

  await release('clay-night-market.webp','clay-riverside-market.webp','clay-chibi-home.webp');
  await expect(progress).toHaveAttribute('aria-valuenow','19');
  await expect(card).toContainText('19%');
  expect(await card.evaluate((el,first)=>el===first,original)).toBe(true);
  expect(await card.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await release('clay-actors.webp');
  await expect(progress).toHaveAttribute('aria-valuenow','25');
  expect(await card.evaluate((el,first)=>el===first,original)).toBe(true);
  finish=true;
  await release();
  await expect(page.getByRole('button',{name:'开始挑战',exact:true})).toBeVisible();
});

test('late completions from a failed load cannot change retry progress or interrupt gameplay',async({page})=>{
  // Let the browser decode real pictures. Hold two first-attempt load events so a
  // cached retry can finish before their delivery, independently of HTTP coalescing.
  await page.addInitScript(()=>{
    const pending=new Map<string,()=>void>();
    const seen=new Set<string>();
    const heldFiles=['clay-night-market.webp','clay-riverside-market.webp'];
    const NativeImage=window.Image;
    window.Image=class extends NativeImage{
      constructor(...args:ConstructorParameters<typeof Image>){
        super(...args);
        this.addEventListener('load',event=>{
          const file=new URL(this.src).pathname.split('/').pop()!;
          if(!heldFiles.includes(file)||seen.has(file))return;
          seen.add(file);
          event.stopImmediatePropagation();
          pending.set(file,()=>this.dispatchEvent(new Event('load')));
        },{capture:true});
      }
    };
    window.pendingBootImages=pending;
  });
  let first=true;
  let lastRequest:Route|undefined;
  await page.route('**/clay-order-stall.webp',route=>{
    if(first){first=false;return route.abort();}
    lastRequest=route;
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const retry=page.getByRole('button',{name:'重试',exact:true});
  await expect(retry).toBeVisible();
  const lateImages=await page.evaluateHandle(()=>window.pendingBootImages);
  await expect.poll(()=>lateImages.evaluate(images=>images.size)).toBe(2);
  await retry.click();
  const progress=page.getByRole('progressbar',{name:'加载进度'});
  await expect(progress).toHaveAttribute('aria-valuenow','94');
  await lateImages.evaluate(images=>images.get('clay-night-market.webp')!());
  expect(await progress.getAttribute('aria-valuenow')).toBe('94');
  await expect(retry).toBeHidden();
  await expect.poll(()=>Boolean(lastRequest)).toBe(true);
  await lastRequest!.continue();

  await page.getByRole('button',{name:'开始挑战',exact:true}).click();
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view','play');
  await lateImages.evaluate(images=>images.get('clay-riverside-market.webp')!());
  expect(await page.locator('#game-shell').getAttribute('data-view')).toBe('play');
});
