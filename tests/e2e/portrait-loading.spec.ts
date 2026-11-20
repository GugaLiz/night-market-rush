import {test,expect} from '@playwright/test';

test('portrait guidance is visible before the game downloads and preserves loading progress across rotation',async({page})=>{
  const tablet={width:1024,height:1366},landscape={width:1366,height:1024};
  await page.setViewportSize(tablet);
  let allowScript!:()=>void,allowImage!:()=>void;
  const scriptGate=new Promise<void>(resolve=>{allowScript=resolve;});
  const imageGate=new Promise<void>(resolve=>{allowImage=resolve;});
  await page.route(/\/(src\/main\.ts|assets\/index-[\w-]+\.js)(?:\?.*)?$/,async route=>{
    await scriptGate;await route.continue();
  });
  await page.route('**/clay-order-stall.webp',async route=>{await imageGate;await route.continue();});
  const prompt=page.getByRole('heading',{name:'请横屏游玩'});
  try{
    await page.goto('/',{waitUntil:'commit'});
    await expect(prompt).toBeVisible();
    await expect(page.locator('#game-shell')).toHaveCount(0);
    allowScript();
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','rotate');
    await expect(prompt).toBeVisible();
    await page.setViewportSize(landscape);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',/^[1-9]\d?$/);
    await expect(prompt).toBeHidden();
    await page.setViewportSize({width:800,height:800});
    await expect(prompt).toBeVisible();
    const loaded=page.waitForResponse('**/clay-order-stall.webp');
    allowImage();
    await loaded;
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','rotate');
    await expect(page.getByRole('button',{name:'开始挑战'})).toHaveCount(0);
    await page.setViewportSize(landscape);
    await page.getByRole('button',{name:'开始挑战'}).click();
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','play');
    await page.setViewportSize(tablet);
    await expect(prompt).toBeVisible();
    await expect(page.locator('#game-shell')).toHaveAttribute('data-view','rotate');
    await page.setViewportSize(landscape);
    await expect(page.getByRole('button',{name:'继续挑战'})).toBeVisible();
  }finally{allowScript();allowImage();}
});

test('an asset failure during portrait loading can be retried after turning to landscape',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/clay-order-stall.webp',route=>route.abort(),{times:1});
  const failure=page.waitForEvent('requestfailed',request=>request.url().endsWith('clay-order-stall.webp'));
  await page.goto('/');
  await failure;
  await expect(page.getByRole('heading',{name:'请横屏游玩'})).toBeVisible();
  await page.setViewportSize({width:844,height:390});
  await expect(page.getByText(/素材加载失败/)).toBeVisible();
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.getByRole('button',{name:'开始挑战'})).toBeVisible();
});
