import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type Point = { x: number; y: number };
type VisualFrame = {
  faceCenter: Point;
  chestCenter: Point;
  magicCircleCenter: Point;
  magicCircleTop: Point;
  waistCenter: Point;
  moonCenter: Point;
  catCenter: Point;
};

const qualities = ['high', 'balanced', 'compatibility'] as const;
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
] as const;

async function openFrame(
  page: import('@playwright/test').Page,
  quality: typeof qualities[number],
  state: 'idle' | 'charged' | 'summoning' | 'complete',
  viewport: typeof viewports[number],
  hideParticles = false,
) {
  await page.setViewportSize(viewport);
  const params = new URLSearchParams({
    debug: '1', visualTest: '1', backend: 'webgl2', quality, experienceState: state,
    charge: state === 'idle' ? '0' : '1',
    summon: state === 'summoning' ? '0.5' : state === 'complete' ? '1' : '0',
    frameTimeMs: '12345',
    hideParticles: hideParticles ? '1' : '0',
  });
  await page.goto(`/?${params}`);
  const canvas = page.locator('canvas[data-render-surface]');
  await expect(canvas).toHaveAttribute('data-render-ready', 'true', { timeout: 45_000 });
  const points = JSON.parse(await canvas.getAttribute('data-safe-frame') ?? '{}') as VisualFrame;
  return { canvas, points };
}

function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

async function protectedHighlightRatio(
  baseline: Uint8Array,
  active: Uint8Array,
  points: VisualFrame,
  viewport: typeof viewports[number],
) {
  const base = await sharp(baseline).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const current = await sharp(active).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = viewport.height / 1080;
  const regions = [
    { center: points.faceCenter, halfWidth: 72 * scale, halfHeight: 66 * scale },
    { center: points.chestCenter, halfWidth: 92 * scale, halfHeight: 76 * scale },
  ];
  let protectedPixels = 0;
  let addedHighlights = 0;
  for (const region of regions) {
    const minX = Math.max(0, Math.floor(region.center.x - region.halfWidth));
    const maxX = Math.min(viewport.width - 1, Math.ceil(region.center.x + region.halfWidth));
    const minY = Math.max(0, Math.floor(region.center.y - region.halfHeight));
    const maxY = Math.min(viewport.height - 1, Math.ceil(region.center.y + region.halfHeight));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = (y * viewport.width + x) * 3;
        const red = current.data[index];
        const green = current.data[index + 1];
        const blue = current.data[index + 2];
        const delta = Math.max(
          Math.abs(red - base.data[index]),
          Math.abs(green - base.data[index + 1]),
          Math.abs(blue - base.data[index + 2]),
        );
        protectedPixels += 1;
        const baselineLuminance = (base.data[index] + base.data[index + 1] + base.data[index + 2]) / 3;
        const activeLuminance = (red + green + blue) / 3;
        if (
          delta > 100
          && activeLuminance - baselineLuminance > 85
          && blue > 185
          && green > 160
        ) addedHighlights += 1;
      }
    }
  }
  return addedHighlights / protectedPixels;
}

test('keeps landmarks and timing aligned within two CSS pixels across quality tiers', async ({ page }) => {
  test.setTimeout(150_000);
  for (const viewport of viewports) {
    const frames: Array<{ quality: typeof qualities[number]; points: VisualFrame; timing: unknown }> = [];
    for (const quality of qualities) {
      const { canvas, points } = await openFrame(page, quality, 'complete', viewport);
      frames.push({
        quality,
        points,
        timing: {
          circle: JSON.parse(await canvas.getAttribute('data-magic-circle') ?? '{}'),
          summon: JSON.parse(await canvas.getAttribute('data-summon') ?? '{}'),
        },
      });
    }
    const baseline = frames[0];
    for (const frame of frames.slice(1)) {
      for (const key of ['faceCenter', 'magicCircleCenter', 'moonCenter', 'catCenter'] as const) {
        expect(distance(frame.points[key], baseline.points[key]), `${viewport.width} ${frame.quality} ${key}`).toBeLessThanOrEqual(2);
      }
      expect(frame.timing).toEqual(baseline.timing);
    }
    expect(baseline.points.magicCircleTop.y).toBeGreaterThanOrEqual(baseline.points.waistCenter.y);
  }
});

test('keeps newly added highlights below eight percent of the face and chest regions', async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    for (const quality of qualities) {
      for (const state of ['charged', 'summoning'] as const) {
        const withoutParticles = await openFrame(page, quality, state, viewport, true);
        const baseline = await withoutParticles.canvas.screenshot();
        const active = await openFrame(page, quality, state, viewport);
        const screenshot = await active.canvas.screenshot();
        const ratio = await protectedHighlightRatio(baseline, screenshot, active.points, viewport);
        expect(ratio, `${viewport.width}×${viewport.height} ${quality} ${state}`).toBeLessThanOrEqual(0.08);
      }
    }
  }
});
