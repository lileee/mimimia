import { expect, test } from '@playwright/test';

test('warms all five first-cast states before entry and avoids a 500 ms preparation stall', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('/?quality=compatibility&performanceTest=1&testGate=benchmark');
  await page.locator('body[data-load-progress="1"]').waitFor({ timeout: 35_000 });
  await expect(page.locator('body')).toHaveAttribute('data-warmup-ready', 'true', { timeout: 25_000 });
  await expect(page.locator('body')).toHaveAttribute('data-warmup-frame-count', '12');
  await expect(page.locator('body')).toHaveAttribute(
    'data-warmup-states',
    'idle,charged,dissolving,summoning,complete',
  );
  await expect(page.getByTestId('enter-button')).toBeDisabled();
  await page.evaluate(() => {
    (window as typeof window & { __mimimiaReleaseGate?: () => void }).__mimimiaReleaseGate?.();
  });
  await expect(page.getByTestId('enter-button')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('enter-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-experience-state', 'idle');

  await page.mouse.down();
  await expect(page.locator('body')).toHaveAttribute('data-experience-state', 'charged', { timeout: 5_000 });
  await page.mouse.up();
  await expect(page.locator('body')).toHaveAttribute('data-experience-state', 'complete', { timeout: 6_000 });
  const snapshot = await page.evaluate(() => {
    const hook = (window as typeof window & {
      __mimimiaPerformanceTest?: { snapshot: () => {
        sampleCount: number;
        maxFrameGapMs: number;
        maxFrameGapState: string | null;
        maxWorkMs: number;
        maxWorkPhase: string | null;
        maxWorkState: string | null;
        passesStallBudget: boolean;
        summonCount: number;
        objects: Record<string, number> | null;
      } };
    }).__mimimiaPerformanceTest;
    if (!hook) throw new Error('Performance hook unavailable');
    return hook.snapshot();
  });
  expect(snapshot.sampleCount).toBeGreaterThan(0);
  expect(snapshot.maxFrameGapMs, JSON.stringify(snapshot)).toBeLessThan(500);
  expect(snapshot.passesStallBudget).toBe(true);
  expect(snapshot.summonCount).toBe(1);
  expect(snapshot.objects).toMatchObject({ poolCapacity: 1_200 });
});
