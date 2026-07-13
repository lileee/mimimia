import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { arch, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';

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
const outputPath = argument('output', 'test-results/performance/summon-profile.json');
const headed = argument('headed', process.env.CI ? '0' : '1') === '1';
const requestedBackend = argument('backend');
const requestedQuality = argument('quality');
const requestedChannel = argument('channel');
const screenshotPath = argument('screenshot');
const stopServer = await ensureServer(baseUrl);
const browser = await chromium.launch({
  headless: !headed,
  channel: requestedChannel || undefined,
});

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const url = new URL(baseUrl);
  url.searchParams.set('performanceTest', '1');
  if (requestedBackend === 'webgl2') url.searchParams.set('backend', 'webgl2');
  if (['high', 'balanced', 'compatibility'].includes(requestedQuality)) {
    url.searchParams.set('quality', requestedQuality);
  }
  await enterExperience(page, url.href);
  await page.waitForTimeout(10_000);

  for (let cast = 1; cast <= 3; cast += 1) {
    await completeCast(page);
    if (cast < 3) await resetCast(page);
  }

  const result = await page.evaluate(() => {
    const hook = window.__mimimiaPerformanceTest;
    if (!hook) throw new Error('Performance hook unavailable');
    return { performance: hook.snapshot(), runtime: hook.runtimeSnapshot() };
  });
  let screenshot = null;
  if (screenshotPath) {
    screenshot = resolve(screenshotPath);
    await mkdir(dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: true });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    url: url.href,
    viewport: { width: 1920, height: 1080 },
    stableBeforeCastMs: 10_000,
    castCount: 3,
    headed,
    browser: {
      name: requestedChannel === 'chrome' ? 'Google Chrome' : 'Chromium',
      version: browser.version(),
      channel: requestedChannel || 'bundled',
    },
    host: { platform: platform(), release: release(), arch: arch(), memoryBytes: totalmem() },
    requestedBackend,
    requestedQuality,
    screenshot,
    consoleErrors,
    ...result,
  };
  const output = await writeJson(outputPath, report);
  console.log(`Summon profile written to ${output}`);
  console.log(JSON.stringify(report.performance, null, 2));
  if (!report.performance.complete || report.performance.summonCount !== 3) {
    throw new Error('Three-cast profile did not complete');
  }
  if (report.performance.averageFps < 30) {
    throw new Error(`Average FPS ${report.performance.averageFps.toFixed(2)} is below 30`);
  }
  if (!report.performance.passesStallBudget) {
    throw new Error(`Maximum frame gap ${report.performance.maxFrameGapMs.toFixed(1)} ms exceeds the 500 ms budget`);
  }
  if (consoleErrors.length > 0) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
  await stopServer();
}
