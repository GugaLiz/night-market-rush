import {expect,test} from '@playwright/test';

test('Cocos prototype starts, pauses and resumes without page or asset errors',async({page})=>{
  const messages:string[]=[],errors:string[]=[];
  page.on('console',message=>{
    messages.push(message.text());
    if(message.type()==='error')errors.push(message.text());
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.goto('/');
  await expect.poll(()=>messages.filter(message=>message.includes('[AtlasSmoke] view=home')).length,{timeout:45000}).toBeGreaterThan(0);
  await page.mouse.click(320,402);
  await expect.poll(()=>messages.filter(message=>message.includes('[AtlasSmoke] view=play')).length).toBeGreaterThan(0);
  await page.keyboard.press('p');
  await expect.poll(()=>messages.filter(message=>message.includes('[AtlasSmoke] view=pause')).length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'继续挑战',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect.poll(()=>messages.filter(message=>message.includes('[AtlasSmoke] view=play')).length).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
