import { expect, test } from '@playwright/test';

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;
const qualities = ['high', 'balanced', 'compatibility'] as const;
const states = [
  { name: 'idle', state: 'idle', charge: 0, dissolve: 0, summon: 0 },
  { name: 'charging-mid', state: 'charging', charge: 0.5, dissolve: 0, summon: 0 },
  { name: 'charged', state: 'charged', charge: 1, dissolve: 0, summon: 0 },
  { name: 'dissolving-mid', state: 'dissolving', charge: 0.78, dissolve: 0.5, summon: 0 },
  { name: 'summoning-mid', state: 'summoning', charge: 1, dissolve: 0, summon: 0.5 },
  { name: 'complete', state: 'complete', charge: 1, dissolve: 0, summon: 1 },
] as const;

for (const viewport of viewports) {
  for (const quality of qualities) {
    for (const frame of states) {
      test(`${viewport.name} ${quality} ${frame.name}`, async ({ page }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const params = new URLSearchParams({
          debug: '1',
          visualTest: '1',
          backend: 'webgl2',
          quality,
          experienceState: frame.state,
          charge: String(frame.charge),
          dissolve: String(frame.dissolve),
          summon: String(frame.summon),
          frameTimeMs: '12345',
        });
        await page.goto(`/?${params}`);
        await expect(page.locator('canvas[data-render-surface]')).toHaveAttribute('data-render-ready', 'true', { timeout: 45_000 });
        await expect(page).toHaveScreenshot(
          [viewport.name, quality, `${frame.name}.png`],
          { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.003, threshold: 0.2 },
        );
      });
    }
  }
}
