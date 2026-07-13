import { expect, test } from '@playwright/test';

type ParticleStats = {
  capacity: number;
  activeCount: number;
  allocatedObjects: number;
  trailSegments: number;
};

const readStats = (page: import('@playwright/test').Page) => page.locator('canvas[data-render-surface]').evaluate((canvas) =>
  JSON.parse((canvas as HTMLCanvasElement).dataset.particleStats ?? '{}') as ParticleStats);

const waitForParticles = (page: import('@playwright/test').Page) =>
  page.locator('body[data-particles-ready="true"]').waitFor({ timeout: 15_000 });

test('dissolves a 2499 ms early release gently back to the allocation baseline', async ({ page }) => {
  await page.goto('/?debug=1&experienceState=dissolving&charge=0.9996&dissolve=0.5');
  await waitForParticles(page);
  const during = await readStats(page);
  expect(during.activeCount).toBeGreaterThan(0);
  expect(during.activeCount).toBeLessThan(during.capacity);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');

  await page.goto('/?debug=1&experienceState=dissolving&charge=0.9996&dissolve=1');
  await waitForParticles(page);
  const ended = await readStats(page);
  expect(ended.activeCount).toBe(0);
  expect(ended.allocatedObjects).toBe(during.allocatedObjects);
});

test('preserves the full dissolve flow and fixed caps across all quality tiers', async ({ page }) => {
  test.setTimeout(75_000);
  for (const [quality, expected, trails] of [
    ['high', 900, 4],
    ['balanced', 520, 2],
    ['compatibility', 240, 0],
  ] as const) {
    await page.goto(`/?debug=1&quality=${quality}&experienceState=dissolving&charge=0.9996&dissolve=0`);
    await waitForParticles(page);
    expect(await readStats(page)).toMatchObject({ activeCount: expected, trailSegments: trails });
  }
});

test('keeps the dissolve particles in forced WebGL 2', async ({ page }) => {
  await page.goto('/?debug=1&backend=webgl2&quality=compatibility&experienceState=dissolving&charge=0.9996&dissolve=0.45');
  await waitForParticles(page);
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', 'webgl2');
  expect((await readStats(page)).activeCount).toBeGreaterThan(0);
});
