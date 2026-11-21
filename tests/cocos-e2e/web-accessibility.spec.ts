import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Exercise the independent TypeScript bridge in a real browser without
// modifying or depending on the Cocos build's application entry point.
const source=readFileSync('cocos/assets/scripts/ui/web-accessibility.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;

test('keyboard and semantic controls route actions and isolate game keys',async({page})=>{
  await page.setContent('<!doctype html><html lang="zh-CN"><body><main id="game"></main></body></html>');
  await page.evaluate(code=>{
    const api:any={};new Function('exports',code)(api);
    const w=window as any;w.events=[];w.focuses=[];w.globalKeys=[];
    window.addEventListener('keydown',event=>w.globalKeys.push(event.key));
    w.bridge=api.createWebAccessibilityBridge(document,{activate:(id:string,value:unknown)=>w.events.push([id,value??null]),focus:(id:string|null)=>w.focuses.push(id),escape:()=>w.events.push(['escape',null])});
    w.bridge.setView({id:'settings',title:'设置',modal:true,initialFocus:'sound',controls:[
      {id:'sound',kind:'tab',label:'声音',selected:true},
      {id:'mute',kind:'switch',label:'总静音',checked:false},
      {id:'volume',kind:'slider',label:'音乐音量',min:0,max:100,step:1,value:35,valueText:'35%'},
      {id:'cancel',kind:'button',label:'取消'},
    ]});
  },javascript);
  await expect(page.getByRole('dialog',{name:'设置'})).toBeAttached();
  await expect(page.getByRole('button',{name:'声音',pressed:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');await expect(page.getByRole('switch',{name:'总静音'})).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');await expect(page.getByRole('slider',{name:'音乐音量'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>(window as any).events)).toEqual([['sound',null],['mute',true],['volume',36]]);
  expect(await page.evaluate(()=>(window as any).globalKeys)).toEqual([]);
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'取消'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'声音',pressed:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'取消'})).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>(window as any).events.at(-1))).toEqual(['escape',null]);
  expect(await page.evaluate(()=>(window as any).focuses)).toContain('cancel');
});

test('updates preserve focus, expose state, and dispose without touching the host',async({page})=>{
  await page.setContent('<!doctype html><html><body><button id="host">外部控件</button></body></html>');
  const nullResult=await page.evaluate(code=>{const api:any={};new Function('exports',code)(api);return api.createWebAccessibilityBridge(null,{activate(){},focus(){}});},javascript);
  expect(nullResult).toBeNull();
  await page.evaluate(code=>{
    const api:any={};new Function('exports',code)(api);const w=window as any;w.events=[];
    w.bridge=api.createWebAccessibilityBridge(document,{activate:(id:string,value:unknown)=>w.events.push([id,value]),focus:(id:string|null)=>w.events.push(['focus',id])});
    w.bridge.setView({id:'home',title:'首页',initialFocus:'start',controls:[{id:'start',kind:'button',label:'开始挑战'},{id:'catalog',kind:'button',label:'图鉴'}]});
  },javascript);
  await expect(page.getByRole('button',{name:'开始挑战'})).toBeFocused();
  await page.evaluate(()=>{const w=window as any;w.bridge.setView({id:'home',title:'首页',controls:[{id:'start',kind:'button',label:'开始挑战'},{id:'catalog',kind:'button',label:'图鉴'}]});w.bridge.announce('生命值 30');});
  await expect(page.getByRole('button',{name:'开始挑战'})).toBeFocused();
  await expect(page.getByRole('status')).toHaveText('生命值 30');
  await page.evaluate(()=>{const w=window as any;w.bridge.setView({id:'result',title:'本局结束',modal:true,initialFocus:'home',controls:[{id:'retry',kind:'button',label:'再来一局',disabled:true},{id:'home',kind:'button',label:'返回首页'}]});});
  await expect(page.getByRole('dialog',{name:'本局结束'})).toBeAttached();
  await expect(page.getByRole('button',{name:'返回首页'})).toBeFocused();
  await expect(page.getByRole('button',{name:'再来一局'})).toBeDisabled();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'返回首页'})).toBeFocused();
  await page.evaluate(()=>(window as any).bridge.destroy());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#host')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).events.at(-1))).toEqual(['focus',null]);
});
