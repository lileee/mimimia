import { expect, test } from '@playwright/test';
import sharp from 'sharp';

async function expectPaintedCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas[data-render-surface]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-render-ready', 'true');
  const screenshot = await canvas.screenshot();
  const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  const center = [...data.subarray(offset, offset + 3)];
  expect(center).not.toEqual([0, 0, 0]);
  expect(center[2]).toBeGreaterThan(center[0]);
}

test('initializes the default renderer and paints a deep-purple frame', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', /^(webgpu|webgl2)$/);
  await expectPaintedCanvas(page);
});

test('can force the WebGL 2 backend in test mode', async ({ page }) => {
  await page.goto('/?debug=1&backend=webgl2');
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', 'webgl2');
  await expectPaintedCanvas(page);
});

test('shows a recoverable error instead of a black canvas when initialization fails', async ({ page }) => {
  await page.goto('/?debug=1&fault=renderer-init');
  await expect(page.locator('[data-render-error]')).toBeVisible();
  await expect(page.locator('[data-render-error]')).toContainText('图形环境暂时不可用');
  await expect(page.locator('canvas[data-render-surface]')).toBeHidden();
});
