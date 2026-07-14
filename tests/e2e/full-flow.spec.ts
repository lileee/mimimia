import { expect, test } from '@playwright/test';

const state = (page: import('@playwright/test').Page, value: string, timeout = 8_000) =>
  expect(page.locator('body')).toHaveAttribute('data-experience-state', value, { timeout });

type StateHistoryWindow = Window & {
  __mimimiaStateHistory?: string[];
  __mimimiaStateObserver?: MutationObserver;
};

const installStateHistory = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const trackedWindow = window as StateHistoryWindow;
  const recordState = () => {
    const nextState = document.body.dataset.experienceState;
    if (!nextState || trackedWindow.__mimimiaStateHistory?.at(-1) === nextState) return;
    trackedWindow.__mimimiaStateHistory?.push(nextState);
  };

  trackedWindow.__mimimiaStateObserver?.disconnect();
  trackedWindow.__mimimiaStateHistory = [];
  recordState();
  trackedWindow.__mimimiaStateObserver = new MutationObserver(recordState);
  trackedWindow.__mimimiaStateObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-experience-state'],
  });
});

const stateHistory = (page: import('@playwright/test').Page) => page.evaluate(() =>
  [...((window as StateHistoryWindow).__mimimiaStateHistory ?? [])]);

const historyIncludes = (
  page: import('@playwright/test').Page,
  value: string,
  timeout = 8_000,
) => expect.poll(async () => (await stateHistory(page)).includes(value), { timeout }).toBe(true);

const canvasJson = async <T>(page: import('@playwright/test').Page, attribute: string): Promise<T> => {
  const value = await page.locator('canvas[data-render-surface]').getAttribute(attribute);
  if (!value) throw new Error(`Missing ${attribute}`);
  return JSON.parse(value) as T;
};

test('keeps the entire mouse, failure, summon, cat, sound, and reset flow coherent', async ({ browser, page }, testInfo) => {
  const automaticQuality = testInfo.project.name === 'chrome-stable' || testInfo.project.name === 'edge-stable';
  test.setTimeout(automaticQuality ? 240_000 : 120_000);
  const params = new URLSearchParams(automaticQuality ? {} : { quality: 'compatibility' });
  if (testInfo.project.name === 'chromium-webgl2') params.set('backend', 'webgl2');
  await page.goto(`/?${params}`);
  await installStateHistory(page);
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
  if (!automaticQuality) {
    await state(page, 'charging');
    await page.waitForTimeout(800);
  }
  await page.mouse.up();
  await historyIncludes(page, 'dissolving', automaticQuality ? 30_000 : 8_000);
  await state(page, 'idle', automaticQuality ? 30_000 : 8_000);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');

  await page.mouse.down();
  await state(page, 'charged', automaticQuality ? 30_000 : 6_000);
  await page.waitForTimeout(500);
  await state(page, 'charged');
  await page.mouse.up();
  if (automaticQuality) {
    // Hosted Windows runners can render at only a few frames per second. The
    // observer proves transient states occurred even when an action finishes
    // after the visible state has already advanced.
    await page.getByTestId('sound-button').click();
    await historyIncludes(page, 'summoning', 30_000);
    await state(page, 'complete', 60_000);
  } else {
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
  }
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'true');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
  await page.waitForTimeout(250);
  const leftGaze = await canvasJson<{ headDegrees: number; eyeOffsetFraction: number }>(page, 'data-cat');
  await page.mouse.move(bounds.x + bounds.width * 0.82, bounds.y + bounds.height * 0.62);
  await page.waitForTimeout(250);
  const rightGaze = await canvasJson<{ headDegrees: number; eyeOffsetFraction: number }>(page, 'data-cat');
  expect(rightGaze.headDegrees).toBeGreaterThan(leftGaze.headDegrees);
  expect(rightGaze.eyeOffsetFraction).toBeGreaterThan(leftGaze.eyeOffsetFraction);

  const matrixRecord = {
    measuredAt: new Date().toISOString(),
    project: testInfo.project.name,
    browserVersion: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    backend: await page.locator('body').getAttribute('data-render-backend'),
    quality: await page.locator('body').getAttribute('data-quality-tier'),
    checks: {
      rightClickIgnored: true,
      soundDidNotInterrupt: true,
      earlyReleaseDissolved: true,
      heldChargeStayedSafe: true,
      completedSummon: true,
      catStayedVisible: true,
      catFollowedPointer: true,
    },
  };
  await testInfo.attach('browser-matrix-record', {
    body: JSON.stringify(matrixRecord, null, 2),
    contentType: 'application/json',
  });
  console.log(`BROWSER_MATRIX_RECORD ${JSON.stringify(matrixRecord)}`);

  await page.getByTestId('reset-button').click();
  await state(page, 'idle', automaticQuality ? 30_000 : 3_000);
  await expect(page.locator('body')).toHaveAttribute('data-cat-visible', 'false');
  await expect(canvas).toHaveAttribute('data-particle-stats', /"activeCount":0/);
  await expect(canvas).toHaveAttribute('data-magic-circle', /"opacity":0/);
});
