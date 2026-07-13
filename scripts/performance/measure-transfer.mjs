import { chromium } from '@playwright/test';

import { argument, ensureServer, LOCAL_URL, writeJson } from './browser-runtime.mjs';

const LIMIT_BYTES = 15 * 1024 * 1024;
const baseUrl = argument('url', LOCAL_URL);
const outputPath = argument('output', 'test-results/performance/transfer-size.json');
const stopServer = await ensureServer(baseUrl);
const browser = await chromium.launch({ headless: true });

function category(url) {
  const pathname = new URL(url).pathname;
  if (/\.m?js$/iu.test(pathname)) return 'program';
  if (/\.css$/iu.test(pathname)) return 'styles';
  if (pathname.includes('/characters/magical-girl/')) return 'magicalGirl';
  if (pathname.includes('/characters/moon-cat/')) return 'moonCat';
  if (pathname.includes('/audio/')) return 'audio';
  return 'other';
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  const requests = new Map();
  session.on('Network.responseReceived', ({ requestId, response, type }) => {
    if (new URL(response.url).pathname.endsWith('.map')) return;
    requests.set(requestId, {
      url: response.url,
      status: response.status,
      mimeType: response.mimeType,
      type,
      encodedBytes: 0,
    });
  });
  session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const request = requests.get(requestId);
    if (request) request.encodedBytes = encodedDataLength;
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[data-testid="enter-button"]:not([disabled])').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(250);

  const entries = [...requests.values()].filter(({ status, encodedBytes }) => status < 400 && encodedBytes > 0);
  const categories = {
    program: 0,
    styles: 0,
    magicalGirl: 0,
    moonCat: 0,
    audio: 0,
    other: 0,
  };
  for (const entry of entries) categories[category(entry.url)] += entry.encodedBytes;
  const totalEncodedBytes = Object.values(categories).reduce((sum, bytes) => sum + bytes, 0);
  const report = {
    measuredAt: new Date().toISOString(),
    url: baseUrl,
    cacheDisabled: true,
    readyState: await page.locator('body').getAttribute('data-experience-state'),
    limitBytes: LIMIT_BYTES,
    totalEncodedBytes,
    passes: totalEncodedBytes <= LIMIT_BYTES,
    categories,
    requests: entries.sort((left, right) => right.encodedBytes - left.encodedBytes),
  };
  const output = await writeJson(outputPath, report);
  console.log(`Transfer measurement written to ${output}`);
  console.log(JSON.stringify({ totalEncodedBytes, limitBytes: LIMIT_BYTES, passes: report.passes, categories }, null, 2));
  if (!report.passes) throw new Error(`Encoded transfer ${totalEncodedBytes} bytes exceeds ${LIMIT_BYTES} bytes`);
  await context.close();
} finally {
  await browser.close();
  await stopServer();
}
