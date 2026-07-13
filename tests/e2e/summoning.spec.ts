import { expect, test } from '@playwright/test';

type SummonSnapshot = {
  shadow: number;
  fill: number;
  move: number;
  complete: boolean;
  position: { x: number; y: number; z: number };
};

const waitForSummon = (page: import('@playwright/test').Page) =>
  page.locator('body[data-summon-ready="true"]').waitFor({ timeout: 15_000 });
const readSummon = (page: import('@playwright/test').Page) => page.locator('canvas[data-render-surface]').evaluate((canvas) =>
  JSON.parse((canvas as HTMLCanvasElement).dataset.summon ?? '{}') as SummonSnapshot);
const readCat = (page: import('@playwright/test').Page) => page.locator('canvas[data-render-surface]').evaluate((canvas) =>
  JSON.parse((canvas as HTMLCanvasElement).dataset.cat ?? '{}') as { headDegrees: number; eyeOffsetFraction: number });

test('runs the complete shadow, fill, and shoulder movement timeline', async ({ page }) => {
  test.setTimeout(75_000);
  for (const [elapsed, expected] of [
    [0, { shadow: 0, fill: 0, move: 0 }],
    [120, { shadow: 0, fill: 0, move: 0 }],
    [760, { shadow: 1 }],
    [1_660, { fill: 1 }],
    [2_360, { move: 1 }],
  ] as const) {
    await page.goto(`/?debug=1&experienceState=summoning&charge=1&summon=${elapsed / 2_600}`);
    await waitForSummon(page);
    expect(await readSummon(page)).toMatchObject(expected);
  }

  await page.goto('/?debug=1&experienceState=complete&charge=1&summon=1');
  await waitForSummon(page);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'true');
  expect(await readSummon(page)).toMatchObject({ shadow: 1, fill: 1, move: 1, complete: true });
});

test('keeps the completed cat visible and follows the pointer outside the face', async ({ page }) => {
  await page.goto('/?debug=1&experienceState=complete&charge=1&summon=1&pointerX=1');
  await waitForSummon(page);
  await page.waitForTimeout(650);
  const right = await readCat(page);
  expect(right.headDegrees).toBeGreaterThan(2.5);
  expect(right.eyeOffsetFraction).toBeGreaterThan(0.03);

  await page.goto('/?debug=1&experienceState=complete&charge=1&summon=1&pointerX=-1');
  await waitForSummon(page);
  await page.waitForTimeout(650);
  const left = await readCat(page);
  expect(left.headDegrees).toBeLessThan(-2.5);
  expect(left.eyeOffsetFraction).toBeLessThan(-0.03);
  expect((await readSummon(page)).position.x).toBeGreaterThan(0.9);
});

test('keeps the full completed summon in forced WebGL 2', async ({ page }) => {
  await page.goto('/?debug=1&backend=webgl2&experienceState=complete&charge=1&summon=1');
  await waitForSummon(page);
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', 'webgl2');
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'true');
  expect(await readSummon(page)).toMatchObject({ complete: true, fill: 1, move: 1 });
});
