import { expect, test } from '@playwright/test';

const state = (page: import('@playwright/test').Page, value: string, timeout = 8_000) =>
  expect(page.locator('body')).toHaveAttribute('data-experience-state', value, { timeout });

const canvasJson = async <T>(page: import('@playwright/test').Page, attribute: string): Promise<T> => {
  const value = await page.locator('canvas[data-render-surface]').getAttribute(attribute);
  if (!value) throw new Error(`Missing ${attribute}`);
  return JSON.parse(value) as T;
};

test('keeps the entire mouse, failure, summon, cat, sound, and reset flow coherent', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const params = new URLSearchParams({ quality: 'compatibility' });
  if (testInfo.project.name === 'chromium-webgl2') params.set('backend', 'webgl2');
  await page.goto(`/?${params}`);
  await expect(page.getByTestId('enter-button')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('enter-button').click();
  await state(page, 'idle');

  const canvas = page.locator('canvas[data-render-surface]');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Render canvas has no bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.55);

  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(150);
  await state(page, 'idle');
  await page.mouse.up({ button: 'right' });
  await page.getByTestId('sound-button').click();
  await state(page, 'idle');
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.55);

  await page.mouse.down();
  await state(page, 'charging');
  await page.waitForTimeout(800);
  await page.mouse.up();
  await state(page, 'dissolving');
  await state(page, 'idle', 8_000);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');

  await page.mouse.down();
  await state(page, 'charged', 6_000);
  await page.waitForTimeout(500);
  await state(page, 'charged');
  await page.mouse.up();
  await state(page, 'summoning');
  const beforeReentry = await canvasJson<{ elapsedMs: number }>(page, 'data-summon');
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId('sound-button').click();
  await page.waitForTimeout(250);
  await state(page, 'summoning');
  const afterReentry = await canvasJson<{ elapsedMs: number }>(page, 'data-summon');
  expect(afterReentry.elapsedMs).toBeGreaterThan(beforeReentry.elapsedMs);

  await state(page, 'complete');
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'true');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
  await page.waitForTimeout(250);
  const leftGaze = await canvasJson<{ headDegrees: number; eyeOffsetFraction: number }>(page, 'data-cat');
  await page.mouse.move(bounds.x + bounds.width * 0.82, bounds.y + bounds.height * 0.62);
  await page.waitForTimeout(250);
  const rightGaze = await canvasJson<{ headDegrees: number; eyeOffsetFraction: number }>(page, 'data-cat');
  expect(rightGaze.headDegrees).toBeGreaterThan(leftGaze.headDegrees);
  expect(rightGaze.eyeOffsetFraction).toBeGreaterThan(leftGaze.eyeOffsetFraction);

  await page.getByTestId('reset-button').click();
  await state(page, 'idle', 3_000);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');
  await expect(canvas).toHaveAttribute('data-particle-stats', /"activeCount":0/);
  await expect(canvas).toHaveAttribute('data-magic-circle', /"opacity":0/);
});
