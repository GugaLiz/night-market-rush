import {expect, test} from '@playwright/test';
import {WORLD} from '../../src/core/config';

test.use({viewport: {width: 956, height: 365}, isMobile: true, hasTouch: true, deviceScaleFactor: 3});

test('touch viewports keep the whole arena in proportion and paint the surrounding market', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '开始挑战', exact: true}).tap();
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view', 'play');
  for (const size of [{width: 956, height: 365}, {width: 956, height: 440}, {width: 1024, height: 768}]) {
    await page.setViewportSize(size);
    const canvas = page.locator('#game-canvas');
    await expect.poll(() => canvas.boundingBox()).toEqual({x: 0, y: 0, ...size});
    await expect.poll(() => canvas.evaluate((element, world) => {
      const canvas = element as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const {a, d, e, f} = ctx.getTransform();
      const aspect = canvas.width / canvas.height;
      return Math.abs(aspect - canvas.clientWidth / canvas.clientHeight) < .002 &&
        a === d && e >= -.01 && f >= -.01 &&
        Math.abs(e + a * world.width / 2 - canvas.width / 2) < .01 &&
        Math.abs(f + d * world.height / 2 - canvas.height / 2) < .01;
    }, WORLD)).toBe(true);
    const edgeHasScenery = await canvas.evaluate(element => {
      const {width, height} = element as HTMLCanvasElement;
      const ctx = (element as HTMLCanvasElement).getContext('2d')!;
      return [[4, height / 2], [width - 12, height / 2], [width / 2, 4], [width / 2, height - 12]].every(([x, y]) => {
        const rgba = ctx.getImageData(x, y, 8, 8).data;
        const colors = new Set<number>();
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i + 3] < 254) return false;
          colors.add(rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2]);
        }
        return colors.size > 1;
      });
    });
    expect(edgeHasScenery).toBe(true);
  }
  await page.setViewportSize({width: 440, height: 956});
  await expect(page.locator('#game-shell')).toHaveAttribute('data-view', 'rotate');
  await page.setViewportSize({width: 956, height: 365});
  await expect(page.getByRole('heading', {name: '已暂停'})).toBeVisible();
});
