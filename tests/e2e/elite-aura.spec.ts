import {expect, test} from '@playwright/test';
import type {GuardKind,GuardMark} from '../../src/shared/types';

test('elite auras follow the artwork silhouette, retain their individual colors in reduced motion and still when frozen', async ({page}) => {
  await page.goto('/');
  const stats = await page.evaluate(async () => {
    const auraPath='/src/render/elite-aura.ts', assetPath='/src/render/assets.ts', spritePath='/src/render/sprite.ts';
    const gamePath='/src/core/game.ts', typePath='/src/shared/types.ts', vitalsPath='/src/render/enemy-vitals.ts';
    const {drawEliteAura,guardColors}:typeof import('../../src/render/elite-aura') = await import(auraPath);
    const {loadAssets}:typeof import('../../src/render/assets') = await import(assetPath);
    const {drawSprite}:typeof import('../../src/render/sprite') = await import(spritePath);
    const {Game}:typeof import('../../src/core/game') = await import(gamePath);
    const {ELITE_KINDS,EPIC_KINDS,DEFAULT_SETTINGS}:typeof import('../../src/shared/types') = await import(typePath);
    const {enemyHeight}:typeof import('../../src/render/enemy-vitals') = await import(vitalsPath);
    const assets = await loadAssets(), game = new Game(41);
    const canvas = document.createElement('canvas');
    canvas.width = 340; canvas.height = 230;
    const ctx = canvas.getContext('2d', {willReadFrequently:true})!;
    return [...ELITE_KINDS,...EPIC_KINDS].map((kind:GuardKind) => {
      const e = game.spawnEnemy(kind, {x:170,y:195});
      const h = enemyHeight(kind), sprite = assets.sprites[kind];
      function frame(time:number, mode:'plain'|'normal'|'simple'|'reduced') {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.save();ctx.translate(e.x,e.y);
        if (mode !== 'plain') drawEliteAura(ctx,e,kind,sprite,h,time,{
          ...DEFAULT_SETTINGS,reduceMotion:mode==='reduced',quality:mode==='simple'?'simple':'standard',
        });
        drawSprite(ctx,assets,kind,0,0,h);ctx.restore();
        return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      }
      const plain=frame(2,'plain'), reduced=frame(2,'reduced'), reducedLater=frame(2.46,'reduced');
      const normal=frame(2,'normal'), normalLater=frame(2.46,'normal'), simple=frame(2,'simple');
      const rgb=(hex:string)=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
      const body=rgb(guardColors[kind].body),tip=rgb(guardColors[kind].tip);
      e.frostUntil=8;
      const frozen=frame(2,'normal'), frozenLater=frame(2.46,'normal');
      let rimPixels=0, coloredPixels=0, changedFace=0, simplePixels=0, moving=0, reducedChanges=0, frozenChanges=0;
      for(let i=0;i<plain.length;i+=4){
        if(plain[i+3]===255 && Math.abs(normal[i]-plain[i])>12)changedFace++;
        if(plain[i+3]===0 && simple[i+3]>80)simplePixels++;
        if(plain[i+3]===0 && reduced[i+3]>80){
          rimPixels++;
          if(body.every((v,ch)=>reduced[i+ch]>=Math.min(v,tip[ch])-12 &&
                                reduced[i+ch]<=Math.max(v,tip[ch])+12))coloredPixels++;
        }
        if(Math.abs(normal[i+3]-normalLater[i+3])>12)moving++;
        if(reduced[i+3]!==reducedLater[i+3])reducedChanges++;
        if(frozen[i+3]!==frozenLater[i+3])frozenChanges++;
      }
      return {kind,rimPixels,coloredPixels,changedFace,simplePixels,moving,reducedChanges,frozenChanges};
    });
  });
  for(const result of stats){
    expect(result.coloredPixels,result.kind).toBeGreaterThan(1000);
    expect(result.changedFace,result.kind).toBe(0);
    expect(result.simplePixels,result.kind).toBeGreaterThan(result.rimPixels);
    expect(result.moving,result.kind).toBeGreaterThan(100);
    expect(result.reducedChanges,result.kind).toBe(0);
    expect(result.frozenChanges,result.kind).toBe(0);
  }
});

test('the drum ring leaves its safe middle empty and the charging body leaves the warned route behind', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async ()=>{
    const paths=['/src/render/guard-telegraphs.ts','/src/core/game.ts','/src/shared/types.ts'];
    const [{drawGuardTelegraph},{Game},{DEFAULT_SETTINGS}]=await Promise.all(paths.map(path=>import(path)));
    const game=new Game(22),e=game.spawnEnemy('eliteLotus',{x:400,y:330});
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const c=canvas.getContext('2d',{willReadFrequently:true})!;
    function render(mark:GuardMark,time:number){
      c.clearRect(0,0,canvas.width,canvas.height);
      e.guardCast={name:'',startsAt:0,endsAt:2,marks:[mark]};
      drawGuardTelegraph(c,e,time,DEFAULT_SETTINGS);
      return [400,485,600].map(x=>c.getImageData(x,330,1,1).data[3]>0);
    }
    const ring:GuardMark={shape:{kind:'ring',center:{x:400,y:330},radius:125,inner:65},warnAt:0,hitAt:1,endAt:2,damage:20};
    const rush:GuardMark={...ring,rush:true,shape:{kind:'lane',from:{x:400,y:330},to:{x:800,y:330},radius:33}};
    return {warning:render(ring,.4),live:render(ring,1.4),ended:render(ring,2),
      road:render(rush,.8),crossing:render(rush,1.5)};
  });
  expect(result.warning).toEqual([false,true,false]);
  expect(result.live).toEqual(result.warning);
  expect(result.ended).toEqual([false,false,false]);
  expect(result.road).toEqual([true,true,true]);
  expect(result.crossing).toEqual([false,false,true]);
});
