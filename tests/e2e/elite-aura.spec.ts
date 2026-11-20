import {expect, test} from '@playwright/test';
import type {EliteKind} from '../../src/shared/types';

test('elite auras follow the artwork silhouette, retain their individual colors in reduced motion and still when frozen', async ({page}) => {
  await page.goto('/');
  const stats = await page.evaluate(async () => {
    const auraPath='/src/render/elite-aura.ts', assetPath='/src/render/assets.ts', spritePath='/src/render/sprite.ts';
    const gamePath='/src/core/game.ts', typePath='/src/shared/types.ts', vitalsPath='/src/render/enemy-vitals.ts';
    const {drawEliteAura}:typeof import('../../src/render/elite-aura') = await import(auraPath);
    const {loadAssets}:typeof import('../../src/render/assets') = await import(assetPath);
    const {drawSprite}:typeof import('../../src/render/sprite') = await import(spritePath);
    const {Game}:typeof import('../../src/core/game') = await import(gamePath);
    const {ELITE_KINDS, DEFAULT_SETTINGS}:typeof import('../../src/shared/types') = await import(typePath);
    const {enemyHeight}:typeof import('../../src/render/enemy-vitals') = await import(vitalsPath);
    const assets = await loadAssets(), game = new Game(41);
    const canvas = document.createElement('canvas');
    canvas.width = 340; canvas.height = 230;
    const ctx = canvas.getContext('2d', {willReadFrequently:true})!;
    return ELITE_KINDS.map((kind:EliteKind) => {
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
      e.frostUntil=8;
      const frozen=frame(2,'normal'), frozenLater=frame(2.46,'normal');
      let rimPixels=0, coloredPixels=0, changedFace=0, simplePixels=0, moving=0, reducedChanges=0, frozenChanges=0;
      for(let i=0;i<plain.length;i+=4){
        if(plain[i+3]===255 && Math.abs(normal[i]-plain[i])>12)changedFace++;
        if(plain[i+3]===0 && simple[i+3]>80)simplePixels++;
        if(plain[i+3]===0 && reduced[i+3]>80){
          rimPixels++;
          const r=reduced[i],g=reduced[i+1],b=reduced[i+2];
          if(kind==='giantBun'? r>g+10 && g>b+30 :
             kind==='eliteCrab'? r>g+40 && Math.abs(g-b)<60 :
             kind==='eliteKettle'? g>r+25 && g>b :
             b>g+25 && r>g+16)coloredPixels++;
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
