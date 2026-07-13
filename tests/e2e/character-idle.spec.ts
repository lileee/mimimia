import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const waitForCharacters = (page: import('@playwright/test').Page) =>
  page.locator('body[data-character-ready="true"]').waitFor({ timeout: 15_000 });

for (const pose of ['min', 'idle', 'max'] as const) {
  test(`renders every character layer without seams at the ${pose} pose`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?debug=1&characterPose=${pose}&showCat=1`);
    await waitForCharacters(page);
    await expect(page.locator('body')).toHaveAttribute('data-girl-layer-count', '15');
    await expect(page.locator('body')).toHaveAttribute('data-cat-layer-count', '8');
    await expect(page.locator('body')).toHaveAttribute('data-character-pose', pose);

    const screenshot = await page.locator('#scene-canvas-host').screenshot();
    const stats = await sharp(screenshot).removeAlpha().stats();
    expect(stats.channels[0].max).toBeGreaterThan(220);
    expect(stats.channels[2].max).toBeGreaterThan(220);
  });
}

test('keeps the moon cat hidden before summoning by default', async ({ page }) => {
  await page.goto('/?debug=1');
  await waitForCharacters(page);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');
});
