import { chromium } from '@playwright/test';

import {
  argument,
  completeCast,
  ensureServer,
  enterExperience,
  LOCAL_URL,
  resetCast,
  writeJson,
} from './browser-runtime.mjs';

const baseUrl = argument('url', LOCAL_URL);
const outputPath = argument('output', 'test-results/performance/reset-soak.json');
const iterations = Number(argument('iterations', '20'));
const headed = argument('headed', process.env.CI ? '0' : '1') === '1';
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('iterations must be a positive integer');
const stopServer = await ensureServer(baseUrl);
const browser = await chromium.launch({ headless: !headed, args: ['--js-flags=--expose-gc'] });

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const url = new URL(baseUrl);
  url.searchParams.set('performanceTest', '1');
  url.searchParams.set('quality', 'compatibility');
  await enterExperience(page, url.href);

  const checkpoints = [];
  const snapshot = async (iteration, phase) => page.evaluate(({ iterationValue, phaseValue }) => {
    const hook = window.__mimimiaPerformanceTest;
    if (!hook) throw new Error('Performance hook unavailable');
    return {
      iteration: iterationValue,
      phase: phaseValue,
      capturedAt: performance.now(),
      ...hook.runtimeSnapshot(),
    };
  }, { iterationValue: iteration, phaseValue: phase });

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    await completeCast(page);
    checkpoints.push(await snapshot(iteration, 'complete'));
    await resetCast(page);
  }
  await page.evaluate(() => window.gc?.());
  await page.waitForTimeout(30_000);
  await page.evaluate(() => window.gc?.());
  checkpoints.push(await snapshot(iterations, 'after-30-seconds'));

  const objectKeys = ['geometries', 'materials', 'textures', 'sceneObjects', 'poolCapacity'];
  const completeCheckpoints = checkpoints.filter(({ phase }) => phase === 'complete');
  const objectsStable = objectKeys.every((key) => {
    const values = completeCheckpoints.map(({ objects }) => objects?.[key] ?? null);
    return values.every((value) => value === values[0]);
  });
  const heapValues = checkpoints.map(({ heapUsedBytes }) => heapUsedBytes).filter(Number.isFinite);
  const heapStable = heapValues.length === 0 || heapValues.at(-1) <= Math.max(heapValues[0] * 1.5, heapValues[0] + 16 * 1024 * 1024);
  const report = {
    measuredAt: new Date().toISOString(),
    url: url.href,
    viewport: { width: 1920, height: 1080 },
    iterations,
    headed,
    settlingMs: 30_000,
    objectsStable,
    heapStable,
    checkpoints,
  };
  const output = await writeJson(outputPath, report);
  console.log(`Reset soak written to ${output}`);
  console.log(JSON.stringify({ iterations, objectsStable, heapStable, final: checkpoints.at(-1) }, null, 2));
  if (!objectsStable) throw new Error('Runtime object counts grew during the reset soak');
  if (!heapStable) throw new Error('JavaScript heap did not return to a stable range');
  await context.close();
} finally {
  await browser.close();
  await stopServer();
}
