import { describe, expect, it } from 'vitest';

import { QualityController, type QualityObservationContext } from '../../../src/quality/QualityController';

const context = (overrides: Partial<QualityObservationContext> = {}): QualityObservationContext => ({
  visible: true,
  focused: true,
  graphicsHealthy: true,
  state: 'idle',
  ...overrides,
});

function feedWindow(controller: QualityController, startMs: number, fps: number): number {
  const interval = 1_000 / fps;
  controller.observeFrame(startMs, context());
  let nowMs = startMs;
  while (nowMs - startMs < 5_000) {
    nowMs += interval;
    controller.observeFrame(nowMs, context());
  }
  return nowMs;
}

describe('QualityController initial benchmark', () => {
  it('uses the measured benchmark result unless a tier is forced', async () => {
    const automatic = new QualityController({ benchmark: { run: async () => 44.9 } });
    await expect(automatic.runInitialBenchmark()).resolves.toBe('balanced');

    const forced = new QualityController({
      benchmark: { run: async () => { throw new Error('must not run'); } },
      initialTier: 'high',
      forcedMode: true,
    });
    await expect(forced.runInitialBenchmark()).resolves.toBe('high');
  });
});

describe('QualityController runtime monitoring', () => {
  it('waits ten stable seconds and two low five-second windows before requesting one downgrade', () => {
    const controller = new QualityController({ benchmark: { run: async () => 60 }, initialTier: 'high' });
    controller.observeFrame(0, context());
    controller.observeFrame(9_999, context());
    expect(controller.getSnapshot().pendingDowngrade).toBe(false);

    let nowMs = feedWindow(controller, 10_000, 26);
    expect(controller.getSnapshot()).toMatchObject({ lowWindowCount: 1, pendingDowngrade: false });
    nowMs = feedWindow(controller, nowMs + 1, 26);
    expect(controller.getSnapshot()).toMatchObject({ lowWindowCount: 2, pendingDowngrade: true });
    expect(controller.applyPendingIfSafe('charging')).toBeNull();
    expect(controller.applyPendingIfSafe('charged')).toBeNull();
    expect(controller.applyPendingIfSafe('dissolving')).toBeNull();
    expect(controller.applyPendingIfSafe('summoning')).toBeNull();
    expect(controller.applyPendingIfSafe('idle')).toBe('balanced');
    expect(controller.getSnapshot()).toMatchObject({
      tier: 'balanced',
      lowWindowCount: 0,
      pendingDowngrade: false,
    });
  });

  it('uses consecutive windows, clears interrupted observation, and never upgrades', () => {
    const controller = new QualityController({ benchmark: { run: async () => 60 }, initialTier: 'balanced' });
    controller.observeFrame(0, context());
    feedWindow(controller, 10_000, 26);
    feedWindow(controller, 15_100, 35);
    expect(controller.getSnapshot()).toMatchObject({ tier: 'balanced', lowWindowCount: 0, pendingDowngrade: false });

    controller.observeFrame(21_000, context({ visible: false }));
    controller.observeFrame(40_000, context());
    feedWindow(controller, 50_000, 26);
    expect(controller.getSnapshot().lowWindowCount).toBe(1);
    controller.requestDowngrade();
    expect(controller.applyPendingIfSafe('complete')).toBe('compatibility');
    expect(controller.getSnapshot().tier).toBe('compatibility');
  });

  it('enforces a thirty-second cooldown and disables automatic changes when forced', () => {
    const controller = new QualityController({ benchmark: { run: async () => 60 }, initialTier: 'high' });
    controller.observeFrame(0, context());
    controller.requestDowngrade();
    expect(controller.applyPendingIfSafe('idle')).toBe('balanced');
    controller.requestDowngrade();
    controller.observeFrame(29_999, context());
    expect(controller.applyPendingIfSafe('idle')).toBeNull();
    controller.observeFrame(30_000, context());
    expect(controller.applyPendingIfSafe('idle')).toBe('compatibility');

    const forced = new QualityController({
      benchmark: { run: async () => 10 },
      initialTier: 'high',
      forcedMode: true,
    });
    forced.requestDowngrade();
    expect(forced.applyPendingIfSafe('idle')).toBeNull();
    expect(forced.getSnapshot()).toMatchObject({ tier: 'high', forcedMode: true, pendingDowngrade: false });
  });
});
