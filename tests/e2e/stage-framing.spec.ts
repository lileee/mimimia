import { expect, test } from '@playwright/test';
import sharp from 'sharp';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
]) {
  test(`renders the moonlit stage and safe frame at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?debug=1');
    await page.locator('body[data-stage-ready="true"]').waitFor({ timeout: 15_000 });

    const safeFrame = await page.locator('canvas[data-render-surface]').evaluate((canvas) =>
      JSON.parse((canvas as HTMLCanvasElement).dataset.safeFrame ?? '{}'));
    expect(safeFrame.hatTip.y).toBeGreaterThanOrEqual(viewport.height * 0.03);
    expect(safeFrame.shoeBottom.y).toBeLessThanOrEqual(viewport.height * 0.97);
    expect(safeFrame.faceCenter.y).toBeLessThan(viewport.height * 0.5);
    expect(safeFrame.magicCircleCenter.y).toBeLessThan(viewport.height * 0.84);

    const screenshot = await page.locator('#scene-canvas-host').screenshot();
    const stats = await sharp(screenshot).removeAlpha().stats();
    expect(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.max))).toBeGreaterThan(170);
    expect(Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev))).toBeGreaterThan(8);
  });
}
