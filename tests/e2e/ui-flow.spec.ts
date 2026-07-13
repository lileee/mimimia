import { expect, test } from '@playwright/test';

const state = (page: import('@playwright/test').Page, value: string, options: { timeout?: number } = {}) =>
  expect(page.locator('body')).toHaveAttribute('data-experience-state', value, options);

test('keeps the entry closed until every real readiness gate passes, then completes two casts', async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto('/?testGate=benchmark&quality=compatibility');

  await page.locator('body[data-load-progress="1"]').waitFor({ timeout: 35_000 });
  await expect(page.getByTestId('loading-status')).toContainText('正在校准月光');
  await expect(page.getByTestId('enter-button')).toBeDisabled();
  await expect(page.getByTestId('loading-percent')).toHaveText('100%');

  await page.evaluate(() => {
    const release = (window as typeof window & { __mimimiaReleaseGate?: () => void }).__mimimiaReleaseGate;
    release?.();
  });
  await expect(page.getByTestId('enter-button')).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId('quality-badge')).toContainText('兼容画质');
  await page.getByTestId('enter-button').click();
  await state(page, 'idle');
  await expect(page.getByTestId('first-hint')).toHaveText('按住鼠标，凝聚月光。');

  await page.getByTestId('sound-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-muted', 'true');
  await state(page, 'idle');
  await page.getByTestId('sound-button').dispatchEvent('pointerdown', { button: 0, pointerId: 91 });
  await state(page, 'idle');

  const canvas = page.locator('canvas[data-render-surface]');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('render canvas has no bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await state(page, 'charging');
  await expect(page.getByTestId('first-hint')).toBeHidden();
  await page.waitForTimeout(520);
  await page.mouse.up();
  await state(page, 'dissolving');
  await state(page, 'idle', { timeout: 2_500 });
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');

  await page.mouse.down();
  await state(page, 'charging');
  await state(page, 'charged', { timeout: 4_000 });
  await page.waitForTimeout(320);
  await state(page, 'charged');
  await page.mouse.up();
  await state(page, 'summoning');
  await state(page, 'complete', { timeout: 5_000 });
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'true');
  await expect(page.getByTestId('reset-button')).toBeVisible();
  await expect(page.getByTestId('sound-button')).toBeVisible();
  await expect(page.getByTestId('quality-badge')).toBeHidden();
  await expect(page.getByTestId('enter-button')).toBeHidden();

  await page.getByTestId('reset-button').click();
  await state(page, 'idle', { timeout: 2_000 });
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');
});

test('shows an actionable error instead of a blank scene when initialization fails', async ({ page }) => {
  await page.goto('/?fault=renderer-init');
  await expect(page.locator('[data-render-error]')).toContainText('图形环境暂时不可用');
  await expect(page.getByTestId('reload-button')).toBeVisible();
  await expect(page.locator('canvas[data-render-surface]')).toBeHidden();
});
