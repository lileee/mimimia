import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type PostProcessingSnapshot = {
  quality: string;
  renderPath: string;
  bloomStrength: number;
  bloomResolutionScale: number;
  distortion: string;
  distortionStrength: number;
  chromaticAberration: number;
  afterImage: boolean;
};

const waitForPost = (page: import('@playwright/test').Page) =>
  page.locator('body[data-postprocessing-ready="true"]').waitFor({ timeout: 20_000 });
const readPost = (page: import('@playwright/test').Page) => page.locator('canvas[data-render-surface]').evaluate((canvas) =>
  JSON.parse((canvas as HTMLCanvasElement).dataset.postprocessing ?? '{}') as PostProcessingSnapshot);

test('renders the charged frame through the exact three quality pipelines', async ({ page }) => {
  test.setTimeout(75_000);
  for (const [quality, expected] of [
    ['high', { distortion: 'full', afterImage: true, bloomResolutionScale: 0.5 }],
    ['balanced', { distortion: 'light', afterImage: false, bloomResolutionScale: 0.4 }],
    ['compatibility', { distortion: 'off', afterImage: false, bloomResolutionScale: 0.3 }],
  ] as const) {
    await page.goto(`/?debug=1&quality=${quality}&experienceState=charged&charge=1`);
    await waitForPost(page);
    const snapshot = await readPost(page);
    expect(snapshot).toMatchObject({ quality, renderPath: 'r185-render-pipeline', ...expected });
    const screenshot = await page.locator('#scene-canvas-host').screenshot();
    const stats = await sharp(screenshot).removeAlpha().stats();
    expect(Math.max(...stats.channels.slice(0, 3).map(({ max }) => max))).toBeGreaterThan(220);
    expect(stats.channels[2].mean).toBeGreaterThan(stats.channels[0].mean);
  }
});

test('renders the reveal peak and compatibility fallback in forced WebGL 2', async ({ page }) => {
  await page.goto('/?debug=1&backend=webgl2&quality=compatibility&experienceState=summoning&charge=1&summon=0.43');
  await waitForPost(page);
  await expect(page.locator('body')).toHaveAttribute('data-render-backend', 'webgl2');
  expect(await readPost(page)).toMatchObject({
    quality: 'compatibility',
    renderPath: 'r185-render-pipeline',
    distortion: 'off',
    afterImage: false,
  });
});
