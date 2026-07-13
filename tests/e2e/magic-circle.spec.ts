import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type CircleSnapshot = {
  centerProgress: number;
  middleProgress: number;
  outerProgress: number;
  auxiliaryProgress: number;
  brightness: number;
};

async function snapshot(page: import('@playwright/test').Page): Promise<CircleSnapshot> {
  return page.locator('canvas[data-render-surface]').evaluate((canvas) =>
    JSON.parse((canvas as HTMLCanvasElement).dataset.magicCircle ?? '{}'));
}

test('draws the three exact charge phases and holds at charged', async ({ page }) => {
  test.setTimeout(60_000);
  for (const [charge, expected] of [
    [0, { centerProgress: 0, outerProgress: 0, auxiliaryProgress: 0 }],
    [0.32, { centerProgress: 1, outerProgress: 0, auxiliaryProgress: 0 }],
    [0.68, { centerProgress: 1, outerProgress: 1, auxiliaryProgress: 0 }],
    [1, { centerProgress: 1, outerProgress: 1, auxiliaryProgress: 1 }],
  ] as const) {
    await page.goto(`/?debug=1&experienceState=${charge === 1 ? 'charged' : 'charging'}&charge=${charge}`);
    await expect(page.locator('body')).toHaveAttribute('data-magic-circle-ready', 'true');
    expect(await snapshot(page)).toMatchObject(expected);
  }

  const lowerScene = await page.locator('#scene-canvas-host').screenshot();
  const image = sharp(lowerScene);
  const metadata = await image.metadata();
  const stats = await image.extract({
    left: 0,
    top: Math.floor((metadata.height ?? 1) * 0.62),
    width: metadata.width ?? 1,
    height: Math.max(1, Math.floor((metadata.height ?? 1) * 0.38)),
  }).removeAlpha().stats();
  expect(Math.max(...stats.channels.slice(0, 3).map(({ max }) => max))).toBeGreaterThan(220);
});

test('keeps the complete circle in forced WebGL 2', async ({ page }) => {
  await page.goto('/?debug=1&backend=webgl2&experienceState=charged&charge=1');
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', 'webgl2');
  await expect(page.locator('body')).toHaveAttribute('data-magic-circle-ready', 'true');
  expect(await snapshot(page)).toMatchObject({
    centerProgress: 1,
    middleProgress: 1,
    outerProgress: 1,
    auxiliaryProgress: 1,
  });
});
